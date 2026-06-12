import { getSolarForDt } from './solar'
import type { Params, PriceEntry, SlotEntry, SolarData, OptimizeResult } from '../types'

export const ALV = 1.255

// market time unit: 15-minute slots
export const SLOT_MS = 900_000
export const SLOT_H = 0.25

export const slotTs = (dt: Date): string => dt.toISOString().slice(0, 16)

const EPS = 1e-9
// minimum usable fraction of the in-progress slot (~3.75 min) — below this, charging waits for the next slot
const MIN_SLOT_CAPACITY = 0.25 * SLOT_H

export const DEFAULT_PARAMS: Params = {
  socNow: 50,
  socTarget: 80,
  batteryCapacity: 77,
  chargingLoss: 11,
  chargingPower: 5.5,
  consecutive: true,
  horizonH: 24,
  chargeByEnabled: false,
  chargeByHour: 7,
  chargeByDay: 1,
  transferDay: 5.11,
  transferNight: 3.12,
  buyMargin: 0.54,
  sellMargin: 0.25,
  solarDec: 30,
  solarAz: 180,
  solarKwp: 5.92,
  solarEnabled: false,
}

function calcHours(p: Params): number {
  const energyToCharge = ((p.socTarget - p.socNow) / 100) * p.batteryCapacity
  const gridEnergy = energyToCharge / (1 - p.chargingLoss / 100)
  return Math.max(0, gridEnergy / p.chargingPower)
}

export function isNightHour(hour: number): boolean {
  return hour >= 22 || hour < 7
}

function getTransfer(p: Params, hour: number): number {
  return isNightHour(hour) ? p.transferNight : p.transferDay
}

function solarShare(p: Params, solarW: number): number {
  return Math.min(solarW / (p.chargingPower * 1000), 1.0)
}

// usable charging time of a slot in hours: SLOT_H for future slots, the remaining fraction for the current slot
function slotCapacity(dt: Date, now: Date): number {
  const end = dt.getTime() + SLOT_MS
  if (end <= now.getTime()) return 0
  if (dt.getTime() >= now.getTime()) return SLOT_H
  return (end - now.getTime()) / 3_600_000
}

export function calcNetCost(p: Params, spotCent: number, hour: number, solarW: number): number {
  const share = solarShare(p, solarW)
  const buyPrice = (1 - share) * (spotCent + getTransfer(p, hour) + p.buyMargin * ALV)
  const sellPrice = Math.max(0, spotCent / ALV - p.sellMargin)
  return buyPrice - share * sellPrice
}

