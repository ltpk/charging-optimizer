# EV Charging Optimizer

[![CI](https://github.com/ltpk/charging-optimizer/actions/workflows/ci.yml/badge.svg)](https://github.com/ltpk/charging-optimizer/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/ltpk/charging-optimizer/actions/workflows/deploy.yml/badge.svg)](https://github.com/ltpk/charging-optimizer/actions/workflows/deploy.yml)
[![React](https://img.shields.io/github/package-json/dependency-version/ltpk/charging-optimizer/react?logo=react&logoColor=white&label=React&color=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/github/package-json/dependency-version/ltpk/charging-optimizer/dev/typescript?logo=typescript&logoColor=white&label=TypeScript&color=3178C6)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/github/package-json/dependency-version/ltpk/charging-optimizer/dev/vite?logo=vite&logoColor=white&label=Vite&color=646CFF)](https://vite.dev)
[![Bun](https://img.shields.io/github/package-json/dependency-version/ltpk/charging-optimizer/dev/@types/bun?logo=bun&logoColor=white&label=Bun&color=000000)](https://bun.sh)

**Live: https://ltpk.github.io/charging-optimizer/**

Finds the cheapest hours to charge an EV based on Finnish electricity spot prices, with optional solar production offset. Built for personal use.

## Features

- **15-minute resolution** end to end: actual spot prices from [spot-hinta.fi](https://spot-hinta.fi) (today + tomorrow) are used at their native quarter-hour market-time-unit resolution, so the plan catches price dips inside an hour; [nordpool-predict-fi](https://github.com/vividfog/nordpool-predict-fi) ML forecasts (hourly) fill the uncovered hours as flat quarters
- Optional solar production forecast from [Open-Meteo](https://open-meteo.com) — global tilted irradiance (GTI) for your panel tilt/azimuth, converted to PV output (`kWp × GTI/1000 × 0.85` performance ratio) to offset charging cost when solar covers part of charging power
- Finds the cheapest **consecutive** charging window over 15-min slots — accounting for the partially elapsed current slot (charging can start mid-slot; a slot with under ~4 minutes left is skipped)
- Optional **charge-by deadline** — constrains the search window to complete charging before a given hour (e.g. by 07:00); warns when the deadline is too tight to reach the target SOC, or when it has already passed
- Configurable battery capacity, charging loss, grid transfer fees (with electricity tax / sähkövero on top), and buy/sell margins (Finnish VAT 25.5% applied correctly). Charging power is derived from a 1-/3-phase selection, charge current, and voltage, capped by the car's onboard charger; the Setup drawer shows the resulting grid power
- The answer comes first: a hero at the top shows a large verdict in its status colour — **Wait** (blue), **Charge now** (green), **Battery full** (muted) or **No window** (orange, used only for problems) — with when to start or when charging ends (e.g. "Start at 02.15 tomorrow" / "Until 04.45"), a line like "in 3 h 10 min · done by 04.45 · 2 h 30 min of charging at 11,0 kW", and a figure row: a live h:mm:ss **Starts in / Time left** countdown, **Est. cost** (€, avg c/kWh), **vs charging now** (what waiting saves vs. charging straight through from now) and — when solar is enabled — **Solar covers** (% of the charge, and the € it saves vs. grid-only; on negative spot prices this flips to "adds … € (negative spot)"). The savings percentage is dropped when its baseline is under 0,01 €, since negative spot prices can push it through zero. All numbers use the Finnish decimal comma, numbers are set in JetBrains Mono, and times and dates use Finnish formatting (e.g. 14.30, 13.10.). Once the hero scrolls out of view, a pill in the status colour ("Start 02.15 · 1,22 €") stays in the sticky header
- Price chart (the main content, 380 px; 260 px on phones) plots quarter-hour net cost as a stepped ink-coloured line with one rule for every price line: **solid = actual, dashed = forecast, faded = past**. The charging window is a green block with a solid cap and its start time above; the "now" marker carries the current net price in a pill (`now 7,12`). Midnight gets a rule and a date label. A **Layers** popover toggles Spot price, Transfer + tax (stepped area), Solar output (yellow, right-hand kW axis) and Night rate shading — layers that don't apply to the current setup are disabled — and is remembered across reloads. On phones the chart scrolls horizontally at a fixed per-hour width, opening at the "now" line
- Optional browser notification when the charging window starts (in-tab; the Alerts switch in the controls panel)
- Light/dark/system theme (Setup → Appearance); follows `prefers-color-scheme` by default and remembers your choice
- Responsive layout: a single centered column (max 1200 px) — hero, then a horizontal daily-controls panel (SOC sliders, search window, charge-by, alerts), then the chart. Below 760 px the hero stacks, and the controls panel keeps the SOC sliders visible with search window / charge-by / alerts under a collapsible **Plan options**. Set-once config (battery, charger, pricing, solar, appearance) lives in a **Setup** drawer on the right (a bottom sheet on phones) with a "Reset to defaults" link, and info tooltips explain the less obvious fields
- All data cached in `localStorage`; prices refresh hourly — every 10 minutes during the ~14:00 day-ahead publication window until tomorrow's prices arrive — or on demand by clicking the **freshness chip** in the header, which always shows data status ("Prices 11.55 · solar today", or an orange warning for a failed refresh / solar problem / panel settings changed) (a failed refresh keeps the last good data on screen and retries after 5 minutes; a backgrounded tab whose timers were throttled catches up the moment it becomes visible again). The solar forecast caches for the local calendar day and refetches automatically on load and just after midnight while solar is enabled; changing location or panel parameters prompts a manual refetch
- The "now" marker, current-slot status, and optimal window advance on each quarter hour automatically (and when the tab regains focus), without needing a data refresh

## How it works

Three views of the moving parts. The diagrams show topology — what feeds what and where the boundaries are; exact constants and cache keys live in [Features](#features) and the code.

### Data pipeline

Two price sources merge into one 15-minute slot series (actual prices always win over forecasts), solar arrives independently, and everything meets in the pure `optimize()` core:

```mermaid
flowchart LR
  subgraph ext[External APIs]
    SH["spot-hinta.fi<br>actual prices, 15-min"]
    NP["nordpool-predict-fi<br>ML forecast, hourly"]
    OM["Open-Meteo<br>tilted irradiance, hourly"]
  end
  subgraph ls[localStorage caches]
    CA[("actual price cache")]
    CF[("forecast cache")]
    CS[("solar cache")]
  end
  SH --> CA
  NP --> CF
  OM --> CS
  CA --> MERGE["merge per 15-min slot<br>(actuals override forecast)"]
  CF --> MERGE
  CS --> PV["per-hour PV watts"]
  MERGE --> OPT["optimize()"]
  PV --> OPT
  UIIN["params + clock-aligned now"] --> OPT
  OPT --> UI["Plan card · Chart"]
```

### Optimizer

`optimize()` turns the SOC gap into hours of charging needed, prices every candidate slot with `calcNetCost()` (the grid share at buy price **plus** the solar share at the forgone sell price), picks slots per the chosen mode, and derives the reported numbers from a chronological usage walk:

```mermaid
flowchart TD
  IN["SOC gap · battery capacity<br>charging loss · charging power"] --> HN["hoursNeeded"]
  SLOTS["merged price slots + solar"] --> NC["netCost per slot:<br>grid share at buy price<br>+ solar share at forgone sell price"]
  NC --> CAND["candidate slots<br>within horizon, before deadline,<br>in-progress slot at remaining capacity"]
  HN --> CONS["scan every start index,<br>cheapest contiguous block"]
  CAND --> CONS
  CONS --> WALK["usage walk: consume hoursNeeded<br>chronologically over selected slots"]
  WALK --> OUT["total & avg cost · completion time<br>solar share & savings · savings vs charge-now"]
```

### Price refresh cadence

One fetch loop with three waiting speeds; a manual refresh or a tab returning to the foreground past its due time short-circuits any of them:

```mermaid
stateDiagram-v2
  [*] --> Fetching : page load
  state Waiting {
    WaitHourly : hourly (normal)
    WaitDayAhead : 10-min poll (day-ahead publication window)
    WaitRetry : 5-min retry (last good data stays on screen)
  }
  Fetching --> WaitHourly : success
  Fetching --> WaitDayAhead : success, but tomorrow's prices still missing
  Fetching --> WaitRetry : fetch failed
  Waiting --> Fetching : timer fires / manual refresh / tab foregrounded past due
```

## Development

```bash
bun install       # uses the committed bun.lock
bun run dev       # http://localhost:5173
bun run build     # production build → dist/
bun run preview   # serve dist/ locally
bun run typecheck # tsc --noEmit
bun test          # unit tests (optimization core + pure api helpers)
```

Performance: the price chart (Chart.js) is lazy-loaded via `React.lazy`/`Suspense`, so it splits into its own bundle chunk (~58 kB gzip) and loads after first paint instead of blocking the initial load. React and MUI are split into their own vendor chunks (`vite.config.ts` `manualChunks`) so they stay cached across deploys while only the small app chunk re-downloads. The price fetch is kicked off at module load (`prewarmPrices()` in `main.tsx`) so the network round-trip overlaps with bundle parse/execute, and `index.html` preconnects to the spot-price API. The favicon is an inline SVG data-URI (lightning bolt) in `index.html` — no extra request and no path to break under the Pages subpath.

Commits run a Husky pre-commit hook: Prettier (via lint-staged on staged files), then `bun run typecheck`, then `bun test`.

No environment variables or API keys required — all APIs are public.

## Configuration

Everyday parameters are set in the controls panel under the hero, set-once ones in the **Setup** drawer; all are persisted automatically. Key inputs:

| Parameter                  | Description                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SOC now / target           | Current and desired battery state of charge (%)                                                                                                                                                                       |
| Battery capacity           | Usable kWh                                                                                                                                                                                                            |
| Charging loss              | Round-trip loss (%) — energy drawn from grid exceeds energy stored                                                                                                                                                    |
| Onboard charger            | Car's max AC power (kW) — caps grid power                                                                                                                                                                             |
| Phases / current / voltage | 1- or 3-phase, charge current (A), and grid voltage (V); grid power = min(phases × A × V, onboard charger)                                                                                                            |
| Charge by                  | Optional deadline — optimizer only uses slots that complete before this hour-of-day                                                                                                                                   |
| Transfer fee               | Grid transfer fee (c/kWh); off by default — toggle on, choose a single fixed fee or separate day/night rates (night applies 22:00–07:00), plus electricity tax (sähkövero, default 2,92 c/kWh incl. VAT) added on top |
| Retailer margin            | Retailer margin on purchases (c/kWh, VAT-exclusive), under Pricing                                                                                                                                                    |
| Sell margin                | Deducted from spot when calculating solar sell-back value (in the Solar section)                                                                                                                                      |
| Search window              | How many hours ahead to search for the optimal window                                                                                                                                                                 |
| Solar PV (enable)          | Toggle solar influence on/off without losing panel configuration                                                                                                                                                      |
| House base load            | House base load (W) served by solar first; only surplus solar offsets charging (default 0 = all solar available)                                                                                                      |

## Solar setup

1. Set your location — click **Use GPS** or type latitude/longitude into the fields directly (the manual fields also cover denied location permission or desktops without a location service)
2. Set panel tilt, azimuth (compass degrees: 0 = N, 90 = E, 180 = S, 270 = W — converted automatically to Open-Meteo's 0 = S convention), and peak power (kWp)
3. Optionally set **House base load** (W) — other household load (fridge, standby, heat pump, …) that consumes solar before any reaches the charger, so only the surplus offsets charging cost
4. The forecast is fetched automatically once solar is enabled with a valid location, and again each new day; **Fetch forecast** (or the header freshness chip) forces a refetch — needed after changing location or panel parameters (the chip warns "Panel settings changed — refetch" when the on-screen forecast no longer matches the settings)

## APIs used

| API                                   | Purpose                                                                     | Cache                                                         |
| ------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `api.spot-hinta.fi/today`             | Actual spot prices, 15-min slots (VAT applied to the untaxed price locally) | Re-fetched until tomorrow's prices are available, then stable |
| `api.spot-hinta.fi/dayforward`        | Tomorrow's prices (available ~14:15)                                        | Same                                                          |
| `nordpool-predict-fi` prediction.json | Hourly ML forecast for unpriced hours                                       | 1 h TTL                                                       |
| `api.open-meteo.com` GTI              | Global tilted irradiance → PV production estimate                           | Calendar day                                                  |
| `gc.zgo.at` (GoatCounter)             | Cookie-less page-view counter, one hit per page load                        | —                                                             |
