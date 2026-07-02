import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Drawer,
  AppBar,
  Toolbar,
  Tooltip,
  ThemeProvider,
  CssBaseline,
  useMediaQuery,
} from '@mui/material'
import { createTheme } from '@mui/material/styles'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness'
import SettingsIcon from '@mui/icons-material/Settings'
import { Sidebar } from './components/Sidebar'
import { StatusCard } from './components/StatusCard'
import { Metrics } from './components/Metrics'
import { HourList } from './components/HourList'
// Chart.js (~39 kB gzip) is the heaviest non-MUI dep; defer it so it loads after first paint
const PriceChart = lazy(() => import('./components/PriceChart').then(m => ({ default: m.PriceChart })))
import { fetchPrices, awaitingDayAhead } from './utils/api'
import { fetchSolarData, loadCachedSolar, solarCacheKey, isValidGeo } from './utils/solar'
import { optimize, getTransfer, gridPower, DEFAULT_PARAMS, SLOT_MS } from './utils/optimization'
import { lsGet, lsSet, LS_PARAMS, LS_GEO, LS_COLOR_MODE, LS_NOTIFY, localDateStr } from './utils/storage'
import type { Params, PriceEntry, SolarData, GeoCoords, ApiStatus, OptimizeResult } from './types'

type ColorMode = 'light' | 'dark' | 'system'

const mergedParams: Params = { ...DEFAULT_PARAMS, ...(lsGet<Partial<Params>>(LS_PARAMS) ?? {}) }
// chargingPower is derived from the electrical inputs — heal any stale stored value on load
const storedParams: Params = { ...mergedParams, chargingPower: gridPower(mergedParams) }
const storedGeo = lsGet<GeoCoords>(LS_GEO)
const cachedSolar = loadCachedSolar(storedGeo, storedParams)

