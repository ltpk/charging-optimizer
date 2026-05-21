export const LS_COLOR_MODE  = 'ev_color_mode'
export const LS_SPOT        = 'ev_spot_v4'
export const LS_SPOT_ACTUAL = 'ev_spot_actual_v4'
export const LS_SOLAR       = 'ev_solar_v3'
export const LS_GEO         = 'ev_geo'
export const LS_PARAMS      = 'ev_params_v6'

export function lsGet<T>(k: string): T | null {
  try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T }
  catch { return null }
}

export function lsSet(k: string, v: unknown): void {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* quota exceeded */ }
}
