import { useId } from 'react'
import {
  Box, Divider, Slider, TextField, Checkbox, ToggleButton, ToggleButtonGroup,
  FormControlLabel, Button, Typography, Paper, CircularProgress, IconButton,
} from '@mui/material'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import RefreshIcon from '@mui/icons-material/Refresh'
import type { Params, GeoCoords } from '../types'

// ── helpers ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
      {children}
    </Typography>
  )
}

interface SliderFieldProps {
  label: string
  value: number
  unit: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}

function SliderField({ label, value, unit, min, max, step, onChange }: SliderFieldProps) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="body2" fontWeight="medium">{value} {unit}</Typography>
      </Box>
      <Slider
        value={value}
        min={min} max={max} step={step}
        size="small"
        aria-label={label}
        onChange={(_, v) => onChange(v as number)}
      />
    </Box>
  )
}

interface NumFieldProps {
  label: string
  value: number
  step?: number
  min?: number
  max?: number
  onCommit: (v: number) => void
}

function NumField({ label, value, step, min, max, onCommit }: NumFieldProps) {
  const id = useId()
  return (
    <Box>
      <Typography component="label" htmlFor={id} variant="body2" color="text.secondary" display="block" gutterBottom>
        {label}
      </Typography>
      <TextField
        id={id}
        type="number"
        defaultValue={value}
        key={value}   // force re-mount when value changes externally (e.g. localStorage restore)
        inputProps={{ step, min, max }}
        size="small"
        fullWidth
        onBlur={e => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onCommit(v)
        }}
      />
    </Box>
  )
}

// ── status dots ────────────────────────────────────────────────

function StatusDot({ ok, warn }: { ok: boolean; warn: boolean }) {
  if (!ok && !warn) return <CircularProgress size={10} />
  return <FiberManualRecordIcon color={ok ? 'success' : 'warning'} sx={{ fontSize: 10 }} />
}

// ── main component ─────────────────────────────────────────────

interface Props {
  params: Params
  onParamChange: <K extends keyof Params>(key: K, value: Params[K]) => void
  geoCoords: GeoCoords | null
  onGetGeo: () => void
  onFetchSolar: () => void
  onRefreshPrices: () => void
  spotStatus: { ok: boolean; warn: boolean; text: string }
  solarStatus: { ok: boolean; warn: boolean; text: string }
}

