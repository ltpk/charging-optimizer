import {
  Box, Divider, Slider, TextField, Checkbox,
  FormControlLabel, Button, Typography, Paper,
} from '@mui/material'
import type { Params, GeoCoords } from '../types'

// ── helpers ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography sx={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary', mb: 1.25 }}>
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
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
          {value} {unit}
        </Typography>
      </Box>
      <Slider
        value={value}
        min={min} max={max} step={step}
        size="small"
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
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
        {label}
      </Typography>
      <TextField
        type="number"
        defaultValue={value}
        key={value}   // force re-mount when value changes externally (e.g. localStorage restore)
        inputProps={{ step, min, max }}
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
  const color = ok ? 'success.main' : warn ? 'warning.main' : 'primary.main'
  const anim  = !ok && !warn
  return (
    <Box sx={{
      width: 7, height: 7, borderRadius: '50%', bgcolor: color, flexShrink: 0,
      ...(anim && { animation: 'pulse 1.2s ease-in-out infinite' }),
      '@keyframes pulse': { '0%,100%': { opacity: 0.2 }, '50%': { opacity: 1 } },
    }} />
  )
}

// ── main component ─────────────────────────────────────────────

interface Props {
  params: Params
  onParamChange: <K extends keyof Params>(key: K, value: Params[K]) => void
  geoCoords: GeoCoords | null
  onGetGeo: () => void
  onFetchSolar: () => void
  spotStatus: { ok: boolean; text: string }
  solarStatus: { ok: boolean; warn: boolean; text: string }
}

export function Sidebar({ params, onParamChange, geoCoords, onGetGeo, onFetchSolar, spotStatus, solarStatus }: Props) {
  const p = <K extends keyof Params>(key: K) => (v: Params[K]) => onParamChange(key, v)

  return (
    <Paper
      component="aside"
      square
      sx={{
        borderRight: '1px solid', borderColor: 'divider',
        borderRadius: 0,
        px: 2, py: 2.5,
        display: 'flex', flexDirection: 'column', gap: 1.75,
        overflowY: 'auto',
      }}
    >
      {/* Battery state */}
      <Box>
        <SectionLabel>Battery State</SectionLabel>
        <SliderField label="SOC now"    value={params.socNow}    unit="%" min={0} max={100} step={1} onChange={p('socNow')} />
        <Box mt={1.5} />
        <SliderField label="SOC target" value={params.socTarget} unit="%" min={1} max={100} step={1} onChange={p('socTarget')} />
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
            label={
              <Typography variant="caption" color="text.secondary" sx={{ userSelect: 'none' }}>
                Consecutive hours (sliding window)
              </Typography>
            }
          />
          <SliderField label="Search window" value={params.horizonH} unit="h" min={24} max={168} step={24} onChange={p('horizonH')} />
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
          <NumField label="Sell margin (c/kWh, deducted from spot)" value={params.sellMargin} step={0.01} onCommit={p('sellMargin')} />
        </Box>
      </Box>

      <Divider />

      {/* Solar PV */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
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
            label={
              <Typography variant="caption" color="text.secondary" sx={{ userSelect: 'none' }}>
                Enable
              </Typography>
            }
          />
        </Box>
        {params.solarEnabled && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <NumField label="Tilt angle (°, 0=horizontal)"      value={params.solarDec} step={1} min={0} max={90}  onCommit={p('solarDec')} />
            <NumField label="Azimuth (°, 0=N 90=E 180=S 270=W)" value={params.solarAz}  step={1} min={0} max={359} onCommit={p('solarAz')} />
            <NumField label="Peak power (kWp)"                  value={params.solarKwp} step={0.1} min={0.1} max={30} onCommit={p('solarKwp')} />

            <Box>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Location</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button variant="outlined" color="secondary" size="small" onClick={onGetGeo}>
                  Get GPS
                </Button>
                <Typography variant="caption" color="text.secondary"
                  sx={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {geoCoords ? `${geoCoords.lat}, ${geoCoords.lon}` : '–'}
                </Typography>
              </Box>
            </Box>

            <Box>
              <Button variant="outlined" color="secondary" size="small" fullWidth onClick={onFetchSolar}>
                Fetch solar forecast
              </Button>
              <Typography
                variant="caption"
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
          <StatusDot ok={spotStatus.ok} warn={false} />
          <Typography variant="caption" color="text.secondary">{spotStatus.text}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <StatusDot ok={solarStatus.ok} warn={solarStatus.warn} />
          <Typography variant="caption" color="text.secondary">{solarStatus.text}</Typography>
        </Box>
      </Box>
    </Paper>
  )
}
