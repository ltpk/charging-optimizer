import { lsGet, lsSet, LS_SOLAR } from './storage'
import type { GeoCoords, Params, SolarData } from '../types'

interface ForecastSolarResponse {
  result?: { watts?: Record<string, number> }
}

export function getSolarForDt(solarData: SolarData, dt: Date): number {
  return solarData[dt.toISOString().slice(0, 13)] ?? 0
}

export function loadCachedSolar(): SolarData | null {
  const cached = lsGet<{ date: string; data: SolarData }>(LS_SOLAR)
  return cached?.date === new Date().toISOString().slice(0, 10) ? cached.data : null
}

export async function fetchSolarData(
  coords: GeoCoords,
  params: Pick<Params, 'solarDec' | 'solarAz' | 'solarKwp'>
): Promise<SolarData> {
  const { lat, lon } = coords
  const { solarDec, solarAz, solarKwp } = params
  const url = `https://api.forecast.solar/estimate/${lat}/${lon}/${solarDec}/${solarAz}/${solarKwp}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json() as ForecastSolarResponse

  const data: SolarData = {}
  for (const [ts, w] of Object.entries(json.result?.watts ?? {})) {
    const dt = new Date(ts.replace(' ', 'T'))
    if (!isNaN(dt.getTime())) data[dt.toISOString().slice(0, 13)] = w
  }

  lsSet(LS_SOLAR, { date: new Date().toISOString().slice(0, 10), data })
  return data
}
