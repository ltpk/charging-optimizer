# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A React + TypeScript + Vite application for optimizing EV charging times based on Finnish electricity spot prices and optional solar production forecasts. Personal use only — no auth, no backend.

**Stack:** React 19, TypeScript 6 (strict), MUI v9 (light/dark/system theme), Chart.js 4 via react-chartjs-2, Vite 8.

## Commands

```bash
bun run dev       # dev server
bun run build     # production build
bun run typecheck # type-check only (tsc --noEmit)
bun test          # unit tests (src/utils/optimization.test.ts)
```

No environment variables needed. Tests cover the pure optimization core only (`bun:test`; types via `@types/bun` + `"types": ["bun"]` in tsconfig — no extra test framework).

**Pre-commit (Husky + lint-staged):** `.husky/pre-commit` runs `bunx lint-staged` (Prettier `--write` on staged files, config in `.prettierrc`/`.lintstagedrc`), then `bun run typecheck`, then `bun test`. The `prepare: "husky || true"` script sets it up on install — the `|| true` keeps the Pages CI's `bun install` from ever failing on it.

**Code style:** the whole repo is Prettier-formatted; `.prettierrc` matches the codebase idiom (no semicolons, single quotes, trailing commas, no arrow parens, print width 120), so `bunx prettier --check .` passes and lint-staged produces no churn. Write new code in that style.

**rtk (token-saving proxy):** a global `PreToolUse` hook auto-rewrites most Bash commands (`git`, `gh`, `grep`, `find`, `ls`, `read`, `curl`, …) to their `rtk` equivalents transparently. It rewrites **each segment** of compound commands joined by `&&`, `;`, or `||` (the producer side of a `|` pipe is rewritten; the consumer side is intentionally left native). The hook does **not** touch `bun`/`bunx` — that's the one gap requiring manual `rtk` forms:

