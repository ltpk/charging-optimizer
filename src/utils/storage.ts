export const LS_COLOR_MODE = 'ev_color_mode'
// v5: entries are 15-min slots (was: hourly averages)
export const LS_SPOT = 'ev_spot_v5'
// v6: spotCent computed from PriceNoTax × ALV (cached v5 values carry the pre-rounded PriceWithTax)
export const LS_SPOT_ACTUAL = 'ev_spot_actual_v6'
// v6: values are now per-hour averages (was: instantaneous watts at the hour start)
export const LS_SOLAR = 'ev_solar_v6'
export const LS_GEO = 'ev_geo'
export const LS_PARAMS = 'ev_params_v6'
export const LS_NOTIFY = 'ev_notify'

export function lsGet<T>(k: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null') as T
  } catch {
    return null
  }
}

export function lsSet(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* quota exceeded */
  }
}

// local-time YYYY-MM-DD — daily caches roll over at local midnight, not UTC
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
