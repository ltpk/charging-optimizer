import { describe, expect, test } from 'bun:test'
import { ALV, DEFAULT_PARAMS, SLOT_MS, calcNetCost, isNightHour, optimize } from './optimization'
import type { Params, PriceEntry, SolarData } from '../types'

// 0→100% of 10 kWh, no loss, 5 kW → exactly 2.0 h needed; flat 1 c/kWh transfer, no margins
const baseParams: Params = {
  ...DEFAULT_PARAMS,
  socNow: 0,
  socTarget: 100,
  batteryCapacity: 10,
  chargingLoss: 0,
  chargingPower: 5,
  consecutive: true,
  horizonH: 24,
  chargeByEnabled: false,
  transferDay: 1,
  transferNight: 1,
  buyMargin: 0,
  sellMargin: 0,
  solarEnabled: false,
}

const NOON = new Date(2026, 5, 10, 12, 0) // local Wed 2026-06-10 12:00

function entry(dt: Date, spotCent: number): PriceEntry {
  return { dt, spotCent, hour: dt.getHours(), ts: dt.toISOString().slice(0, 16), source: 'actual' }
}

// four flat 15-min slots per hourly price, starting at local `startHour` on 2026-06-10
function prices(startHour: number, spots: number[]): PriceEntry[] {
  return spots.flatMap((s, i) => [0, 15, 30, 45].map(m => entry(new Date(2026, 5, 10, startHour + i, m), s)))
}

// 15-min slots with explicit per-quarter prices
function quarterPrices(startHour: number, spots: number[]): PriceEntry[] {
  const startMs = new Date(2026, 5, 10, startHour).getTime()
  return spots.map((s, i) => entry(new Date(startMs + i * SLOT_MS), s))
}

type Result = NonNullable<ReturnType<typeof optimize>>
// distinct clock hours covered by the selection
const selectedHours = (r: Result) => [...new Set(r.selectedList.map(h => h.dt.getHours()))]
// slot start times as "H:MM"
const selectedStarts = (r: Result) =>
  r.selectedList.map(h => `${h.dt.getHours()}:${String(h.dt.getMinutes()).padStart(2, '0')}`)

describe('isNightHour', () => {
  test('night rate covers 22:00–07:00', () => {
    expect(isNightHour(21)).toBe(false)
    expect(isNightHour(22)).toBe(true)
    expect(isNightHour(6)).toBe(true)
    expect(isNightHour(7)).toBe(false)
  })
})

describe('calcNetCost', () => {
  const p: Params = { ...baseParams, transferDay: 5, transferNight: 3, buyMargin: 0.5, sellMargin: 0.25 }

  test('grid-only: spot + transfer + VAT-inclusive margin', () => {
    expect(calcNetCost(p, 10, 12, 0)).toBeCloseTo(10 + 5 + 0.5 * ALV, 10)
    expect(calcNetCost(p, 10, 23, 0)).toBeCloseTo(10 + 3 + 0.5 * ALV, 10)
  })

  test('full solar coverage: pay nothing, lose the sell-back value', () => {
    const full = p.chargingPower * 1000
    expect(calcNetCost(p, 10, 12, full)).toBeCloseTo(-(10 / ALV - 0.25), 10)
  })

  test('solar share is clamped at 100%', () => {
    const full = p.chargingPower * 1000
    expect(calcNetCost(p, 10, 12, full * 2)).toBeCloseTo(calcNetCost(p, 10, 12, full), 10)
  })

  test('sell price floors at zero on negative spot', () => {
    expect(calcNetCost(p, -1, 12, p.chargingPower * 1000)).toBeCloseTo(0, 10)
  })
})

