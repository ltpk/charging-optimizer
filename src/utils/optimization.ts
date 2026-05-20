import { getSolarForDt } from './solar'
import type { Params, PriceEntry, HourEntry, SolarData, OptimizeResult } from '../types'

export const ALV = 1.255

export const DEFAULT_PARAMS: Params = {
  socNow:          50,
  socTarget:       80,
  batteryCapacity: 77,
  chargingLoss:    11,
  chargingPower:   5.5,
  consecutive:     true,
  horizonH:        24,
  transferDay:     5.11,
  transferNight:   3.12,
  buyMargin:       0.54,
  sellMargin:      0.25,
  solarDec:        30,
  solarAz:         180,
  solarKwp:        5.92,
  solarEnabled:    false,
}

function calcHours(p: Params): number {
  const energyToCharge = (p.socTarget - p.socNow) / 100 * p.batteryCapacity
  const gridEnergy     = energyToCharge / (1 - p.chargingLoss / 100)
  return Math.max(0, gridEnergy / p.chargingPower)
}

function getTransfer(p: Params, hour: number): number {
  return (hour >= 22 || hour < 7) ? p.transferNight : p.transferDay
}

export function calcNetCost(p: Params, spotCent: number, hour: number, solarW: number): number {
  const solarShare = Math.min(solarW / (p.chargingPower * 1000), 1.0)
  const buyPrice   = (1 - solarShare) * (spotCent + getTransfer(p, hour) + p.buyMargin * ALV)
  const sellPrice  = Math.max(0, spotCent / ALV - p.sellMargin)
  return buyPrice - solarShare * sellPrice
}

export function optimize(
  priceData: PriceEntry[],
  solarData: SolarData,
  params: Params,
): OptimizeResult | null {
  if (!priceData.length) return null

  const hoursNeeded = calcHours(params)
  const nHours      = Math.ceil(hoursNeeded)

  const now           = new Date()
  const pastCutoff    = new Date(now.getTime() - 6 * 3_600_000)

  const horizonCutoff = new Date(now.getTime() + params.horizonH * 3_600_000)

  const hours: HourEntry[] = priceData
    .filter(h => h.dt >= pastCutoff && h.dt <= horizonCutoff)
    .map(h => {
      const solarW = params.solarEnabled ? getSolarForDt(solarData, h.dt) : 0
      return { ...h, netCost: calcNetCost(params, h.spotCent, h.hour, solarW), solarW }
    })

  if (!hours.length) return null

  const nowHour     = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
  const futureHours = hours.filter(h => h.dt >= nowHour)

  let selectedList: HourEntry[]
  if (params.consecutive) {
    const windowSize = Math.min(nHours, futureHours.length)
    let bestStart = 0, bestSum = Infinity
    if (windowSize > 0) {
      let sum = futureHours.slice(0, windowSize).reduce((a, h) => a + h.netCost, 0)
      bestSum = sum
      for (let i = 1; i <= futureHours.length - windowSize; i++) {
        sum += futureHours[i + windowSize - 1].netCost - futureHours[i - 1].netCost
        if (sum < bestSum) { bestSum = sum; bestStart = i }
      }
    }
    selectedList = futureHours.slice(bestStart, bestStart + windowSize)
  } else {
    const sorted = [...futureHours].sort((a, b) => a.netCost - b.netCost)
    selectedList = sorted.slice(0, Math.min(nHours, futureHours.length)).sort((a, b) => a.dt.getTime() - b.dt.getTime())
  }

  const selectedTs = new Set(selectedList.map(h => h.ts))

  const currentHour = hours.find(h => {
    const end = new Date(h.dt)
    end.setHours(end.getHours() + 1)
    return h.dt <= now && now < end
  }) ?? hours[0]

  const avgNetto  = selectedList.length > 0
    ? selectedList.reduce((s, h) => s + h.netCost, 0) / selectedList.length
    : 0
  const totalCost = avgNetto * hoursNeeded * params.chargingPower / 100

  const nowTs = now.toISOString().slice(0, 13)

  return {
    hours,
    selectedList,
    selectedTs,
    currentHour,
    hoursNeeded,
    nHours,
    totalCost,
    nowIdx:      hours.findIndex(h => h.ts === nowTs),
    hourSources: hours.map(h => h.source === 'actual'),
    solarNow:    getSolarForDt(solarData, now),
  }
}
