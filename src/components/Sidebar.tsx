import { useEffect, useId, useState } from 'react'
import {
  Box,
  Divider,
  Slider,
  TextField,
  Checkbox,
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Button,
  Typography,
  Paper,
  CircularProgress,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import RefreshIcon from '@mui/icons-material/Refresh'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { lsGet, lsSet, LS_ADVANCED_OPEN } from '../utils/storage'
import { chargeSpecs } from '../utils/optimization'
import type { Params, GeoCoords, ApiStatus } from '../types'

// ── helpers ────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip title={text} enterTouchDelay={0} leaveTouchDelay={4000}>
      <InfoOutlinedIcon
        sx={{ fontSize: 14, color: 'text.disabled', ml: 0.5, verticalAlign: 'middle', cursor: 'help' }}
      />
    </Tooltip>
  )
}

function SectionLabel({ children, info }: { children: string; info?: string }) {
  return (
    <Typography variant="overline" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
      {children}
      {info && <InfoTip text={info} />}
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
  info?: string
}

function SliderField({ label, value, unit, min, max, step, onChange, info }: SliderFieldProps) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
          {info && <InfoTip text={info} />}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
          {value} {unit}
        </Typography>
      </Box>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
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
  info?: string
}

function NumField({ label, value, step, min, max, onCommit, info }: NumFieldProps) {
  const id = useId()
  // controlled by local text so each keystroke commits live (updating every derived value)
  // without remounting and dropping focus; the raw string keeps partial input ("", "1.", "-") usable
  const [text, setText] = useState(String(value))
  // re-sync only when the value changes from outside (e.g. localStorage restore), never mid-typing
  useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value))
  }, [value]) // depend only on `value` — re-syncing on `text` would clobber mid-typing
  return (
    <Box>
      <Typography
        component="label"
        htmlFor={id}
        variant="body2"
        color="text.secondary"
        gutterBottom
        sx={{ display: 'block' }}
      >
        {label}
        {info && <InfoTip text={info} />}
      </Typography>
      <TextField
        id={id}
        type="number"
        value={text}
        slotProps={{ htmlInput: { step, min, max } }}
        size="small"
        fullWidth
        onChange={e => {
          setText(e.target.value)
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onCommit(v)
        }}
        onBlur={() => {
          if (isNaN(parseFloat(text))) setText(String(value)) // revert an empty/invalid field
        }}
      />
    </Box>
  )
}

// small live-committing integer field (0–23) for the charge-by deadline hour
function HourField({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    if (parseInt(text) !== value) setText(String(value))
  }, [value]) // depend only on `value` — re-syncing on `text` would clobber mid-typing
  return (
    <TextField
      type="number"
      value={text}
      slotProps={{ htmlInput: { min: 0, max: 23, step: 1 } }}
      size="small"
      sx={{ width: 60 }}
      onChange={e => {
        setText(e.target.value)
        const v = parseInt(e.target.value)
        if (!isNaN(v) && v >= 0 && v <= 23) onCommit(v)
      }}
      onBlur={() => {
        const v = parseInt(text)
        if (isNaN(v) || v < 0 || v > 23) setText(String(value))
      }}
    />
  )
}

// label with an optional info tip, used for the toggle-group controls
function FieldLabel({ children, info }: { children: string; info?: string }) {
  return (
    <Typography variant="body2" color="text.secondary" gutterBottom>
      {children}
      {info && <InfoTip text={info} />}
    </Typography>
  )
}

// read-only charging metrics derived from the vehicle/charger config
function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 600, textAlign: 'right' }}>
        {value}
      </Typography>
    </>
  )
}

function ChargeSpecs({ params }: { params: Params }) {
  const specs = chargeSpecs(params)
  const showGrid = params.chargingLoss > 0
  return (
    <Box
      sx={{
        mt: 0.5,
        p: 1.25,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        rowGap: 0.5,
        columnGap: 1.5,
      }}
    >
      <SpecRow label="Charging speed" value={`${specs.chargingSpeed.toFixed(1)} % / hr`} />
      <SpecRow label="Charging power" value={`${specs.chargingPower.toFixed(1)} kW`} />
      {showGrid && <SpecRow label="Grid power" value={`${specs.gridPower.toFixed(1)} kW`} />}
      <SpecRow label="Energy to battery" value={`${specs.energyToBattery.toFixed(1)} kWh`} />
      {showGrid && <SpecRow label="Energy from grid" value={`${specs.energyFromGrid.toFixed(1)} kWh`} />}
    </Box>
  )
}

