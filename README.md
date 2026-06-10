# EV Charging Optimizer

**Live: https://ltpk.github.io/charging-optimizer/**

Finds the cheapest hours to charge an EV based on Finnish electricity spot prices, with optional solar production offset. Built for personal use.

## Features

- Fetches actual spot prices from [spot-hinta.fi](https://spot-hinta.fi) (today + tomorrow, 15-min intervals averaged to hourly), falling back to [nordpool-predict-fi](https://github.com/vividfog/nordpool-predict-fi) forecasts for uncovered hours
- Optional solar production forecast from [Forecast.Solar](https://forecast.solar) — offsets charging cost when solar covers part of charging power
- Two optimization modes: cheapest **consecutive** block or cheapest **individual** hours — both account for the partially elapsed current hour (charging can start mid-hour; an hour with under 15 minutes left is skipped)
- Optional **charge-by deadline** — constrains the search window to complete charging before a given hour (e.g. by 07:00); warns when the deadline is too tight to reach the target SOC, or when it has already passed
- Configurable battery capacity, charging loss, charging power, grid transfer fees, and buy/sell margins (Finnish VAT 25.5% applied correctly)
- Metrics panel shows a "Charge plan" box (hours needed, with rounded duration, kWh to be drawn from the grid, the estimated completion time "done by", and — when solar is enabled — the % of the charge covered by solar and estimated € saved vs. grid-only, both scoped to the recommended charging hours) and estimated total cost with average c/kWh for the optimal period; when solar is enabled a separate "Solar now" box shows the current instantaneous solar output
- Cheapest-hours list bars use an absolute scale — length and color (green → amber → red) are normalized against all upcoming hours, so a full green bar means genuinely cheap, not just cheapest among the picked hours; the current hour is marked "now" and each row shows its price delta vs. the cheapest selected hour
- Price chart shows net cost, spot price, day/night transfer fee, solar output, and the selected charging window
- Optional browser notification when the charging window starts (in-tab; enable in the sidebar)
- Light/dark/system theme toggle; follows `prefers-color-scheme` by default
- Mobile-responsive layout with collapsible settings sidebar
- All data cached in `localStorage`; prices refresh hourly or on demand via the refresh button (a failed refresh keeps the last good data on screen and retries after 5 minutes), solar caches for the local calendar day and invalidates when location or panel parameters change
- The "now" marker, current-hour status, and optimal window advance on the hour automatically (and when the tab regains focus), without needing a data refresh

## Development

```bash
bun install       # uses the committed bun.lock
bun run dev       # http://localhost:5173
bun run build     # production build → dist/
bun run preview   # serve dist/ locally
bun run typecheck # tsc --noEmit
bun test          # unit tests for the optimization core
```

Commits run a Husky pre-commit hook: Prettier (via lint-staged on staged files), then `bun run typecheck`, then `bun test`.

No environment variables or API keys required — all APIs are public.

## Configuration

All parameters are set in the sidebar UI and persisted automatically. Key inputs:

| Parameter          | Description                                                                         |
| ------------------ | ----------------------------------------------------------------------------------- |
| SOC now / target   | Current and desired battery state of charge (%)                                     |
| Battery capacity   | Usable kWh                                                                          |
| Charging loss      | Round-trip loss (%) — energy drawn from grid exceeds energy stored                  |
| Charging power     | kW at the charger                                                                   |
| Consecutive hours  | Contiguous block mode (default) vs. cheapest individual hours                       |
| Charge by          | Optional deadline — optimizer only uses hours that complete before this hour-of-day |
| Transfer day/night | Grid transfer fee (c/kWh); night rate applies 22:00–07:00                           |
| Buy margin         | Retailer margin on purchases (c/kWh, VAT-exclusive)                                 |
| Sell margin        | Deducted from spot when calculating solar sell-back value                           |
| Search window      | How many hours ahead to search for the optimal window                               |
| Solar PV (enable)  | Toggle solar influence on/off without losing panel configuration                    |

## Solar setup

1. Click **Get GPS** to store your coordinates
2. Set panel tilt, azimuth (compass degrees: 0 = N, 90 = E, 180 = S, 270 = W — converted automatically to Forecast.Solar's convention), and peak power (kWp)
3. Click **Fetch solar forecast** — data is cached until midnight (changing location or panel parameters prompts a refetch)

## APIs used

| API                                   | Purpose                                            | Cache                                                         |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `api.spot-hinta.fi/today`             | Actual spot prices incl. VAT (15-min → hourly avg) | Re-fetched until tomorrow's prices are available, then stable |
| `api.spot-hinta.fi/dayforward`        | Tomorrow's prices (available ~14:15)               | Same                                                          |
| `nordpool-predict-fi` prediction.json | ML forecast for unpriced hours                     | 1 h TTL                                                       |
| `api.forecast.solar`                  | Solar production estimate                          | Calendar day                                                  |