export function Sidebar({ params, onParamChange, geoCoords, onGetGeo, onFetchSolar, onRefreshPrices, spotStatus, solarStatus }: Props) {
  const p = <K extends keyof Params>(key: K) => (v: Params[K]) => onParamChange(key, v)

  return (
    <Paper
      component="aside"
      square
      elevation={0}
      sx={{
        borderRadius: 0,
        px: 2, py: 2.5,
        width: { md: 300 },
        display: 'flex', flexDirection: 'column', gap: 1.75,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Battery state */}
      <Box>
        <SectionLabel>Battery State</SectionLabel>
        <SliderField label="SOC now"    value={params.socNow}    unit="%" min={0} max={100} step={1} onChange={p('socNow')} />
        <Box mt={1.5} />
        <SliderField label="SOC target" value={params.socTarget} unit="%" min={10} max={100} step={10} onChange={p('socTarget')} />
        {params.socNow >= params.socTarget && (
          <Typography variant="caption" color="warning.main" display="block" mt={0.5}>
            SOC now ≥ target — battery already full
          </Typography>
        )}
      </Box>

      <Divider />

      {/* Charging parameters */}
      <Box>
        <SectionLabel>Charging Parameters</SectionLabel>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <NumField label="Battery capacity (kWh)" value={params.batteryCapacity} step={1}   onCommit={p('batteryCapacity')} />
          <NumField label="Charging loss (%)"      value={params.chargingLoss}    step={1}   onCommit={p('chargingLoss')} />
          <NumField label="Charging power (kW)"    value={params.chargingPower}   step={0.1} min={0.1} onCommit={p('chargingPower')} />
          <FormControlLabel
            sx={{ mx: 0, gap: 0.5 }}
            control={
              <Checkbox
                size="small"
                checked={params.consecutive}
                onChange={e => onParamChange('consecutive', e.target.checked)}
              />
            }
            label={<Typography variant="body2" color="text.secondary">Consecutive hours</Typography>}
          />
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Search window
            </Typography>
            <ToggleButtonGroup
              value={params.horizonH}
              exclusive
              fullWidth
              size="small"
              onChange={(_, v: number | null) => { if (v != null) onParamChange('horizonH', v) }}
            >
              <ToggleButton value={24}>24 h</ToggleButton>
              <ToggleButton value={48}>48 h</ToggleButton>
              <ToggleButton value={72}>72 h</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FormControlLabel
              sx={{ mx: 0, gap: 0.5, flex: 1 }}
              control={
                <Checkbox
                  size="small"
                  checked={params.chargeByEnabled}
                  onChange={e => onParamChange('chargeByEnabled', e.target.checked)}
                />
              }
              label={<Typography variant="body2" color="text.secondary">Charge by</Typography>}
            />
            {params.chargeByEnabled && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TextField
                  type="number"
                  defaultValue={params.chargeByHour}
                  key={params.chargeByHour}
                  inputProps={{ min: 0, max: 23, step: 1 }}
                  size="small"
                  sx={{ width: 60 }}
                  onBlur={e => {
                    const v = parseInt(e.target.value)
                    if (!isNaN(v) && v >= 0 && v <= 23) onParamChange('chargeByHour', v)
                  }}
                />
                <Typography variant="body2" color="text.secondary">:00</Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* Electricity parameters */}
      <Box>
        <SectionLabel>Electricity Parameters</SectionLabel>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <NumField label="Transfer day (c/kWh)"               value={params.transferDay}   step={0.01} onCommit={p('transferDay')} />
          <NumField label="Transfer night (c/kWh, 22–07)"      value={params.transferNight} step={0.01} onCommit={p('transferNight')} />
          <NumField label="Buy margin (c/kWh, excl. VAT)"      value={params.buyMargin}     step={0.01} onCommit={p('buyMargin')} />
          <NumField label="Sell margin (c/kWh, from spot)"     value={params.sellMargin}    step={0.01} onCommit={p('sellMargin')} />
        </Box>
      </Box>

      <Divider />

      {/* Solar PV */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <SectionLabel>Solar PV</SectionLabel>
          <FormControlLabel
            sx={{ mx: 0, gap: 0.5 }}
            control={
              <Checkbox
                size="small"
                checked={params.solarEnabled}
                onChange={e => onParamChange('solarEnabled', e.target.checked)}
              />
            }
            label={<Typography variant="body2" color="text.secondary">Enable</Typography>}
          />
        </Box>
        {params.solarEnabled && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <NumField label="Tilt angle (°, 0=horizontal)"      value={params.solarDec} step={1} min={0} max={90}  onCommit={p('solarDec')} />
            <NumField label="Azimuth (°, 0=N 90=E 180=S 270=W)" value={params.solarAz}  step={1} min={0} max={359} onCommit={p('solarAz')} />
            <NumField label="Peak power (kWp)"                  value={params.solarKwp} step={0.1} min={0.1} max={30} onCommit={p('solarKwp')} />

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>Location</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button variant="outlined" size="small" onClick={onGetGeo}>
                  Get GPS
                </Button>
                <Typography variant="body2" color="text.secondary"
                  sx={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {geoCoords ? `${geoCoords.lat}, ${geoCoords.lon}` : '–'}
                </Typography>
              </Box>
            </Box>

            <Box>
              <Button variant="outlined" size="small" fullWidth onClick={onFetchSolar}>
                Fetch solar forecast
              </Button>
              <Typography
                variant="body2"
                sx={{ display: 'block', mt: 0.75, color: solarStatus.ok ? 'success.main' : solarStatus.warn ? 'warning.main' : 'text.secondary' }}
              >
                {solarStatus.text}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* API status */}
      <Box sx={{ mt: 'auto', pt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <StatusDot ok={spotStatus.ok} warn={spotStatus.warn} />
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{spotStatus.text}</Typography>
          <IconButton size="small" onClick={onRefreshPrices} aria-label="Refresh prices" sx={{ p: 0.25 }}>
            <RefreshIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
        {params.solarEnabled && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <StatusDot ok={solarStatus.ok} warn={solarStatus.warn} />
            <Typography variant="body2" color="text.secondary">{solarStatus.text}</Typography>
          </Box>
        )}
      </Box>
    </Paper>
  )
}
