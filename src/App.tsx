import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  ButtonBase,
  Tooltip,
  ThemeProvider,
  CssBaseline,
  useMediaQuery,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import TuneIcon from '@mui/icons-material/Tune'
import RefreshIcon from '@mui/icons-material/Refresh'
import { Controls } from './components/Controls'
import { SetupDialog } from './components/SetupDialog'
import type { ColorMode } from './components/SetupDialog'
import { PlanCard, planStatus, fmtNum, fmtTime } from './components/PlanCard'
// Chart.js (~39 kB gzip) is the heaviest non-MUI dep; defer it so it loads after first paint
const PriceChart = lazy(() => import('./components/PriceChart').then(m => ({ default: m.PriceChart })))
import { fetchPrices, awaitingDayAhead } from './utils/api'
import { fetchSolarData, loadCachedSolar, solarCacheKey, isValidGeo } from './utils/solar'
import { optimize, gridPower, DEFAULT_PARAMS, SLOT_MS } from './utils/optimization'
import { lsGet, lsSet, LS_PARAMS, LS_GEO, LS_COLOR_MODE, LS_NOTIFY, localDateStr } from './utils/storage'
import { buildTheme, MONO } from './theme'
import type { Params, PriceEntry, SolarData, GeoCoords, ApiStatus, OptimizeResult } from './types'

const mergedParams: Params = { ...DEFAULT_PARAMS, ...(lsGet<Partial<Params>>(LS_PARAMS) ?? {}) }
// chargingPower is derived from the electrical inputs — heal any stale stored value on load
const storedParams: Params = { ...mergedParams, chargingPower: gridPower(mergedParams) }
const storedGeo = lsGet<GeoCoords>(LS_GEO)
const cachedSolar = loadCachedSolar(storedGeo, storedParams)

