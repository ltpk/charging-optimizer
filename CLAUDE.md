# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A React + TypeScript + Vite application for optimizing EV charging times based on Finnish electricity spot prices and optional solar production forecasts. Personal use only — no auth, no backend.

**Stack:** React 18, TypeScript 5 (strict), MUI v5 (light/dark/system theme), Chart.js 4 via react-chartjs-2, Vite 5.

## Commands

```bash
bun run dev      # dev server
bun run build    # production build
bunx tsc --noEmit # type-check only
```

No test suite. No environment variables needed.

## Architecture

```
src/
  types.ts                 — shared interfaces: PriceEntry, HourEntry, Params, OptimizeResult, SolarData, GeoCoords
  main.tsx                 — React entry, ErrorBoundary (ThemeProvider lives in App.tsx)
  App.tsx                  — colorMode state + ThemeProvider, all data fetching, layout; result computed via useMemo(optimize(...))
  utils/
    storage.ts             — lsGet<T> / lsSet wrappers; localStorage key constants; localDateStr() (local YYYY-MM-DD for daily cache keys)
    api.ts                 — fetchPrices(): merges spot-hinta.fi actual + nordpool-predict-fi forecast
    solar.ts               — fetchSolarData(), loadCachedSolar(), getSolarForDt()
    optimization.ts        — calcNetCost(), optimize(prices, solar, params, now=new Date()) — pure functions, no React imports
  components/
    Sidebar.tsx            — all controls; NumField uses defaultValue+key pattern (uncontrolled)
    StatusCard.tsx         — Go / Wait / Battery full banner (MUI Alert)
    Metrics.tsx            — metric grid (needed h + kWh sub-label, duration, cost+avg c/kWh sub-label; "Done by" completion time appended when charging is scheduled, "Solar now" + "covers X% · saves Y €" sub-label appended only when solar enabled; column count = 3 + those two optional boxes)
    HourList.tsx           — ranked cheapest hours with MUI LinearProgress bars
    PriceChart.tsx         — Chart.js mixed bar+line; nowLinePlugin + colorsRef via useRef to avoid stale closures
```

## Data flow

1. `fetchPrices()` in `api.ts` fetches today + tomorrow from `spot-hinta.fi`, fills uncovered hours from `nordpool-predict-fi` (1 h TTL). Actual prices override predictions for the same hour (keyed by `YYYY-MM-DDTHH` UTC).
2. Optionally `fetchSolarData()` fetches from `api.forecast.solar`. Timestamps are local browser time; converted to UTC keys on receipt.
3. `App.tsx` passes `priceData`, `solarData`, `params`, and a clock-aligned `now` to `useMemo(() => optimize(...))`. `now` advances at hour granularity (a 60 s interval + `visibilitychange` listener that only bumps state when the clock hour changes) so the now-line, current-hour, and Go/Wait status stay correct without a data refresh. `optimize()` returns `OptimizeResult | null`.
4. `App.tsx` re-runs `fetchPrices()` hourly (or on demand via the sidebar refresh button). A failed refresh keeps the last good prices on screen (sidebar status dot turns amber); the full-screen error only appears if the *initial* load fails. Manual refresh uses a `refreshRef` that exposes the inner `load()` closure so it shares the same `hasData` state.

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
- Transfer fee: `transferNight` for hours 22–07, `transferDay` otherwise
- Graph window: last 6 h of past + `horizonH` hours ahead
- Optimization window: future hours only, bounded by `horizonH` and optional charge-by deadline (`chargeByDay` offset 0/1/2 + `chargeByHour`)
- **Consecutive mode** (default): O(n) sliding window sum over `futureHours`
- **Individual mode**: sort by netCost, pick cheapest N, re-sort chronologically
- **Solar toggle**: `params.solarEnabled=false` passes `solarW=0` to `calcNetCost` (disabling solar influence on rankings) and forces `solarNow` to 0
- **Solar coverage / savings**: `solarPct` = mean `solarShare` over `selectedList` × 100 (share of charge covered by solar); `solarSavings` = (grid-only avg net cost − actual avg net cost) over the same hours × achievable hours × `chargingPower` / 100. Both are 0 when solar is disabled.
- **Completion time**: `completionTime` = last selected hour's start + `(chargeHours − (selectedList.length − 1))` h — i.e. start + duration for consecutive mode, end of the last cheap hour for individual mode. `null` when nothing is scheduled (battery full / target met).
- **Short window**: when a charge-by deadline or horizon fits fewer than `nHours`, `selectedList` is truncated; `totalCost` is capped at the achievable hours (`min(hoursNeeded, selectedList.length)`) and `App` renders a warning that target SOC won't be reached

## State / caching (localStorage)

| Key | Contents | Invalidation |
|-----|----------|--------------|
| `ev_spot_actual_v4` | spot-hinta.fi prices + `fetchedAt` timestamp | Stale once the last hour has fully elapsed, or (no tomorrow data AND cache older than 1 h) |
| `ev_spot_v4` | nordpool-predict-fi forecast | 1 h TTL (keyed on local date) |
| `ev_solar_v3` | Forecast.Solar watts map | Daily (local calendar date) |
| `ev_geo` | `{ lat, lon }` strings | Never (manual update) |
| `ev_params_v6` | All `Params` fields incl. `solarEnabled`, `chargeByEnabled`, `chargeByHour`, `chargeByDay` | Never (persisted on every change) |
| `ev_color_mode` | `'light' \| 'dark' \| 'system'` | Never (persisted on every change) |
| `ev_notify` | `boolean` — notify-on-charge toggle | Never (persisted on every change) |

## Key patterns

**Number inputs** (`NumField` in Sidebar): uncontrolled with `defaultValue={value}` and `key={value}`. Re-mounts when value changes externally (e.g. on first load from localStorage). Commits on `onBlur`.

**nowLinePlugin**: defined with `useMemo(() => ..., [])` (stable reference); reads `nowIdx` and chart colors from `useRef`s updated each render — avoids stale closures without recreating the plugin object. Same pattern used for `colorsRef` so the plugin picks up theme changes.

**Chart**: `<Chart type="bar" data={...} options={...} plugins={[nowLinePlugin]} />` from react-chartjs-2. Mixed datasets use `type: 'line' as const` overrides. `animation: false` for performance. Cast `data as any` to avoid complex mixed-chart generics. Colors derived from `useTheme()` + MUI `alpha()` so they adapt to light/dark mode. The solar dataset and right-hand `y2` axis are included only when `params.solarEnabled`.

**Params update**: `onParamChange<K extends keyof Params>(key: K, value: Params[K])` — generic key narrows the value type. Propagated from App → Sidebar via props.

**Charge-now notification**: in-tab Web Notifications API, no service worker (only fires while the tab is open). `App` tracks the rising edge of `isGo` with a `useRef` and calls `new Notification` when permission is `granted`. The sidebar toggle (persisted to `ev_notify`) requests permission on enable; if the user blocked notifications it shows a hint.
