import { useState, useEffect, useMemo, useCallback } from 'react'
import { Box, Typography, CircularProgress, Alert } from '@mui/material'
import { Sidebar } from './components/Sidebar'
import { StatusCard } from './components/StatusCard'
import { Metrics } from './components/Metrics'
import { HourList } from './components/HourList'
import { PriceChart } from './components/PriceChart'
import { fetchPrices } from './utils/api'
import { fetchSolarData, loadCachedSolar } from './utils/solar'
import { optimize, DEFAULT_PARAMS } from './utils/optimization'
import { lsGet, lsSet, LS_PARAMS, LS_GEO } from './utils/storage'
import type { Params, PriceEntry, SolarData, GeoCoords, OptimizeResult } from './types'

interface SpotStatus { ok: boolean; text: string }
interface SolarStatus { ok: boolean; warn: boolean; text: string }

const cachedSolar = loadCachedSolar()

export default function App() {
  const [params, setParams] = useState<Params>(() => ({
    ...DEFAULT_PARAMS,
    ...(lsGet<Partial<Params>>(LS_PARAMS) ?? {}),
  }))
  const [priceData,   setPriceData]   = useState<PriceEntry[]>([])
  const [solarData,   setSolarData]   = useState<SolarData>(cachedSolar ?? {})
  const [geoCoords,   setGeoCoords]   = useState<GeoCoords | null>(() => lsGet<GeoCoords>(LS_GEO))
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [spotStatus,  setSpotStatus]  = useState<SpotStatus>({ ok: false, text: 'Fetching...' })
  const [solarStatus, setSolarStatus] = useState<SolarStatus>(() =>
    cachedSolar
      ? { ok: true,  warn: false, text: `From cache — ${Object.keys(cachedSolar).length} h` }
      : { ok: false, warn: false, text: 'Not fetched — press button' }
  )

  // Persist params whenever they change
  useEffect(() => { lsSet(LS_PARAMS, params) }, [params])

  // Load prices on mount, refresh hourly
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    async function load() {
      try {
        setSpotStatus({ ok: false, text: 'Fetching price data...' })
        const { priceData: data, statusText } = await fetchPrices()
        setPriceData(data)
        setLoading(false)
        setSpotStatus({ ok: true, text: statusText })
        timer = setTimeout(load, 3_600_000)
      } catch (e) {
        setError((e as Error).message)
        setLoading(false)
        setSpotStatus({ ok: false, text: 'Connection error' })
      }
    }
    load()
    return () => clearTimeout(timer)
  }, [])

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
    () => optimize(priceData, solarData, params),
    [priceData, solarData, params]
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <Box
        component="header"
        sx={{
          display: 'flex', alignItems: 'baseline', gap: 2,
          px: 3.5, py: 2.25,
          borderBottom: '1px solid', borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography sx={{
          fontSize: 15, fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'primary.main',
        }}>
          EV Charging Optimizer
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.04em' }}>
          spot-hinta.fi · nordpool-predict-fi · Forecast.Solar
        </Typography>
      </Box>

      {/* Two-column layout */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '300px 1fr', flex: 1, minHeight: 0 }}>
        <Sidebar
          params={params}
          onParamChange={onParamChange}
          geoCoords={geoCoords}
          onGetGeo={handleGetGeo}
          onFetchSolar={handleFetchSolar}
          spotStatus={spotStatus}
          solarStatus={solarStatus}
        />

        <Box
          component="main"
          sx={{ p: '24px 28px', display: 'flex', flexDirection: 'column', gap: 2.5, overflowY: 'auto' }}
        >
          {loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary', py: 5 }}>
              <CircularProgress size={16} />
              <Typography variant="caption">Fetching price forecast...</Typography>
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ fontFamily: 'inherit', fontSize: 12 }}>
              {error}
            </Alert>
          )}

          {!loading && !error && result && (
            <>
              <StatusCard
                isGo={result.selectedTs.has(result.currentHour.ts)}
                isFull={result.nHours <= 0}
                firstSel={result.selectedList[0]}
                lastSel={result.selectedList[result.selectedList.length - 1]}
              />

              <Metrics
                hoursNeeded={result.hoursNeeded}
                nHours={result.nHours}
                totalCost={result.totalCost}
                solarNow={result.solarNow}
              />

              <Box sx={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 2, alignItems: 'start' }}>
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
  )
}