// ── status dots ────────────────────────────────────────────────

function StatusDot({ ok, warn }: { ok: boolean; warn: boolean }) {
  const title = !ok && !warn ? 'Loading…' : ok ? 'Up to date' : 'Stale — showing last good data'
  return (
    <Tooltip title={title}>
      {!ok && !warn ? (
        <CircularProgress size={10} />
      ) : (
        <FiberManualRecordIcon color={ok ? 'success' : 'warning'} sx={{ fontSize: 10 }} />
      )}
    </Tooltip>
  )
}

// ── main component ─────────────────────────────────────────────

interface Props {
  params: Params
  onParamChange: <K extends keyof Params>(key: K, value: Params[K]) => void
  onResetParams: () => void
  geoCoords: GeoCoords | null
  onGetGeo: () => void
  onFetchSolar: () => void
  onRefreshPrices: () => void
  spotStatus: ApiStatus
  solarStatus: ApiStatus
  notifyEnabled: boolean
  onToggleNotify: (v: boolean) => void
}

export function Sidebar({
  params,
  onParamChange,
  onResetParams,
  geoCoords,
  onGetGeo,
  onFetchSolar,
  onRefreshPrices,
  spotStatus,
  solarStatus,
  notifyEnabled,
  onToggleNotify,
}: Props) {
  const p =
    <K extends keyof Params>(key: K) =>
    (v: Params[K]) =>
      onParamChange(key, v)

  // Advanced section open by default; remember once the user collapses/expands it
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(() => lsGet<boolean>(LS_ADVANCED_OPEN) ?? true)

  return (
    <Paper
      component="aside"
      square
      elevation={0}
      sx={{
        borderRadius: 0,
        px: 2,
        py: 2.5,
        width: { md: 300 },
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.75,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Battery state */}
      <Box>
        <SectionLabel>Battery State</SectionLabel>
        <SliderField
          label="SOC now"
          info="State of charge — your battery's current level."
          value={params.socNow}
          unit="%"
          min={0}
          max={100}
          step={1}
          onChange={p('socNow')}
        />
        <Box sx={{ mt: 1.5 }} />
        <SliderField
          label="SOC target"
          info="State of charge you want to reach."
          value={params.socTarget}
          unit="%"
          min={10}
          max={100}
          step={10}
          onChange={p('socTarget')}
        />
        {params.socNow >= params.socTarget && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
            SOC now ≥ target — battery already full
          </Typography>
        )}
      </Box>

      <Divider />

      {/* Charging plan */}
      <Box>
        <SectionLabel>Charging Plan</SectionLabel>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Box>
            <FieldLabel info="Consecutive hours charges in a single continuous session. Split slots picks the lowest-priced 15-min slots even if they're spread across the day.">
              Charging mode
            </FieldLabel>
            <ToggleButtonGroup
              value={params.consecutive}
              exclusive
              fullWidth
              size="small"
              onChange={(_, v: boolean | null) => {
                if (v != null) onParamChange('consecutive', v)
              }}
            >
              <ToggleButton value={true}>Consecutive hours</ToggleButton>
              <ToggleButton value={false}>Split slots</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box>
            <FieldLabel info="How many hours ahead to search for the optimal charging window.">
              Search window
            </FieldLabel>
            <ToggleButtonGroup
              value={params.horizonH}
              exclusive
              fullWidth
              size="small"
              onChange={(_, v: number | null) => {
                if (v != null) onParamChange('horizonH', v)
              }}
            >
              <ToggleButton value={24}>24 h</ToggleButton>
              <ToggleButton value={48}>48 h</ToggleButton>
              <ToggleButton value={72}>72 h</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box>
            <FormControlLabel
              sx={{ mx: 0, gap: 0.5 }}
              control={
                <Checkbox
                  size="small"
                  checked={params.chargeByEnabled}
                  onChange={e => onParamChange('chargeByEnabled', e.target.checked)}
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  Charge by
                  <InfoTip text="Constrain charging to finish before a chosen time of day." />
                </Typography>
              }
            />
            {params.chargeByEnabled && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                <ToggleButtonGroup
                  value={params.chargeByDay}
                  exclusive
                  size="small"
                  onChange={(_, v: number | null) => {
                    if (v != null) onParamChange('chargeByDay', v)
                  }}
                >
                  <ToggleButton value={0}>Today</ToggleButton>
                  <ToggleButton value={1}>Tmrw</ToggleButton>
                  <ToggleButton value={2}>+2d</ToggleButton>
                </ToggleButtonGroup>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <HourField value={params.chargeByHour} onCommit={v => onParamChange('chargeByHour', v)} />
                  <Typography variant="body2" color="text.secondary">
                    :00
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* Advanced — set-once vehicle & pricing config */}
      <Accordion
        disableGutters
        square
        elevation={0}
        expanded={advancedOpen}
        onChange={(_, open) => {
          setAdvancedOpen(open)
          lsSet(LS_ADVANCED_OPEN, open)
        }}
        sx={{ bgcolor: 'transparent', '&::before': { display: 'none' } }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon fontSize="small" />}
          sx={{ px: 0, minHeight: 'auto', '& .MuiAccordionSummary-content': { my: 0.5 } }}
        >
          <SectionLabel info="Set once and forget — your car, grid contract, and solar setup.">
            Advanced Setup
          </SectionLabel>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
          {/* Vehicle */}
          <Box>
            <SectionLabel>Vehicle</SectionLabel>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <NumField
                label="Battery capacity (kWh)"
                info="Usable battery size."
                value={params.batteryCapacity}
                step={1}
                onCommit={p('batteryCapacity')}
              />
              <NumField
                label="Onboard charger (kW)"
                info="Your car's max AC charging power — caps the grid power regardless of the outlet."
                value={params.chargerCap}
                step={0.5}
                min={1}
                max={22}
                onCommit={p('chargerCap')}
              />
              <Box>
                <FieldLabel info="Single-phase or three-phase AC supply. Grid power = phases × current × voltage.">
                  Phases
                </FieldLabel>
                <ToggleButtonGroup
                  value={params.phases}
                  exclusive
                  fullWidth
                  size="small"
                  onChange={(_, v: number | null) => {
                    if (v != null) onParamChange('phases', v)
                  }}
                >
                  <ToggleButton value={1}>1-phase</ToggleButton>
                  <ToggleButton value={3}>3-phase</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                <NumField
                  label="Current (A)"
                  info="Charge current per phase."
                  value={params.amperage}
                  step={1}
                  min={0}
                  max={32}
                  onCommit={p('amperage')}
                />
                <NumField
                  label="Voltage (V)"
                  info="Grid voltage — usually 230 V in Finland."
                  value={params.voltage}
                  step={1}
                  min={100}
                  max={400}
                  onCommit={p('voltage')}
                />
              </Box>
              <NumField
                label="Charging loss (%)"
                info="Energy lost as heat etc. — grid draw exceeds energy stored. Typically 5–15%."
                value={params.chargingLoss}
                step={1}
                onCommit={p('chargingLoss')}
              />
              <ChargeSpecs params={params} />
            </Box>
          </Box>

          <Divider />

          {/* Transfer fee */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <SectionLabel info="Grid distribution fee (siirto) per kWh, separate from the energy price.">
                Transfer Fee
              </SectionLabel>
              <FormControlLabel
                sx={{ mx: 0, gap: 0.5 }}
                control={
                  <Checkbox
                    size="small"
                    checked={params.transferEnabled}
                    onChange={e => onParamChange('transferEnabled', e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2" color="text.secondary">
                    Enable
                  </Typography>
                }
              />
            </Box>
            {params.transferEnabled && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <ToggleButtonGroup
                  value={params.transferFixed}
                  exclusive
                  fullWidth
                  size="small"
                  onChange={(_, v: boolean | null) => {
                    if (v != null) onParamChange('transferFixed', v)
                  }}
                >
                  <ToggleButton value={true}>Fixed</ToggleButton>
                  <ToggleButton value={false}>Day / Night</ToggleButton>
                </ToggleButtonGroup>
                {params.transferFixed ? (
                  <NumField
                    label="Transfer fee (c/kWh)"
                    value={params.transferFee}
                    step={0.01}
                    onCommit={p('transferFee')}
                  />
                ) : (
                  <>
                    <NumField
                      label="Transfer day (c/kWh)"
                      value={params.transferDay}
                      step={0.01}
                      onCommit={p('transferDay')}
                    />
                    <NumField
                      label="Transfer night (c/kWh, 22–07)"
                      value={params.transferNight}
                      step={0.01}
                      onCommit={p('transferNight')}
                    />
                  </>
                )}
              </Box>
            )}
          </Box>

          <Divider />

          {/* Margins */}
          <Box>
            <SectionLabel>Margins</SectionLabel>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <NumField
                label="Buy margin (c/kWh, excl. VAT)"
                info="Your retailer's added margin per kWh on top of spot, before VAT."
                value={params.buyMargin}
                step={0.01}
                onCommit={p('buyMargin')}
              />
              <NumField
                label="Sell margin (c/kWh, from spot)"
                info="Deducted from spot when valuing solar energy sold back to the grid."
                value={params.sellMargin}
                step={0.01}
                onCommit={p('sellMargin')}
              />
            </Box>
          </Box>

          <Divider />

          {/* Solar PV */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <SectionLabel info="Offsets charging cost with forecast solar production.">Solar PV</SectionLabel>
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
                  <Typography variant="body2" color="text.secondary">
                    Enable
                  </Typography>
                }
              />
            </Box>
            {params.solarEnabled && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <NumField
                  label="Tilt angle (°, 0=horizontal)"
                  info="Panel angle from horizontal. 0° = flat, 90° = vertical."
                  value={params.solarDec}
                  step={1}
                  min={0}
                  max={90}
                  onCommit={p('solarDec')}
                />
                <NumField
                  label="Azimuth (°, 0=N 90=E 180=S 270=W)"
                  info="Compass direction the panels face. 180° = due south."
                  value={params.solarAz}
                  step={1}
                  min={0}
                  max={359}
                  onCommit={p('solarAz')}
                />
                <NumField
                  label="Peak power (kWp)"
                  info="Total rated capacity of your panels."
                  value={params.solarKwp}
                  step={0.1}
                  min={0.1}
                  max={30}
                  onCommit={p('solarKwp')}
                />
                <NumField
                  label="Base consumption (W)"
                  info="Other household load (fridge, standby, heat pump…) served by solar before any is left for charging. Only surplus solar offsets charging cost."
                  value={params.solarBase}
                  step={50}
                  min={0}
                  onCommit={p('solarBase')}
                />

                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Location
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button variant="outlined" size="small" onClick={onGetGeo}>
                      Get GPS
                    </Button>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        flex: 1,
                        textAlign: 'right',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
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
                    sx={{
                      display: 'block',
                      mt: 0.75,
                      color: solarStatus.ok ? 'success.main' : solarStatus.warn ? 'warning.main' : 'text.secondary',
                    }}
                  >
                    {solarStatus.text}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>

          <Button
            variant="text"
            size="small"
            color="inherit"
            startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
            onClick={onResetParams}
            sx={{ alignSelf: 'flex-start', mt: 0.5, color: 'text.secondary' }}
          >
            Restore defaults
          </Button>
        </AccordionDetails>
      </Accordion>

      {/* Notifications */}
      <Box sx={{ mt: 'auto' }}>
        <FormControlLabel
          sx={{ mx: 0, gap: 0.5 }}
          control={<Checkbox size="small" checked={notifyEnabled} onChange={e => onToggleNotify(e.target.checked)} />}
          label={
            <Typography variant="body2" color="text.secondary">
              Notify when charging starts
            </Typography>
          }
        />
        {notifyEnabled && typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
            Notifications blocked in browser settings
          </Typography>
        )}
      </Box>

      {/* API status */}
      <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <StatusDot ok={spotStatus.ok} warn={spotStatus.warn} />
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {spotStatus.text}
          </Typography>
          <IconButton size="small" onClick={onRefreshPrices} aria-label="Refresh prices" sx={{ p: 0.25 }}>
            <RefreshIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
        {params.solarEnabled && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <StatusDot ok={solarStatus.ok} warn={solarStatus.warn} />
            <Typography variant="body2" color="text.secondary">
              {solarStatus.text}
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  )
}