- type-check: `rtk tsc --noEmit` (uses the repo's local tsc) instead of `bunx tsc --noEmit`
- build: `rtk err -- bun run build` to surface only errors/warnings
- `bun run dev` is left as-is (long-running server, no benefit from filtering)

**Dependencies & CI:** `bun` everywhere. The committed lockfile is **`bun.lock`** (text format — commit it; there is no `package-lock.json`). Two workflows: `.github/workflows/ci.yml` (push to main + all PRs) runs `bun run typecheck` + `bun test` — the same checks as the pre-commit hook, so Dependabot/PR branches are gated in CI too; `.github/workflows/deploy.yml` (push to main) builds and publishes to Pages. Both run `bun install --frozen-lockfile` on linux. Vite 8 is **Rolldown-based** and pulls a per-platform native binary (`@rolldown/binding-<platform>`) as an optional dep; `bun.lock` records all 15 platform binding entries and bun installs only the one matching the runner's OS/CPU, so linux gets `@rolldown/binding-linux-x64-gnu` automatically — no manual lockfile surgery (this replaces the old npm `package-lock.json` + clean-tree-regen workaround). After changing deps, run `bun install` and commit the updated `bun.lock`. Dependabot (`.github/dependabot.yml`, `package-ecosystem: bun`) keeps deps + Actions current (weekly; minor/patch grouped, majors individual).

## Architecture

```
src/
  types.ts                 — shared interfaces: PriceEntry (one 15-min slot; `ts` = UTC quarter key YYYY-MM-DDTHH:MM), SlotEntry, Params, OptimizeResult, SolarData, GeoCoords, ApiStatus
  main.tsx                 — React entry, ErrorBoundary (ThemeProvider lives in App.tsx)
  App.tsx                  — colorMode state + ThemeProvider, all data fetching, layout; result computed via useMemo(optimize(...)). Theme control is a single AppBar IconButton (cycleColorMode) that cycles system → light → dark, persisted to ev_color_mode
  utils/
    storage.ts             — lsGet<T> / lsSet wrappers; localStorage key constants; localDateStr() (local YYYY-MM-DD for daily cache keys)
    api.ts                 — fetchPrices(): merges spot-hinta.fi actual (native 15-min slots; spotCent = PriceNoTax × ALV, since the API's PriceWithTax is pre-rounded) + nordpool-predict-fi forecast (hourly, expanded into four flat quarters)
    solar.ts               — fetchSolarData(), loadCachedSolar(), getSolarForDt(), solarCacheKey() (cache valid only while location+panel params match). Fetches Open-Meteo's hourly `global_tilted_irradiance` (GTI, W/m²) for the panel tilt/azimuth and converts each hour to PV watts via `solarKwp × GTI × PERFORMANCE_RATIO` (0.85). UI azimuth is compass convention (0=N 180=S); converted to Open-Meteo's 0=S (`solarAz - 180`). Open-Meteo radiation at timestamp T is the mean over the *preceding* hour [T-1h, T), so each value's key is shifted back one hour to match the app's hour-start convention
    optimization.ts        — calcNetCost(), isNightHour(), optimize(prices, solar, params, now=new Date()), SLOT_MS/SLOT_H/slotTs() — pure functions over 15-min slots, no React imports
    optimization.test.ts   — bun:test unit tests for the optimization core
  components/
    Sidebar.tsx            — all controls; NumField is controlled by local text and commits live on every keystroke (see Key patterns). Everyday controls (Battery State sliders, Charging Plan = mode/window/charge-by) stay visible; set-once config (Vehicle, Transfer Fee, Margins, Solar PV) lives in an "Advanced Setup" Accordion (open by default; expanded/collapsed state is Sidebar-local and persisted to `ev_advanced_open`). A "Restore defaults" text button at the bottom of the Advanced section calls `onResetParams` (App resets `params` to `DEFAULT_PARAMS` with `chargingPower` re-derived via `gridPower`). The Vehicle section sets capacity, onboard-charger cap, a 1-phase/3-phase ToggleButtonGroup, current (A), voltage (V), and loss — `params.chargingPower` (grid power) is **derived** from these, not typed directly; a read-only `ChargeSpecs` block under the inputs shows `chargeSpecs(params)` (charging speed / power / energy-to-battery, plus grid power + energy-from-grid when loss > 0). `InfoTip` (InfoOutlined + MUI Tooltip) annotates non-obvious fields; charging mode is a Consecutive hours / Split slots ToggleButtonGroup (not a checkbox). On md+ the sidebar renders inline; on xs/sm it's a temporary Drawer toggled by the AppBar settings button (App.tsx builds the `sidebar` element once and renders it in either an inline Box or a Drawer)
    StatusCard.tsx         — Go / Wait / Battery full banner (MUI Alert)
    Metrics.tsx            — metric grid, always 3 columns (2 on xs). "Charge plan" box (needed h as value; sub-lines = "N h rounded · X kWh", then "done by HH:MM[ d.m.]" when charging is scheduled, then "solar covers X% · saves Y €" when solar enabled — both scoped to the recommended charging hours), "Est. cost" box (€ value; sub-lines = avg c/kWh, then "saves Y € (Z %) vs now" (percent of the charge-now cost) when waiting beats charging immediately by ≥ 0.005 €), and a "Spot now" box (current slot's spot price as value; sub-lines = current transfer fee, then "solar N W" when solar enabled — spot/transfer computed in App from `currentSlot` + params). `Metric.sub` accepts string | string[] (one caption line each)
    HourList.tsx           — groups contiguous selected slots per clock hour (`groupSlots`): a fully selected hour is one row, window edges show as partial rows with a "N min" caption; row cost = average of its slots. MUI LinearProgress bars on an absolute scale: length + color (success/warning/error tiers at 0.34/0.67) are normalized against the candidate-slot net-cost range (`netCostMin`/`netCostMax`), so full+green = cheapest available, empty+red = priciest. Marks the row containing the current slot (`currentTs`) with a "now" caption + highlighted row, and shows each row's Δ vs the cheapest selected row
    PriceChart.tsx         — Chart.js line chart over 15-min slots on a slot-start-aligned category axis (hourly labels/gridlines via tick callback); bgShadePlugin (night/selected shading rects) + nowLinePlugin + colorsRef via useRef to avoid stale closures
```

## Data flow

1. `fetchPrices()` in `api.ts` fetches today + tomorrow from `spot-hinta.fi` at native 15-min resolution, fills uncovered hours from `nordpool-predict-fi` (1 h TTL; each hourly point expanded into four flat quarter slots). Actual prices override predictions for the same slot (keyed by `YYYY-MM-DDTHH:MM` UTC, `slotTs()`).
2. Optionally `fetchSolarData()` fetches GTI from `api.open-meteo.com` (`timezone=auto`, `forecast_days=2`) and converts to per-hour PV watts. Timestamps are location-local; parsed as browser-local and converted to UTC hour keys (shifted back 1 h for Open-Meteo's preceding-hour averaging).
3. `App.tsx` passes `priceData`, `solarData`, `params`, and a clock-aligned `now` to `useMemo(() => optimize(...))`. `now` advances at 15-min slot granularity (a 60 s interval + `visibilitychange` listener that only bumps state when the clock crosses a `SLOT_MS` boundary) so the now-line, current-slot, and Go/Wait status stay correct without a data refresh. `optimize()` returns `OptimizeResult | null`.
4. `App.tsx` re-runs `fetchPrices()` hourly on success, or after **5 min** when a fetch fails (or on demand via the sidebar refresh button). A failed refresh keeps the last good prices on screen (sidebar status dot turns amber); the full-screen error (with a Retry button) only appears if the _initial_ load fails. Manual refresh uses a `refreshRef` that exposes the inner `load()` closure so it shares the same `hasData` state.
5. Solar cache validity is keyed on `solarCacheKey(coords, params)` (lat/lon + tilt/azimuth/kWp) in addition to the calendar date. Changing location or panel params mid-session flips the sidebar solar status to a "refetch forecast" warning (`fetchedSolarKeyRef` in App tracks the key of the last fetch).

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
- **Charging power is derived:** `gridPower(p) = min(phases × amperage × voltage / 1000, chargerCap)` — `params.chargingPower` is this grid power (kept in sync in `App.onParamChange` whenever phases/amperage/voltage/chargerCap change, and healed once on load in `storedParams`). The optimizer core still reads `params.chargingPower` directly, so it and its tests are unchanged. `chargeSpecs(p)` returns the read-only display values (grid power; charging power = grid × efficiency; speed = power-to-battery / capacity × 100; energy-to-battery = ΔSOC/100 × capacity; energy-from-grid = that / efficiency)
- All slots are 15 minutes (`SLOT_MS = 900_000`, `SLOT_H = 0.25`); capacities/needs are expressed in **hours**
- Transfer fee: resolved by exported `getTransfer(params, hour)` (shared by App's "Spot now" metric and PriceChart). Returns 0 when `transferEnabled=false`; a single `transferFee` when `transferFixed=true`; otherwise `transferNight` for hours 22–07 (`isNightHour()` on the slot's start hour) and `transferDay` otherwise. The transfer line/legend in PriceChart and the "transfer" sub-line in Metrics are hidden when `transferEnabled=false`
- Graph window: last 6 h of past + `horizonH` hours ahead
- **Slot capacity** (`slotCapacity`, in hours): future slots count as `SLOT_H`; the in-progress slot counts only for its remaining fraction, and is dropped from candidates below `MIN_SLOT_CAPACITY = 0.25 * SLOT_H` (< ~3.75 min left)
- Candidate set (`candidates`): slots with usable capacity, bounded by `horizonH` and optional charge-by deadline (`chargeByDay` offset 0/1/2 + `chargeByHour`); a deadline already in the past sets `deadlinePassed` and yields an empty candidate set
- **Consecutive mode** (default): exact-cost scan — for each start index, walk forward consuming `hoursNeeded` at per-slot capacity; pick max achieved hours, then min cost, then earliest (O(n²), n ≤ ~300)
- **Individual mode**: sort by netCost, take cheapest slots until their combined capacity covers `hoursNeeded`, re-sort chronologically — this is what catches sub-hour price dips
- **Usage walk**: cost/completion derived by consuming `hoursNeeded` chronologically over `selectedList` (current slot starts at `now`, last slot partial). Yields `achievableHours`, energy-weighted `totalCost`/`avgNetCost`, the grid-only baseline for `solarSavings`, usage-weighted `solarPct`, and `completionTime` (`null` when nothing scheduled; end of last slot when the need doesn't fit). A second walk over the earliest consecutive candidates gives the "charge straight through from now" baseline; `savingsVsNow` = that cost − `totalCost` (≥ 0, same energy so the delta is purely timing)
- **Solar**: solar data stays hourly — each slot reads its hour's average via `getSolarForDt` (hour-key truncation of the slot's `dt`). `params.solarEnabled=false` passes `solarW=0` to `calcNetCost` (disabling solar influence on rankings) and forces `solarNow` to 0; `solarPct`/`solarSavings` are then 0
- **HourList scale**: `netCostMin`/`netCostMax` are the min/max net cost over `candidates`. `HourList` normalizes each row's bar against this range so bar length + color tier reflect absolute cheapness vs. all upcoming slots, not just rank within the picked subset.
- **Short window**: when `achievableHours < hoursNeeded` (tight deadline/horizon), `App` renders a warning with the achievable vs. needed hours; a passed deadline gets its own warning instead

## State / caching (localStorage)

| Key                 | Contents                                                                                   | Invalidation                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `ev_spot_actual_v6` | spot-hinta.fi 15-min slot prices + `fetchedAt` timestamp                                   | Stale once the last slot has fully elapsed, or (no tomorrow data AND cache older than 1 h) |
| `ev_spot_v5`        | nordpool-predict-fi forecast (expanded to 15-min slots)                                    | 1 h TTL (keyed on local date)                                                              |
| `ev_solar_v7`       | Open-Meteo GTI-derived per-hour PV watts map + `key` (location/panel params)               | Daily (local calendar date) or key mismatch                                                |
| `ev_geo`            | `{ lat, lon }` strings                                                                     | Never (manual update)                                                                      |
| `ev_params_v6`      | All `Params` fields incl. `solarEnabled`, `chargeByEnabled`, `chargeByHour`, `chargeByDay` | Never (persisted on every change)                                                          |
| `ev_color_mode`     | `'light' \| 'dark' \| 'system'`                                                            | Never (persisted on every change)                                                          |
| `ev_notify`         | `boolean` — notify-on-charge toggle                                                        | Never (persisted on every change)                                                          |
| `ev_advanced_open`  | `boolean` — sidebar "Advanced Setup" expanded state (default open)                         | Never (persisted on toggle)                                                                |

## Key patterns

**Number inputs** (`NumField`, and the charge-by `HourField`, in Sidebar): controlled by a local `text` string so every keystroke commits live (`onChange` → `onParamChange`, so all derived values update as you type) without remounting/dropping focus; the raw string keeps partial input (`""`, `"1."`, `"-"`) usable. A `useEffect([value])` re-syncs `text` only when the value changes externally (e.g. localStorage restore), never mid-typing; `onBlur` reverts an empty/invalid field to the committed value.

**nowLinePlugin / bgShadePlugin**: defined with `useMemo(() => ..., [])` (stable reference); read `nowPosRef`/`shadeRef` and chart colors from `useRef`s updated each render — avoids stale closures without recreating the plugin objects. Same pattern used for `colorsRef` so the plugins pick up theme changes.

**Chart**: `<Chart type="line" data={...} options={options} plugins={[bgShadePlugin, nowLinePlugin]} />` from react-chartjs-2. `animation: false` for performance. Cast `data as any` to avoid mixed-dataset generics. Colors derived from `useTheme()` + MUI `alpha()` so they adapt to light/dark mode. The solar dataset and right-hand `y2` axis are included only when `params.solarEnabled`.

**Slot-start axis alignment**: each x category marks the _start_ of its 15-min slot (`offset: false` on the x scale + one extra end-of-window label so the last slot has width); the tick callback returns `null` for everything except hour starts thinned to ≤ ~12 clock-aligned labels (`tickShow`), which hides both the label and its gridline. Slot `i`'s night-rate/selected-window shading is drawn by `bgShadePlugin` as a rect from tick `i` to tick `i+1` (no bar datasets — bars would center on the tick and bleed half a slot early); contiguous night slots are merged into single rects, and selected-window rects are inset ≤ 2 px only at hour boundaries inside a contiguous run, so the window reads as per-hour bars while its outer edges stay flush with the exact start/end times. The net-cost, spot, and transfer-fee lines all use `stepped: 'before'` — prices are constant within a slot, and in Chart.js `'before'` holds the _previous_ point's value until the next tick (`'after'` is the opposite, despite the names) — so every price jump and the 22:00/07:00 night-rate step land exactly on slot boundaries. The solar line is the exception: its slots repeat hourly averages, so the display values are linearly interpolated between hour centers (staircase → smooth curve). Every line's last value is duplicated onto the phantom end tick so the final slot is covered; the tooltip filters that index out (`dataIndex < slots.length`). The now-line is drawn at `nowIdx + elapsed fraction of the current slot`.

**Params update**: `onParamChange<K extends keyof Params>(key: K, value: Params[K])` — generic key narrows the value type. Propagated from App → Sidebar via props.

**Charge-now notification**: in-tab Web Notifications API, no service worker (only fires while the tab is open). `App` tracks the rising edge of `isGo` with a `useRef` (initialized `null` and baselined on the first `result`, so a window already active at page load doesn't notify) and calls `new Notification` when permission is `granted`. The sidebar toggle (persisted to `ev_notify`) requests permission on enable; if the user blocked notifications it shows a hint.