export default function App() {
  const [colorMode, setColorMode] = useState<ColorMode>(() => lsGet<ColorMode>(LS_COLOR_MODE) ?? 'system')
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const resolvedMode = colorMode === 'system' ? (systemDark ? 'dark' : 'light') : colorMode

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: resolvedMode,
          ...(resolvedMode === 'light' && { background: { default: '#f5f5f5' } }),
        },
      }),
    [resolvedMode],
  )
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'))

  const cycleColorMode = useCallback(() => {
    setColorMode(prev => {
      const next: ColorMode = prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system'
      lsSet(LS_COLOR_MODE, next)
      return next
    })
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [spotStatus, setSpotStatus] = useState<ApiStatus>({ ok: false, warn: false, text: 'Fetching...' })
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
        setSpotStatus({ ok: false, warn: false, text: hasData ? 'Refreshing prices...' : 'Fetching price data...' })
        const { priceData: data, statusText } = await fetchPrices()
        if (cancelled) return
        hasData = true
        // poll fast while tomorrow's day-ahead prices are due (~14:00 EET), hourly otherwise
        delay = awaitingDayAhead(data) ? 600_000 : 3_600_000
        setPriceData(data)
        setError(null)
        setSpotStatus({ ok: true, warn: false, text: statusText })
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
    setSolarStatus({ ok: false, warn: false, text: 'Fetching Open-Meteo...' })
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

  const sidebar = (
    <Sidebar
      params={params}
      onParamChange={onParamChange}
      onResetParams={handleResetParams}
      geoCoords={geoCoords}
      onGetGeo={handleGetGeo}
      onGeoField={handleGeoField}
      onFetchSolar={handleFetchSolar}
      onRefreshPrices={handleRefreshPrices}
      spotStatus={spotStatus}
      solarStatus={solarStatus}
      notifyEnabled={notifyEnabled}
      onToggleNotify={handleToggleNotify}
    />
  )

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          bgcolor: 'background.default',
          overflowX: 'hidden',
        }}
      >
        {/* Header */}
        <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar variant="dense" sx={{ gap: { xs: 1, sm: 2 } }}>
            <Typography
              variant="h6"
              component="h1"
              sx={{ flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              EV Charging Optimizer
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {[
                { label: 'spot-hinta.fi', href: 'https://spot-hinta.fi' },
                { label: 'nordpool-predict-fi', href: 'https://github.com/vividfog/nordpool-predict-fi' },
                { label: 'Open-Meteo', href: 'https://open-meteo.com' },
                { label: 'GitHub', href: 'https://github.com/ltpk/charging-optimizer' },
              ].map(({ label, href }, i, arr) => (
                <span key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    {label}
                  </a>
                  {i < arr.length - 1 && ' · '}
                </span>
              ))}
            </Typography>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tooltip title={`Theme: ${colorMode} (click to change)`}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={cycleColorMode}
                  aria-label={`Theme: ${colorMode}`}
                  sx={{ minWidth: 0, px: { xs: '5px', sm: 1.5 } }}
                >
                  {colorMode === 'light' ? (
                    <LightModeIcon fontSize="small" />
                  ) : colorMode === 'dark' ? (
                    <DarkModeIcon fontSize="small" />
                  ) : (
                    <SettingsBrightnessIcon fontSize="small" />
                  )}
                </Button>
              </Tooltip>
              <Button
                size="small"
                variant={sidebarOpen ? 'contained' : 'outlined'}
                onClick={() => setSidebarOpen(o => !o)}
                sx={{ display: { md: 'none' }, minWidth: 0, px: { xs: '5px', sm: 1.5 } }}
              >
                <SettingsIcon fontSize="small" />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 1 }}>
                  Settings
                </Box>
              </Button>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Sidebar + main */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, flex: 1, minHeight: 0 }}>
          {isMdUp ? (
            <Box sx={{ flexShrink: 0 }}>{sidebar}</Box>
          ) : (
            <Drawer
              anchor="left"
              open={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              ModalProps={{ keepMounted: true }}
              sx={{ '& .MuiDrawer-paper': { width: 300, maxWidth: '85vw' } }}
            >
              {sidebar}
            </Drawer>
          )}

          <Box
            component="main"
            sx={{
              p: { xs: '16px', sm: '24px 28px' },
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
              overflowY: 'auto',
              flex: 1,
              minWidth: 0,
            }}
          >
            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary', py: 5 }}>
                <CircularProgress size={16} />
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
                <StatusCard
                  isGo={isGo}
                  isFull={result.nHours <= 0}
                  firstSel={result.selectedList[0]}
                  lastSel={result.selectedList[result.selectedList.length - 1]}
                />

                {result.deadlinePassed && result.nHours > 0 ? (
                  <Alert severity="warning">
                    The charge-by deadline has already passed — pick a later time in the settings.
                  </Alert>
                ) : (
                  result.achievableHours + 0.01 < result.hoursNeeded && (
                    <Alert severity="warning">
                      Only {result.achievableHours.toFixed(1)} of {result.hoursNeeded.toFixed(1)} needed charging hours
                      fit
                      {params.chargeByEnabled ? ' before the deadline' : ' in the search window'} — target SOC won't be
                      reached.
                    </Alert>
                  )
                )}

                <Metrics
                  hoursNeeded={result.hoursNeeded}
                  kWhNeeded={result.kWhNeeded}
                  completionTime={result.completionTime}
                  nHours={result.nHours}
                  totalCost={result.totalCost}
                  savingsVsNow={result.savingsVsNow}
                  spotNow={result.currentSlot.spotCent}
                  netCostNow={result.currentSlot.netCost}
                  transferNow={getTransfer(params, result.currentSlot.hour)}
                  transferEnabled={params.transferEnabled}
                  solarNow={result.solarNow}
                  solarPct={result.solarPct}
                  solarSavings={result.solarSavings}
                  avgNetCost={result.avgNetCost}
                  solarEnabled={params.solarEnabled}
                />

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '200px 1fr' },
                    gap: 2,
                    alignItems: 'start',
                  }}
                >
                  <HourList
                    selectedList={result.selectedList}
                    netCostMin={result.netCostMin}
                    netCostMax={result.netCostMax}
                    currentTs={result.currentSlot.ts}
                  />
                  <Suspense
                    fallback={
                      <Box
                        sx={{
                          height: 281,
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CircularProgress size={24} />
                      </Box>
                    }
                  >
                    <PriceChart
                      slots={result.slots}
                      selectedTs={result.selectedTs}
                      nowIdx={result.nowIdx}
                      slotSources={result.slotSources}
                      horizonH={params.horizonH}
                      params={params}
                    />
                  </Suspense>
                </Box>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}
