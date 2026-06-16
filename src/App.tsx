import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
import { PriceChart } from './components/PriceChart'
import { fetchPrices } from './utils/api'
import { fetchSolarData, loadCachedSolar, solarCacheKey } from './utils/solar'
import { optimize, getTransfer, gridPower, DEFAULT_PARAMS, SLOT_MS } from './utils/optimization'
import { lsGet, lsSet, LS_PARAMS, LS_GEO, LS_COLOR_MODE, LS_NOTIFY } from './utils/storage'
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

  useEffect(() => {
    lsSet(LS_PARAMS, params)
  }, [params])

  // advance `now` only when the clock crosses a 15-min slot boundary (optimize output is
  // slot-granular); also re-check when the tab returns to the foreground after being throttled
  useEffect(() => {
    const tick = () =>
      setNow(prev => {
        const next = new Date()
        return Math.floor(next.getTime() / SLOT_MS) !== Math.floor(prev.getTime() / SLOT_MS) ? next : prev
      })
    const id = setInterval(tick, 60_000)
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const refreshRef = useRef<() => void>(() => {})

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false
    let hasData = false

    async function load() {
      clearTimeout(timer)
      let ok = false
      try {
        setSpotStatus({ ok: false, warn: false, text: hasData ? 'Refreshing prices...' : 'Fetching price data...' })
        const { priceData: data, statusText } = await fetchPrices()
        if (cancelled) return
        hasData = true
        ok = true
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
        if (!cancelled) {
          setLoading(false)
          // hourly refresh on success, quick retry after a failure
          timer = setTimeout(load, ok ? 3_600_000 : 300_000)
        }
      }
    }

    refreshRef.current = load
    load()
    return () => {
      cancelled = true
      clearTimeout(timer)
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

  const handleGetGeo = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(pos => {
      const coords: GeoCoords = {
        lat: pos.coords.latitude.toFixed(5),
        lon: pos.coords.longitude.toFixed(5),
      }
      setGeoCoords(coords)
      lsSet(LS_GEO, coords)
    })
  }, [])

  const handleFetchSolar = useCallback(async () => {
    if (!geoCoords) {
      setSolarStatus({ ok: false, warn: true, text: 'Fetch GPS location first' })
      return
    }
    setSolarStatus({ ok: false, warn: false, text: 'Fetching Forecast.Solar...' })
    try {
      const data = await fetchSolarData(geoCoords, params)
      setSolarData(data)
      fetchedSolarKeyRef.current = solarCacheKey(geoCoords, params)
      setSolarStatus({ ok: true, warn: false, text: `${Object.keys(data).length} h fetched` })
    } catch (e) {
      setSolarStatus({ ok: false, warn: true, text: `Error: ${(e as Error).message}` })
    }
  }, [geoCoords, params])

  // warn when location/panel params no longer match the forecast on screen
  useEffect(() => {
    const key = solarCacheKey(geoCoords, params)
    if (fetchedSolarKeyRef.current && key !== fetchedSolarKeyRef.current) {
      setSolarStatus({ ok: false, warn: true, text: 'Panel settings changed — refetch forecast' })
    }
  }, [geoCoords, params.solarDec, params.solarAz, params.solarKwp]) // eslint-disable-line react-hooks/exhaustive-deps

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
      geoCoords={geoCoords}
      onGetGeo={handleGetGeo}
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
                { label: 'Forecast.Solar', href: 'https://forecast.solar' },
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
                  <PriceChart
                    slots={result.slots}
                    selectedTs={result.selectedTs}
                    nowIdx={result.nowIdx}
                    slotSources={result.slotSources}
                    horizonH={params.horizonH}
                    params={params}
                  />
                </Box>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}
