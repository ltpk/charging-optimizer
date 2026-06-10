import { lsGet, lsSet, LS_SOLAR, localDateStr } from './storage'
import type { GeoCoords, Params, SolarData } from '../types'

type SolarParams = Pick<Params, 'solarDec' | 'solarAz' | 'solarKwp'>

interface ForecastSolarResponse {
  result?: { watts?: Record<string, number> }
}

// identifies the location + panel setup a forecast was fetched for — a cached
// forecast is only valid while this key matches
export function solarCacheKey(coords: GeoCoords | null, params: SolarParams): string | null {
  if (!coords) return null
  return `${coords.lat},${coords.lon}|${params.solarDec}|${params.solarAz}|${params.solarKwp}`
}

export function getSolarForDt(solarData: SolarData, dt: Date): number {
  return solarData[dt.toISOString().slice(0, 13)] ?? 0
}

export function loadCachedSolar(coords: GeoCoords | null, params: SolarParams): SolarData | null {
  const cached = lsGet<{ date: string; key: string; data: SolarData }>(LS_SOLAR)
  const key = solarCacheKey(coords, params)
  return cached?.date === localDateStr() && key !== null && cached.key === key ? cached.data : null
}

export async function fetchSolarData(coords: GeoCoords, params: SolarParams): Promise<SolarData> {
  const { lat, lon } = coords
  const { solarDec, solarAz, solarKwp } = params
  const url = `https://api.forecast.solar/estimate/${lat}/${lon}/${solarDec}/${solarAz}/${solarKwp}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as ForecastSolarResponse

  const data: SolarData = {}
  for (const [ts, w] of Object.entries(json.result?.watts ?? {})) {
    const dt = new Date(ts.replace(' ', 'T'))
    if (!isNaN(dt.getTime())) data[dt.toISOString().slice(0, 13)] = w
  }

  lsSet(LS_SOLAR, { date: localDateStr(), key: solarCacheKey(coords, params), data })
  return data
}