export function optimize(
  priceData: PriceEntry[],
  solarData: SolarData,
  params: Params,
  now: Date = new Date(),
): OptimizeResult | null {
  if (!priceData.length) return null

  const hoursNeeded = calcHours(params)
  const nHours = Math.ceil(hoursNeeded)

  const pastCutoff = new Date(now.getTime() - 6 * 3_600_000)

  const horizonCutoff = new Date(now.getTime() + params.horizonH * 3_600_000)

  const slots: SlotEntry[] = priceData
    .filter(h => h.dt >= pastCutoff && h.dt <= horizonCutoff)
    .map(h => {
      const solarW = params.solarEnabled ? getSolarForDt(solarData, h.dt) : 0
      return { ...h, netCost: calcNetCost(params, h.spotCent, h.hour, solarW), solarW }
    })

  if (!slots.length) return null

  let deadlineDt: Date | null = null
  let deadlinePassed = false
  if (params.chargeByEnabled) {
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + params.chargeByDay,
      params.chargeByHour,
    )
    deadlinePassed = candidate.getTime() <= now.getTime()
    deadlineDt = new Date(Math.min(candidate.getTime(), horizonCutoff.getTime()))
  }

  // candidates: slots with usable charging capacity left (the in-progress slot counts
  // only for its remaining fraction, and is dropped once it's nearly over)
  const candidates = slots.filter(
    h => slotCapacity(h.dt, now) >= MIN_SLOT_CAPACITY && (!deadlineDt || h.dt < deadlineDt),
  )

  // net-cost spread across the upcoming candidate slots — anchors the HourList bars to an absolute scale
  const futureNet = candidates.map(h => h.netCost)
  const netCostMin = futureNet.length ? Math.min(...futureNet) : 0
  const netCostMax = futureNet.length ? Math.max(...futureNet) : 0

  let selectedList: SlotEntry[] = []
  if (hoursNeeded > EPS && candidates.length) {
    if (params.consecutive) {
      // exact-cost scan (n ≤ ~300): from each start, walk forward consuming hoursNeeded at
      // per-slot capacity; prefer the most achievable window, then the cheapest, then the earliest
      let bestCost = Infinity,
        bestAchieved = -1
      for (let i = 0; i < candidates.length; i++) {
        let remaining = hoursNeeded,
          cost = 0
        let end = i
        for (let j = i; j < candidates.length && remaining > EPS; j++) {
          const h = candidates[j]
          const used = Math.min(slotCapacity(h.dt, now), remaining)
          cost += used * h.netCost
          remaining -= used
          end = j + 1
        }
        const achieved = hoursNeeded - remaining
        if (achieved > bestAchieved + EPS || (achieved > bestAchieved - EPS && cost < bestCost - EPS)) {
          bestAchieved = achieved
          bestCost = cost
          selectedList = candidates.slice(i, end)
        }
      }
    } else {
      // cheapest individual slots until their combined capacity covers the need
      const sorted = [...candidates].sort((a, b) => a.netCost - b.netCost)
      let remaining = hoursNeeded
      for (const h of sorted) {
        if (remaining <= EPS) break
        selectedList.push(h)
        remaining -= slotCapacity(h.dt, now)
      }
      selectedList.sort((a, b) => a.dt.getTime() - b.dt.getTime())
    }
  }

  const selectedTs = new Set(selectedList.map(h => h.ts))

  const currentSlot =
    slots.find(h => h.dt.getTime() <= now.getTime() && now.getTime() < h.dt.getTime() + SLOT_MS) ?? slots[0]

  // usage walk: consume hoursNeeded chronologically over the selected slots (the current
  // slot starts at `now`, the last slot is used only partially) — yields the actual
  // energy-weighted cost, the grid-only baseline for solar savings, and the completion time
  let remaining = hoursNeeded
  let costSum = 0,
    gridSum = 0,
    shareSum = 0
  let completionTime: Date | null = null
  for (const h of selectedList) {
    const startMs = Math.max(h.dt.getTime(), now.getTime())
    const used = Math.min(slotCapacity(h.dt, now), remaining)
    costSum += used * h.netCost
    gridSum += used * calcNetCost(params, h.spotCent, h.hour, 0)
    shareSum += used * solarShare(params, h.solarW)
    remaining -= used
    completionTime = new Date(startMs + used * 3_600_000)
    if (remaining <= EPS) break
  }

  // a tight deadline/horizon (or a partial current slot) can fit fewer hours than needed
  const achievableHours = hoursNeeded - remaining
  const totalCost = (costSum * params.chargingPower) / 100
  const avgNetCost = achievableHours > EPS ? costSum / achievableHours : 0
  const solarSavings = Math.max(0, ((gridSum - costSum) * params.chargingPower) / 100)
  const solarPct = achievableHours > EPS ? (shareSum / achievableHours) * 100 : 0

  const nowTs = slotTs(new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS))

  return {
    slots,
    selectedList,
    selectedTs,
    currentSlot,
    hoursNeeded,
    achievableHours,
    kWhNeeded: hoursNeeded * params.chargingPower,
    completionTime,
    deadlinePassed,
    nHours,
    totalCost,
    nowIdx: slots.findIndex(h => h.ts === nowTs),
    slotSources: slots.map(h => h.source === 'actual'),
    netCostMin,
    netCostMax,
    solarNow: params.solarEnabled ? getSolarForDt(solarData, now) : 0,
    solarPct,
    solarSavings,
    avgNetCost,
  }
}
