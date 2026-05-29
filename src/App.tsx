import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Box, Typography, CircularProgress, Alert, Button, Collapse,
  AppBar, Toolbar, ToggleButtonGroup, ToggleButton,
  ThemeProvider, CssBaseline, useMediaQuery,
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
import { fetchSolarData, loadCachedSolar } from './utils/solar'
import { optimize, DEFAULT_PARAMS } from './utils/optimization'
import { lsGet, lsSet, LS_PARAMS, LS_GEO, LS_COLOR_MODE, LS_NOTIFY } from './utils/storage'
import type { Params, PriceEntry, SolarData, GeoCoords, OptimizeResult } from './types'

type ColorMode = 'light' | 'dark' | 'system'

interface SpotStatus { ok: boolean; warn: boolean; text: string }
interface SolarStatus { ok: boolean; warn: boolean; text: string }

const cachedSolar = loadCachedSolar()

export default function App() {
  const [colorMode, setColorMode] = useState<ColorMode>(() =>
    lsGet<ColorMode>(LS_COLOR_MODE) ?? 'system'
  )
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const isMdUp = useMediaQuery('(min-width:900px)')
  const resolvedMode = colorMode === 'system' ? (systemDark ? 'dark' : 'light') : colorMode

  const theme = useMemo(() => createTheme({
    palette: {
      mode: resolvedMode,
      ...(resolvedMode === 'light' && { background: { default: '#f5f5f5' } }),
    },
  }), [resolvedMode])

  const handleColorMode = useCallback((_: unknown, v: ColorMode | null) => {
    if (!v) return
    setColorMode(v)
    lsSet(LS_COLOR_MODE, v)
  }, [])

  const [params, setParams] = useState<Params>(() => ({
    ...DEFAULT_PARAMS,
    ...(lsGet<Partial<Params>>(LS_PARAMS) ?? {}),
  }))
  // ticks at hour granularity so the optimizer's "now" advances even without a data refresh
  const [now, setNow] = useState(() => new Date())
  const [notifyEnabled, setNotifyEnabled] = useState<boolean>(() => lsGet<boolean>(LS_NOTIFY) ?? false)
  const [priceData,   setPriceData]   = useState<PriceEntry[]>([])
  const [solarData,   setSolarData]   = useState<SolarData>(cachedSolar ?? {})
  const [geoCoords,   setGeoCoords]   = useState<GeoCoords | null>(() => lsGet<GeoCoords>(LS_GEO))
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [spotStatus,  setSpotStatus]  = useState<SpotStatus>({ ok: false, warn: false, text: 'Fetching...' })
  const [solarStatus, setSolarStatus] = useState<SolarStatus>(() =>
    cachedSolar
      ? { ok: true,  warn: false, text: `From cache — ${Object.keys(cachedSolar).length} h` }
      : { ok: false, warn: false, text: 'No solar forecast — fetch above' }
  )

  useEffect(() => { lsSet(LS_PARAMS, params) }, [params])

  // advance `now` only when the clock hour changes (optimize output is hour-granular);
  // also re-check when the tab returns to the foreground after being throttled/asleep
  useEffect(() => {
    const tick = () => setNow(prev => {
      const next = new Date()
      return Math.floor(next.getTime() / 3_600_000) !== Math.floor(prev.getTime() / 3_600_000) ? next : prev
    })
    const id = setInterval(tick, 60_000)
    const onVisible = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  const refreshRef = useRef<() => void>(() => {})

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false
    let hasData = false

    async function load() {
      clearTimeout(timer)
      try {
        setSpotStatus({ ok: false, warn: false, text: hasData ? 'Refreshing prices...' : 'Fetching price data...' })
        const { priceData: data, statusText } = await fetchPrices()
        if (cancelled) return
        hasData = true
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
          timer = setTimeout(load, 3_600_000)
        }
      }
    }

    refreshRef.current = load
    load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])

  const handleRefreshPrices = useCallback(() => refreshRef.current(), [])

  const onParamChange = useCallback(<K extends keyof Params>(key: K, value: Params[K]) => {
    setParams(p => ({ ...p, [key]: value }))
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
      setSolarStatus({ ok: true, warn: false, text: `${Object.keys(data).length} h fetched` })
    } catch (e) {
      setSolarStatus({ ok: false, warn: true, text: `Error: ${(e as Error).message}` })
    }
  }, [geoCoords, params])

  const result = useMemo<OptimizeResult | null>(
    () => optimize(priceData, solarData, params, now),
    [priceData, solarData, params, now]
  )

  const isGo = !!result && result.selectedTs.has(result.currentHour.ts)

  const handleToggleNotify = useCallback(async (enabled: boolean) => {
    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    setNotifyEnabled(enabled)
    lsSet(LS_NOTIFY, enabled)
  }, [])

  // fire a notification on the rising edge of the charging window (tab must be open)
  const prevGoRef = useRef(false)
  useEffect(() => {
    if (notifyEnabled && isGo && !prevGoRef.current &&
        'Notification' in window && Notification.permission === 'granted') {
      new Notification('Charge now', { body: 'The optimal charging window has started.' })
    }
    prevGoRef.current = isGo
  }, [isGo, notifyEnabled])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default', overflowX: 'hidden' }}>
        {/* Header */}
        <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar variant="dense" sx={{ gap: { xs: 1, sm: 2 } }}>
            <Typography variant="h6" component="h1" sx={{ flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              EV Charging Optimizer
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {[
                { label: 'spot-hinta.fi',        href: 'https://spot-hinta.fi' },
                { label: 'nordpool-predict-fi',   href: 'https://github.com/vividfog/nordpool-predict-fi' },
                { label: 'Forecast.Solar',        href: 'https://forecast.solar' },
                { label: 'GitHub',                href: 'https://github.com/ltpk/charging-optimizer' },
              ].map(({ label, href }, i, arr) => (
                <span key={label}>
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >{label}</a>
                  {i < arr.length - 1 && ' · '}
                </span>
              ))}
            </Typography>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              <ToggleButtonGroup value={colorMode} exclusive onChange={handleColorMode} size="small">
                <ToggleButton value="light"  aria-label="Light mode"><LightModeIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="system" aria-label="System mode"><SettingsBrightnessIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="dark"   aria-label="Dark mode"><DarkModeIcon fontSize="small" /></ToggleButton>
              </ToggleButtonGroup>
              <Button
                size="small"
                variant={sidebarOpen ? 'contained' : 'outlined'}
                onClick={() => setSidebarOpen(o => !o)}
                sx={{ display: { md: 'none' }, minWidth: 0, px: { xs: '5px', sm: 1.5 } }}
              >
                <SettingsIcon fontSize="small" />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 1 }}>Settings</Box>
              </Button>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Sidebar + main */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, flex: 1, minHeight: 0 }}>
          <Box sx={{ flexShrink: 0 }}>
            <Collapse in={isMdUp || sidebarOpen}>
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
            </Collapse>
          </Box>

          <Box
            component="main"
            sx={{ p: { xs: '16px', sm: '24px 28px' }, display: 'flex', flexDirection: 'column', gap: 2.5, overflowY: 'auto', flex: 1, minWidth: 0 }}
          >
            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary', py: 5 }}>
                <CircularProgress size={16} />
                <Typography variant="caption">Fetching price forecast...</Typography>
              </Box>
            )}

            {error && (
              <Alert severity="error">{error}</Alert>
            )}

            {!loading && !error && result && (
              <>
                <StatusCard
                  isGo={isGo}
                  isFull={result.nHours <= 0}
                  firstSel={result.selectedList[0]}
                  lastSel={result.selectedList[result.selectedList.length - 1]}
                />

                {result.selectedList.length < result.nHours && (
                  <Alert severity="warning">
                    Only {result.selectedList.length} of {result.nHours} needed hours fit
                    {params.chargeByEnabled ? ' before the deadline' : ' in the search window'} — target SOC won't be reached.
                  </Alert>
                )}

                <Metrics
                  hoursNeeded={result.hoursNeeded}
                  nHours={result.nHours}
                  totalCost={result.totalCost}
                  solarNow={result.solarNow}
                  avgNetCost={result.avgNetCost}
                  solarEnabled={params.solarEnabled}
                />

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '200px 1fr' }, gap: 2, alignItems: 'start' }}>
                  <HourList selectedList={result.selectedList} />
                  <PriceChart
                    hours={result.hours}
                    selectedTs={result.selectedTs}
                    nowIdx={result.nowIdx}
                    hourSources={result.hourSources}
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