export default function App() {
  const [colorMode, setColorMode] = useState<ColorMode>(() => lsGet<ColorMode>(LS_COLOR_MODE) ?? 'system')
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const resolvedMode = colorMode === 'system' ? (systemDark ? 'dark' : 'light') : colorMode

  const theme = useMemo(() => buildTheme(resolvedMode), [resolvedMode])
  // < 760 px: phone layout (theme `sm` breakpoint)
  const narrow = useMediaQuery(theme.breakpoints.down('sm'))

  const changeColorMode = useCallback((next: ColorMode) => {
    setColorMode(next)
    lsSet(LS_COLOR_MODE, next)
  }, [])

  const [params, setParams] = useState<Params>(storedParams)
  // ticks at 15-min slot granularity so the optimizer's "now" advances even without a data refresh
  const [now, setNow] = useState(() => new Date())
  const [notifyEnabled, setNotifyEnabled] = useState<boolean>(() => lsGet<boolean>(LS_NOTIFY) ?? false)
  const [priceData, setPriceData] = useState<PriceEntry[]>([])
  const [solarData, setSolarData] = useState<SolarData>(cachedSolar ?? {})
  const [geoCoords, setGeoCoords] = useState<GeoCoords | null>(storedGeo)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pricesAt, setPricesAt] = useState<Date | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [spotStatus, setSpotStatus] = useState<ApiStatus>({ ok: false, warn: false, text: 'Fetching...', busy: true })
  const [solarStatus, setSolarStatus] = useState<ApiStatus>(() =>
    cachedSolar
      ? { ok: true, warn: false, text: `From cache — ${Object.keys(cachedSolar).length} h` }
      : { ok: false, warn: false, text: 'No solar forecast — fetch above' },
  )
  // the location/panel setup the current solarData was fetched for — used to warn when params drift
  const fetchedSolarKeyRef = useRef<string | null>(cachedSolar ? solarCacheKey(storedGeo, storedParams) : null)
  // local day the forecast was fetched — a new day needs a fresh fetch (cache is only valid same-day)
  const fetchedSolarDayRef = useRef<string | null>(cachedSolar ? localDateStr() : null)
  // whether the current solarStatus is the params-drift warning (so it can be cleared on revert)
  const driftWarnRef = useRef(false)

  useEffect(() => {
    lsSet(LS_PARAMS, params)
  }, [params])

  useEffect(() => {
    if (geoCoords) lsSet(LS_GEO, geoCoords)
  }, [geoCoords])

  // advance `now` only when the clock crosses a 15-min slot boundary (optimize output is
  // slot-granular); also re-check when the tab returns to the foreground after being throttled
  useEffect(() => {
    const tick = () =>
      setNow(prev => {
        const next = new Date()
        return Math.floor(next.getTime() / SLOT_MS) !== Math.floor(prev.getTime() / SLOT_MS) ? next : prev
      })
    // fire right at the next slot boundary (not on an arbitrary 60s cadence) so the Go/Wait
    // status and charge-now notification flip the instant the window starts, not up to a minute late
    let id: ReturnType<typeof setTimeout>
    const schedule = () => {
      const nowMs = Date.now()
      const untilBoundary = SLOT_MS - (nowMs % SLOT_MS)
      id = setTimeout(() => {
        tick()
        schedule()
      }, untilBoundary + 50) // small buffer so we're safely past the boundary
    }
    schedule()
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(id)
        tick()
        schedule()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const refreshRef = useRef<() => void>(() => {})

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false
    let hasData = false
    let inFlight = false
    let nextRefreshAt = Infinity

    async function load() {
      if (inFlight) return // manual refresh / visibility catch-up while a fetch is running
      inFlight = true
      clearTimeout(timer)
      let delay = 300_000 // quick retry after a failure
      try {
        setSpotStatus({
          ok: false,
          warn: false,
          text: hasData ? 'Refreshing prices...' : 'Fetching price data...',
          busy: true,
        })
        const { priceData: data, statusText } = await fetchPrices()
        if (cancelled) return
        hasData = true
        // poll fast while tomorrow's day-ahead prices are due (~14:00 EET), hourly otherwise
        delay = awaitingDayAhead(data) ? 600_000 : 3_600_000
        setPriceData(data)
        setError(null)
        setSpotStatus({ ok: true, warn: false, text: statusText })
        setPricesAt(new Date())
      } catch (e) {
        if (cancelled) return
        const msg = (e as Error).message
        if (hasData) {
          setSpotStatus({ ok: false, warn: true, text: `Refresh failed — ${msg}` })
        } else {
          setError(msg)
          setSpotStatus({ ok: false, warn: true, text: 'Connection error' })
        }
      } finally {
        inFlight = false
        if (!cancelled) {
          setLoading(false)
          nextRefreshAt = Date.now() + delay
          timer = setTimeout(load, delay)
        }
      }
    }

    // background tabs throttle timers, so the refresh can sleep well past its slot —
    // catch up as soon as the tab is visible again and the scheduled time has passed
    const onVisible = () => {
      if (!document.hidden && Date.now() >= nextRefreshAt) load()
    }
    document.addEventListener('visibilitychange', onVisible)

    refreshRef.current = load
    load()
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const handleRefreshPrices = useCallback(() => refreshRef.current(), [])

  const onParamChange = useCallback(<K extends keyof Params>(key: K, value: Params[K]) => {
    setParams(p => {
      const next = { ...p, [key]: value }
      // grid power is derived; keep it in sync when an electrical input changes
      if (key === 'phases' || key === 'amperage' || key === 'voltage' || key === 'chargerCap') {
        next.chargingPower = gridPower(next)
      }
      return next
    })
  }, [])

  const handleResetParams = useCallback(() => {
    setParams({ ...DEFAULT_PARAMS, chargingPower: gridPower(DEFAULT_PARAMS) })
  }, [])

  const handleGetGeo = useCallback(() => {
    if (!navigator.geolocation) {
      setSolarStatus({ ok: false, warn: true, text: 'No location service — type coordinates instead' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGeoCoords({
          lat: pos.coords.latitude.toFixed(5),
          lon: pos.coords.longitude.toFixed(5),
        })
      },
      // denied permission / no fix — the lat/lon fields remain as a manual fallback
      () => setSolarStatus({ ok: false, warn: true, text: 'Location unavailable — type coordinates instead' }),
    )
  }, [])

  const handleGeoField = useCallback((key: keyof GeoCoords, value: string) => {
    setGeoCoords(prev => ({ lat: '', lon: '', ...prev, [key]: value }))
  }, [])

  const handleFetchSolar = useCallback(async () => {
    if (!isValidGeo(geoCoords)) {
      setSolarStatus({ ok: false, warn: true, text: 'Set location first (GPS or type coordinates)' })
      return
    }
    setSolarStatus({ ok: false, warn: false, text: 'Fetching Open-Meteo...', busy: true })
    try {
      const data = await fetchSolarData(geoCoords, params)
      setSolarData(data)
      fetchedSolarKeyRef.current = solarCacheKey(geoCoords, params)
      fetchedSolarDayRef.current = localDateStr()
      driftWarnRef.current = false
      setSolarStatus({ ok: true, warn: false, text: `${Object.keys(data).length} h fetched` })
    } catch (e) {
      setSolarStatus({ ok: false, warn: true, text: `Error: ${(e as Error).message}` })
    }
  }, [geoCoords, params])

  // warn when location/panel params no longer match the forecast on screen — and clear
  // the warning again if the user reverts them to the fetched setup
  useEffect(() => {
    const key = solarCacheKey(geoCoords, params)
    if (!fetchedSolarKeyRef.current) return
    if (key !== fetchedSolarKeyRef.current) {
      driftWarnRef.current = true
      setSolarStatus({ ok: false, warn: true, text: 'Panel settings changed — refetch forecast' })
    } else if (driftWarnRef.current) {
      driftWarnRef.current = false
      setSolarStatus({ ok: true, warn: false, text: `${Object.keys(solarData).length} h loaded` })
    }
  }, [geoCoords, params.solarDec, params.solarAz, params.solarKwp]) // eslint-disable-line react-hooks/exhaustive-deps

  // auto-fetch the forecast when solar is enabled with a valid location but there's no data
  // for today (first visit, cache expired overnight, or the toggle just flipped on). Param-drift
  // refetches stay manual: NumField commits per keystroke, so auto-fetching would spam the API.
  useEffect(() => {
    const check = () => {
      if (!params.solarEnabled || !isValidGeo(geoCoords)) return
      if (fetchedSolarKeyRef.current !== null && fetchedSolarDayRef.current === localDateStr()) return
      handleFetchSolar()
    }
    // debounced — manual coordinate typing commits per keystroke
    const debounce = setTimeout(check, 800)
    // re-check just past local midnight so the forecast rolls over to the new day
    let midnight: ReturnType<typeof setTimeout>
    const armMidnight = () => {
      const t = new Date()
      const next = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, 0, 0, 10)
      midnight = setTimeout(() => {
        check()
        armMidnight()
      }, next.getTime() - t.getTime())
    }
    armMidnight()
    // throttled background tabs can sleep through the midnight timer — catch up when visible
    const onVisible = () => {
      if (!document.hidden) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(debounce)
      clearTimeout(midnight)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [params.solarEnabled, geoCoords, handleFetchSolar])

  const result = useMemo<OptimizeResult | null>(
    () => optimize(priceData, solarData, params, now),
    [priceData, solarData, params, now],
  )

  const isGo = !!result && result.selectedTs.has(result.currentSlot.ts)

  const handleToggleNotify = useCallback(async (enabled: boolean) => {
    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    setNotifyEnabled(enabled)
    lsSet(LS_NOTIFY, enabled)
  }, [])

  // fire a notification on the rising edge of the charging window (tab must be open);
  // baseline on the first result so a window already active at load doesn't notify
  const prevGoRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (!result) return
    if (
      prevGoRef.current !== null &&
      notifyEnabled &&
      isGo &&
      !prevGoRef.current &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification('Charge now', { body: 'The optimal charging window has started.' })
    }
    prevGoRef.current = isGo
  }, [result, isGo, notifyEnabled])

  // once the plan card scrolls out of view, the sticky app bar shows a compact summary instead
  const [heroVisible, setHeroVisible] = useState(true)
  const heroObserver = useRef<IntersectionObserver | null>(null)
  const heroRef = useCallback((el: HTMLElement | null) => {
    heroObserver.current?.disconnect()
    if (!el) return setHeroVisible(true)
    heroObserver.current = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px', // app bar height
    })
    heroObserver.current.observe(el)
  }, [])

  const status = result
    ? planStatus(isGo, result.nHours <= 0, result.selectedList[0], result.selectedList[result.selectedList.length - 1])
    : null
  const ev = theme.palette.ev
  const toneColor = status ? (status.tone === 'muted' ? ev.muted : ev[status.tone]) : ev.muted

  // header freshness chip — fed by the price/solar statuses; click refreshes both
  const solarOn = params.solarEnabled
  const busy = spotStatus.busy || (solarOn && solarStatus.busy)
  const fresh = busy
    ? { warn: false, text: 'Refreshing…', short: 'Refreshing…' }
    : spotStatus.warn
      ? { warn: true, text: 'Price refresh failed', short: 'Refresh failed' }
      : solarOn && solarStatus.warn
        ? driftWarnRef.current
          ? { warn: true, text: 'Panel settings changed — refetch', short: 'Refetch solar' }
          : { warn: true, text: solarStatus.text, short: 'Solar issue' }
        : {
            warn: false,
            text: `Prices ${pricesAt ? fmtTime(pricesAt) : '–'}${solarOn && solarStatus.ok ? ' · solar today' : ''}`,
            short: 'Up to date',
          }
  const refreshAll = () => {
    handleRefreshPrices()
    if (solarOn) handleFetchSolar()
  }

  const alertSx = {
    display: 'flex',
    gap: 1.25,
    alignItems: 'center',
    px: 1.75,
    py: 1.25,
    borderRadius: '10px',
    bgcolor: alpha(ev.warn, 0.12),
    fontSize: 13.5,
    '&::before': {
      content: '"!"',
      flexShrink: 0,
      width: 20,
      height: 20,
      borderRadius: '50%',
      bgcolor: 'ev.warn',
      color: 'background.paper',
      fontWeight: 700,
      fontSize: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
  } as const

  const pagePx = { xs: 2, sm: 3.5 }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* clip, not hidden — hidden makes this a scroll container and breaks the sticky header */}
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'clip' }}>
        <Box
          component="header"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 'appBar',
            height: 56,
            bgcolor: alpha(ev.bg, 0.88),
            backdropFilter: 'blur(10px)',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{ maxWidth: 1200, mx: 'auto', px: pagePx, height: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}
          >
            {!heroVisible && status && result ? (
              // hero scrolled away — keep the answer in view
              <ButtonBase
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                sx={{
                  bgcolor: toneColor,
                  color: 'ev.onTone',
                  borderRadius: 999,
                  px: 1.75,
                  py: 0.875,
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {status.short}
                {result.nHours > 0 && result.selectedList.length > 0 ? ` · ${fmtNum(result.totalCost)} €` : ''}
              </ButtonBase>
            ) : (
              <Box
                component="h1"
                sx={{
                  m: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  fontSize: 15,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: '6px',
                    bgcolor: 'ev.go',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <svg width="11" height="13" viewBox="0 0 11 13" aria-hidden>
                    <path d="M6.5 0 0 7.2h4L3 13l8-7.6H6.8z" fill={ev.onTone} />
                  </svg>
                </Box>
                {narrow ? 'Charging' : 'EV Charging Optimizer'}
              </Box>
            )}
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
              <Tooltip
                title={
                  <>
                    {spotStatus.text}
                    {solarOn && (
                      <>
                        <br />
                        Solar: {solarStatus.text}
                      </>
                    )}
                    <br />
                    Click to refresh
                  </>
                }
              >
                <ButtonBase
                  onClick={refreshAll}
                  aria-label="Refresh data"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.375,
                    py: 0.75,
                    minHeight: 32,
                    borderRadius: 999,
                    border: 1,
                    fontFamily: MONO,
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    ...(fresh.warn
                      ? {
                          color: 'ev.warn',
                          fontWeight: 600,
                          borderColor: alpha(ev.warn, 0.45),
                          bgcolor: alpha(ev.warn, 0.1),
                        }
                      : { color: 'text.secondary', fontWeight: 500, borderColor: 'divider' }),
                  }}
                >
                  {busy ? (
                    <CircularProgress size={7} thickness={7} color="inherit" />
                  ) : (
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: fresh.warn ? 'ev.warn' : 'ev.go' }} />
                  )}
                  {narrow ? fresh.short : fresh.text}
                  <RefreshIcon sx={{ fontSize: 13, opacity: 0.8 }} />
                </ButtonBase>
              </Tooltip>
              <Button
                variant="outlined"
                color="inherit"
                onClick={() => setSetupOpen(true)}
                aria-label="Setup"
                startIcon={narrow ? undefined : <TuneIcon sx={{ fontSize: '16px !important' }} />}
                sx={{
                  minHeight: 34,
                  minWidth: 0,
                  px: narrow ? 1 : 1.5,
                  fontSize: 12.5,
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  '&:hover': { borderColor: 'ev.micro' },
                }}
              >
                {narrow ? <TuneIcon sx={{ fontSize: 18 }} /> : 'Setup'}
              </Button>
            </Box>
          </Box>
        </Box>

        <SetupDialog
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          narrow={narrow}
          params={params}
          onParamChange={onParamChange}
          onResetParams={handleResetParams}
          colorMode={colorMode}
          onColorMode={changeColorMode}
          geoCoords={geoCoords}
          onGetGeo={handleGetGeo}
          onGeoField={handleGeoField}
          onFetchSolar={handleFetchSolar}
          solarStatus={solarStatus}
        />

        <Box
          component="main"
          sx={{
            width: 1,
            maxWidth: 1200,
            mx: 'auto',
            px: pagePx,
            pt: { xs: 2.5, sm: 4 },
            pb: pagePx,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            flex: 1,
          }}
        >
          {loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary', py: 5 }}>
              <CircularProgress size={16} color="inherit" />
              <Typography variant="caption">Fetching price forecast...</Typography>
            </Box>
          )}

          {error && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={handleRefreshPrices}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          )}

          {!loading && !error && result && (
            <>
              <Box ref={heroRef}>
                <PlanCard
                  isGo={isGo}
                  isFull={result.nHours <= 0}
                  firstSel={result.selectedList[0]}
                  lastSel={result.selectedList[result.selectedList.length - 1]}
                  hoursNeeded={result.hoursNeeded}
                  kWhNeeded={result.kWhNeeded}
                  chargingPower={params.chargingPower}
                  completionTime={result.completionTime}
                  totalCost={result.totalCost}
                  avgNetCost={result.avgNetCost}
                  savingsVsNow={result.savingsVsNow}
                  solarEnabled={params.solarEnabled}
                  solarPct={result.solarPct}
                  solarSavings={result.solarSavings}
                />
              </Box>

              {result.deadlinePassed && result.nHours > 0 ? (
                <Box sx={alertSx}>The charge-by deadline has already passed — pick a later time.</Box>
              ) : (
                result.achievableHours + 0.01 < result.hoursNeeded && (
                  <Box sx={alertSx}>
                    Only {fmtNum(result.achievableHours, 1)} of {fmtNum(result.hoursNeeded, 1)} needed charging hours
                    fit
                    {params.chargeByEnabled ? ' before the deadline' : ' in the search window'} — target SOC won't be
                    reached.
                  </Box>
                )
              )}
            </>
          )}

          <Controls
            params={params}
            onParamChange={onParamChange}
            notifyEnabled={notifyEnabled}
            onToggleNotify={handleToggleNotify}
            narrow={narrow}
          />

          {!loading && !error && result && (
            <Suspense
              fallback={
                <Box
                  sx={{
                    height: narrow ? 320 : 440,
                    borderRadius: '12px',
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <CircularProgress size={24} color="inherit" />
                </Box>
              }
            >
              <PriceChart
                slots={result.slots}
                selectedTs={result.selectedTs}
                nowIdx={result.nowIdx}
                slotSources={result.slotSources}
                completionTime={result.completionTime}
                horizonH={params.horizonH}
                params={params}
                narrow={narrow}
              />
            </Suspense>
          )}

          {/* data sources + repo */}
          <Box component="footer" sx={{ fontSize: 12, color: 'ev.micro', pt: 0.5, pb: 1, mt: 'auto' }}>
            Data:{' '}
            {[
              { label: 'spot-hinta.fi', href: 'https://spot-hinta.fi' },
              { label: 'nordpool-predict-fi', href: 'https://github.com/vividfog/nordpool-predict-fi' },
              { label: 'Open-Meteo', href: 'https://open-meteo.com' },
            ].map(({ label, href }, i, arr) => (
              <span key={label}>
                <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                  {label}
                </a>
                {i < arr.length - 1 && ' · '}
              </span>
            ))}
            {' — '}
            <a
              href="https://github.com/ltpk/charging-optimizer"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit' }}
            >
              Source on GitHub
            </a>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}
