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
  // UI azimuth is compass convention (0=N 90=E 180=S 270=W); Forecast.Solar wants -180…180 with 0=S
  const apiAz = solarAz - 180
  const url = `https://api.forecast.solar/estimate/${lat}/${lon}/${solarDec}/${apiAz}/${solarKwp}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as ForecastSolarResponse

  // the API's watts values are instantaneous power at each timestamp (sunrise, top of hour,
  // sunset) — integrate the piecewise-linear curve into per-hour averages so an hour's value
  // is the energy actually produced in it, not the power at its first instant
  const pts = Object.entries(json.result?.watts ?? {})
    .map(([ts, w]) => ({ t: new Date(ts.replace(' ', 'T')).getTime(), w }))
    .filter(p => !isNaN(p.t))
    .sort((a, b) => a.t - b.t)

  const data: SolarData = {}
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (b.t <= a.t || (a.w === 0 && b.w === 0)) continue
    const slope = (b.w - a.w) / (b.t - a.t)
    for (let hour = Math.floor(a.t / 3_600_000) * 3_600_000; hour < b.t; hour += 3_600_000) {
      const s = Math.max(a.t, hour)
      const e = Math.min(b.t, hour + 3_600_000)
      if (e <= s) continue
      const avgW = a.w + slope * ((s + e) / 2 - a.t)
      const key = new Date(hour).toISOString().slice(0, 13)
      data[key] = (data[key] ?? 0) + (avgW * (e - s)) / 3_600_000
    }
  }

  lsSet(LS_SOLAR, { date: localDateStr(), key: solarCacheKey(coords, params), data })
  return data
}