describe('optimize', () => {
  test('battery already full → empty plan', () => {
    const r = optimize(prices(12, [5, 5, 5]), {}, { ...baseParams, socNow: 80, socTarget: 80 }, NOON)!
    expect(r.nHours).toBe(0)
    expect(r.selectedList).toHaveLength(0)
    expect(r.completionTime).toBeNull()
    expect(r.achievableHours).toBe(0)
    expect(r.totalCost).toBe(0)
  })

  test('hoursNeeded accounts for charging loss', () => {
    const p = { ...baseParams, socNow: 50, socTarget: 80, batteryCapacity: 77, chargingLoss: 11, chargingPower: 5.5 }
    const r = optimize(prices(12, Array(10).fill(5)), {}, p, NOON)!
    expect(r.hoursNeeded).toBeCloseTo((0.3 * 77) / 0.89 / 5.5, 6)
  })

  test('consecutive mode picks the cheapest contiguous window', () => {
    const r = optimize(prices(12, [10, 10, 2, 2, 10, 10]), {}, baseParams, NOON)!
    expect(selectedHours(r)).toEqual([14, 15])
    expect(r.selectedList).toHaveLength(8)
    expect(r.completionTime).toEqual(new Date(2026, 5, 10, 16, 0))
    expect(r.avgNetCost).toBeCloseTo(3, 10) // spot 2 + transfer 1
    expect(r.totalCost).toBeCloseTo((3 * 2 * 5) / 100, 10)
    expect(r.achievableHours).toBeCloseTo(2, 10)
  })

  test('individual mode picks the cheapest non-contiguous hours', () => {
    const r = optimize(prices(12, [1, 10, 2, 10, 10]), {}, { ...baseParams, consecutive: false }, NOON)!
    expect(selectedHours(r)).toEqual([12, 14])
    expect(r.selectedList).toHaveLength(8)
    expect(r.completionTime).toEqual(new Date(2026, 5, 10, 15, 0))
  })

  test('individual mode catches a sub-hour price dip', () => {
    const p = { ...baseParams, batteryCapacity: 2.5, consecutive: false } // need 0.5 h
    const r = optimize(quarterPrices(12, [10, 1, 1, 10, 10, 10, 10, 10]), {}, p, NOON)!
    expect(selectedStarts(r)).toEqual(['12:15', '12:30'])
    expect(r.completionTime).toEqual(new Date(2026, 5, 10, 12, 45))
  })

  test('partial current slot counts only its remaining fraction', () => {
    const fivePast = new Date(2026, 5, 10, 12, 5)
    const r = optimize(prices(12, [5, 5, 5]), {}, baseParams, fivePast)!
    // window starting now: 10 min of the current slot + 7 full slots + 5 min of the 9th
    expect(r.selectedList).toHaveLength(9)
    expect(r.achievableHours).toBeCloseTo(2, 10)
    expect(r.completionTime).toEqual(new Date(2026, 5, 10, 14, 5))
    expect(r.totalCost).toBeCloseTo((6 * 2 * 5) / 100, 10) // flat 6 c/kWh × 2 h × 5 kW
  })

  test('current slot is dropped once under ~4 minutes remain', () => {
    const lateInSlot = new Date(2026, 5, 10, 12, 12)
    const p = { ...baseParams, batteryCapacity: 2.5 } // need 0.5 h
    const r = optimize(quarterPrices(12, [1, 5, 5, 5, 5, 5, 5, 5]), {}, p, lateInSlot)!
    expect(selectedStarts(r)).toEqual(['12:15', '12:30'])
    expect(r.completionTime).toEqual(new Date(2026, 5, 10, 12, 45))
  })

  test('cheaper later window beats starting immediately', () => {
    const halfPast = new Date(2026, 5, 10, 12, 30)
    const r = optimize(prices(12, [5, 5, 1, 1, 5]), {}, baseParams, halfPast)!
    expect(selectedHours(r)).toEqual([14, 15])
    expect(r.completionTime).toEqual(new Date(2026, 5, 10, 16, 0))
  })

  test('deadline truncates the plan and reports the shortfall', () => {
    const p = { ...baseParams, batteryCapacity: 15, chargeByEnabled: true, chargeByDay: 0, chargeByHour: 14 } // need 3 h
    const r = optimize(prices(12, [5, 5, 5, 5, 5]), {}, p, NOON)!
    expect(r.deadlinePassed).toBe(false)
    expect(selectedHours(r)).toEqual([12, 13])
    expect(r.achievableHours).toBeCloseTo(2, 10)
    expect(r.hoursNeeded).toBeCloseTo(3, 10)
  })

  test('deadline in the past → flagged, nothing scheduled', () => {
    const p = { ...baseParams, chargeByEnabled: true, chargeByDay: 0, chargeByHour: 10 }
    const r = optimize(prices(12, [5, 5, 5]), {}, p, NOON)!
    expect(r.deadlinePassed).toBe(true)
    expect(r.selectedList).toHaveLength(0)
    expect(r.achievableHours).toBe(0)
  })

  test('solar-covered hour wins and is reported in coverage/savings', () => {
    const p = { ...baseParams, batteryCapacity: 5, consecutive: false, solarEnabled: true } // need 1 h
    const data = prices(12, [5, 5, 5])
    // solar data is keyed per hour — 13:00 fully solar-covered
    const solar: SolarData = { [new Date(2026, 5, 10, 13).toISOString().slice(0, 13)]: p.chargingPower * 1000 }
    const r = optimize(data, solar, p, NOON)!
    expect(selectedHours(r)).toEqual([13])
    expect(r.selectedList).toHaveLength(4)
    expect(r.solarPct).toBeCloseTo(100, 6)
    expect(r.solarSavings).toBeGreaterThan(0)
  })

  test('solar disabled zeroes solar influence', () => {
    const data = prices(12, [5, 5, 5])
    const solar: SolarData = { [new Date(2026, 5, 10, 13).toISOString().slice(0, 13)]: 99999 }
    const r = optimize(data, solar, { ...baseParams, solarEnabled: false }, NOON)!
    expect(r.solarNow).toBe(0)
    expect(r.solarPct).toBe(0)
    expect(r.slots.every(h => h.solarW === 0)).toBe(true)
  })

  test('reports savings vs charging straight through from now', () => {
    const r = optimize(prices(12, [10, 10, 2, 2, 10, 10]), {}, baseParams, NOON)!
    // optimal: hours 14–15 at net 3 → 0.30 €; charge-now: hours 12–13 at net 11 → 1.10 €
    expect(r.savingsVsNow).toBeCloseTo(((11 - 3) * 2 * 5) / 100, 10)
  })

  test('no savings when the cheapest window already starts now', () => {
    const r = optimize(prices(12, [2, 2, 10, 10]), {}, baseParams, NOON)!
    expect(selectedHours(r)).toEqual([12, 13])
    expect(r.savingsVsNow).toBeCloseTo(0, 10)
  })

  test('netCostMin/netCostMax span the candidate slots', () => {
    const r = optimize(prices(12, [10, 2, 6]), {}, baseParams, NOON)!
    expect(r.netCostMin).toBeCloseTo(3, 10)
    expect(r.netCostMax).toBeCloseTo(11, 10)
  })

  test('returns null without price data', () => {
    expect(optimize([], {}, baseParams, NOON)).toBeNull()
  })
})
