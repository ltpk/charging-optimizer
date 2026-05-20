# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A React + TypeScript + Vite application for optimizing EV charging times based on Finnish electricity spot prices and optional solar production forecasts. Personal use only — no auth, no backend.

**Stack:** React 18, TypeScript 5 (strict), MUI v5 (dark theme), Chart.js 4 via react-chartjs-2, Vite 5.

## Commands

```bash
npm run dev      # dev server
npm run build    # production build
npx tsc --noEmit # type-check only
```

No test suite. No environment variables needed.

## Architecture

```
src/
  types.ts                 — shared interfaces: PriceEntry, HourEntry, Params, OptimizeResult, SolarData, GeoCoords
  theme.ts                 — MUI createTheme + COLORS constants (referenced by components for raw hex values)
  main.tsx                 — React entry, ThemeProvider
  App.tsx                  — all state, data fetching, layout; result computed via useMemo(optimize(...))
  utils/
    storage.ts             — lsGet<T> / lsSet wrappers; localStorage key constants
    api.ts                 — fetchPrices(): merges spot-hinta.fi actual + nordpool-predict-fi forecast
    solar.ts               — fetchSolarData(), loadCachedSolar(), getSolarForDt()
    optimization.ts        — calcNetCost(), optimize() — pure functions, no React imports
  components/
    Sidebar.tsx            — all controls; NumField uses defaultValue+key pattern (uncontrolled)
    StatusCard.tsx         — Go / Wait / Battery full banner
    Metrics.tsx            — 4-metric grid (needed h, duration, cost, solar now)
    HourList.tsx           — ranked cheapest hours with bar visualization
    PriceChart.tsx         — Chart.js mixed bar+line; nowLinePlugin via useRef to avoid stale closure
```

## Data flow

1. `fetchPrices()` in `api.ts` fetches today + tomorrow from `spot-hinta.fi`, fills uncovered hours from `nordpool-predict-fi` (1 h TTL). Actual prices override predictions for the same hour (keyed by `YYYY-MM-DDTHH` UTC).
2. Optionally `fetchSolarData()` fetches from `api.forecast.solar`. Timestamps are local browser time; converted to UTC keys on receipt.
3. `App.tsx` passes `priceData`, `solarData`, `params` to `useMemo(() => optimize(...))`. `optimize()` returns `OptimizeResult | null`.

## Optimization logic (`src/utils/optimization.ts`)

```
hoursNeeded = (socTarget - socNow) / 100 * batteryCapacity / (1 - chargingLoss/100) / chargingPower

calcNetCost(params, spotCent, hour, solarW):
  solarShare = min(solarW / (chargingPower * 1000), 1.0)   # 0 when solarEnabled=false
  buyPrice   = (1 - solarShare) * (spot + transferFee + buyMargin * 1.255)
  sellPrice  = max(0, spot / 1.255 - sellMargin)
  return buyPrice - solarShare * sellPrice
```

- `ALV = 1.255` — Finnish VAT 25.5%
- Transfer fee: `transferNight` for hours 22–06, `transferDay` otherwise
- Graph window: last 6 h of past + `horizonH` hours ahead
- Optimization window: future hours only, bounded by `horizonH`
- **Consecutive mode** (default): O(n) sliding window sum over `futureHours`
- **Individual mode**: sort by netCost, pick cheapest N, re-sort chronologically
- **Solar toggle**: `params.solarEnabled=false` passes `solarW=0` to `calcNetCost`, disabling solar influence on rankings

## State / caching (localStorage)

| Key | Contents | Invalidation |
|-----|----------|--------------|
| `ev_spot_actual_v3` | spot-hinta.fi prices + `fetchedAt` timestamp | Stale if no tomorrow data AND cache older than 1 h |
| `ev_spot_v4` | nordpool-predict-fi forecast | 1 h TTL |
| `ev_solar_v3` | Forecast.Solar watts map | Daily (calendar date) |
| `ev_geo` | `{ lat, lon }` strings | Never (manual update) |
| `ev_params_v4` | All `Params` fields incl. `solarEnabled` | Never (persisted on every change) |

## Key patterns

**Number inputs** (`NumField` in Sidebar): uncontrolled with `defaultValue={value}` and `key={value}`. Re-mounts when value changes externally (e.g. on first load from localStorage). Commits on `onBlur`.

**nowLinePlugin**: defined with `useMemo(() => ..., [])` (stable reference); reads `nowIdx` from a `useRef` updated each render — avoids stale closures without recreating the plugin object.

**Chart**: `<Chart type="bar" data={...} options={...} plugins={[nowLinePlugin]} />` from react-chartjs-2. Mixed datasets use `type: 'line' as const` overrides. `animation: false` for performance. Cast `data as any` to avoid complex mixed-chart generics.

**Params update**: `onParamChange<K extends keyof Params>(key: K, value: Params[K])` — generic key narrows the value type. Propagated from App → Sidebar via props.
