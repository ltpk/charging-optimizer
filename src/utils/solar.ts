import { lsGet, lsSet, LS_SOLAR, localDateStr } from './storage'
import type { GeoCoords, Params, SolarData } from '../types'

type SolarParams = Pick<Params, 'solarDec' | 'solarAz' | 'solarKwp'>

// performance ratio: PV system losses (inverter, temperature, wiring, soiling)
// applied to the ideal kWp × irradiance output. 0.85 is a typical real-world value.
const PERFORMANCE_RATIO = 0.85

interface OpenMeteoResponse {
  hourly?: { time?: string[]; global_tilted_irradiance?: number[] }
}

// coords are user-editable strings — only fetch/cache when both parse to finite numbers
export function isValidGeo(coords: GeoCoords | null): coords is GeoCoords {
  return !!coords && Number.isFinite(parseFloat(coords.lat)) && Number.isFinite(parseFloat(coords.lon))
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
  // UI azimuth is compass convention (0=N 90=E 180=S 270=W); Open-Meteo wants 0=S, -90=E, 90=W
  const apiAz = solarAz - 180
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=global_tilted_irradiance&tilt=${solarDec}&azimuth=${apiAz}` +
    `&timezone=auto&forecast_days=2`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as OpenMeteoResponse

  const times = json.hourly?.time ?? []
  const gti = json.hourly?.global_tilted_irradiance ?? []

  const data: SolarData = {}
  for (let i = 0; i < times.length; i++) {
    const g = gti[i]
    if (g == null || g <= 0) continue
    // Open-Meteo radiation at timestamp T is the mean over the preceding hour [T-1h, T);
    // the app keys each hour by its start, so shift the label back one hour
    const start = new Date(times[i].replace(' ', 'T'))
    start.setHours(start.getHours() - 1)
    // ideal output kWp × (GTI / 1000) in kW → watts, derated by the performance ratio
    const watts = solarKwp * g * PERFORMANCE_RATIO
    data[start.toISOString().slice(0, 13)] = watts
  }

  lsSet(LS_SOLAR, { date: localDateStr(), key: solarCacheKey(coords, params), data })
  return data
}
