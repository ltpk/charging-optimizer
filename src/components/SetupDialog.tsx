import { useEffect, useId, useState } from 'react'
import {
  Box,
  Divider,
  TextField,
  Checkbox,
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { InfoTip, SectionLabel, FieldLabel } from './fields'
import { chargeSpecs } from '../utils/optimization'
import type { Params, GeoCoords, ApiStatus } from '../types'

// set-once configuration — vehicle, grid contract, margins and solar — kept out of the
// everyday sidebar so the controls you touch daily aren't buried under it

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
          // commit only in-range values — the htmlInput min/max attrs alone don't stop typed input
          if (!isNaN(v) && (min == null || v >= min) && (max == null || v <= max)) onCommit(v)
        }}
        onBlur={() => {
          const v = parseFloat(text)
          // revert an empty/invalid/out-of-range field to the committed value
          if (isNaN(v) || (min != null && v < min) || (max != null && v > max)) setText(String(value))
        }}
      />
    </Box>
  )
}

// lat/lon text field — GeoCoords are strings, so commit the raw text once it parses in range
function GeoField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string
  value: string
  min: number
  max: number
  onCommit: (v: string) => void
}) {
  const [text, setText] = useState(value)
  useEffect(() => {
    if (text !== value) setText(value)
  }, [value]) // depend only on `value` — re-syncing on `text` would clobber mid-typing
  return (
    <TextField
      label={label}
      type="number"
      value={text}
      slotProps={{ htmlInput: { min, max, step: 'any' } }}
      size="small"
      onChange={e => {
        setText(e.target.value)
        const v = parseFloat(e.target.value)
        if (!isNaN(v) && v >= min && v <= max) onCommit(e.target.value)
      }}
      onBlur={() => {
        const v = parseFloat(text)
        if (isNaN(v) || v < min || v > max) setText(value)
      }}
    />
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

interface Props {
  open: boolean
  onClose: () => void
  params: Params
  onParamChange: <K extends keyof Params>(key: K, value: Params[K]) => void
  onResetParams: () => void
  geoCoords: GeoCoords | null
  onGetGeo: () => void
  onGeoField: (key: keyof GeoCoords, value: string) => void
  onFetchSolar: () => void
  solarStatus: ApiStatus
}

export function SetupDialog({
  open,
  onClose,
  params,
  onParamChange,
  onResetParams,
  geoCoords,
  onGetGeo,
  onGeoField,
  onFetchSolar,
  solarStatus,
}: Props) {
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'))
  const p =
    <K extends keyof Params>(key: K) =>
    (v: Params[K]) =>
      onParamChange(key, v)

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1.5 }}>
        Vehicle &amp; pricing setup
        <IconButton size="small" onClick={onClose} aria-label="Close setup">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
        {/* Vehicle */}
        <Box>
          <SectionLabel>Vehicle</SectionLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <NumField
              label="Battery capacity (kWh)"
              info="Usable battery size."
              value={params.batteryCapacity}
              step={1}
              min={1}
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
                min={1}
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
              min={0}
              max={50}
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
                <FieldLabel info="Coordinates for the solar forecast — use GPS or type them in.">Location</FieldLabel>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                    <GeoField
                      label="Lat"
                      value={geoCoords?.lat ?? ''}
                      min={-90}
                      max={90}
                      onCommit={v => onGeoField('lat', v)}
                    />
                    <GeoField
                      label="Lon"
                      value={geoCoords?.lon ?? ''}
                      min={-180}
                      max={180}
                      onCommit={v => onGeoField('lon', v)}
                    />
                  </Box>
                  <Button variant="outlined" size="small" onClick={onGetGeo}>
                    Get GPS location
                  </Button>
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
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Button
          size="small"
          color="inherit"
          startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
          onClick={onResetParams}
          sx={{ color: 'text.secondary' }}
        >
          Restore defaults
        </Button>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  )
}
