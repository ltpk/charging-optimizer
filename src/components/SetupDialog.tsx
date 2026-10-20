import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Box,
  Button,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { InfoTip, SliderField } from './fields'
import { gridPower } from '../utils/optimization'
import { MONO } from '../theme'
import type { Params, GeoCoords, ApiStatus } from '../types'
import { fmtNum } from './PlanCard'

export type ColorMode = 'light' | 'dark' | 'system'

// set-once configuration — vehicle, pricing, solar, appearance — in a side drawer (bottom sheet on phones)

const labelSx = { fontSize: 12, fontWeight: 500, color: 'text.secondary', mb: 0.75, display: 'block' } as const

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'ev.panel2',
    fontFamily: MONO,
    fontSize: 13,
    minHeight: 36,
    '& fieldset': { borderColor: 'divider' },
    '&.Mui-focused fieldset': { borderColor: 'text.primary', borderWidth: 1 },
  },
  '& input': { py: '8px', px: '10px' },
  // hide the spinner arrows — the unit sits where they would be
  '& input::-webkit-inner-spin-button, & input::-webkit-outer-spin-button': { WebkitAppearance: 'none', m: 0 },
  '& input[type=number]': { MozAppearance: 'textfield' },
} as const

const unitAdornment = (unit: string) => (
  <InputAdornment position="end" sx={{ '& p': { fontFamily: MONO, fontSize: 11, color: 'ev.micro' } }}>
    {unit}
  </InputAdornment>
)

interface NumFieldProps {
  label: string
  value: number
  unit: string
  step?: number
  min?: number
  max?: number
  onCommit: (v: number) => void
  info?: string
}

function NumField({ label, value, unit, step, min, max, onCommit, info }: NumFieldProps) {
  const id = useId()
  // controlled by local text so each keystroke commits live (updating every derived value)
  // without remounting and dropping focus; the raw string keeps partial input ("", "1.", "-") usable
  const [text, setText] = useState(String(value))
  // re-sync only when the value changes from outside (e.g. localStorage restore), never mid-typing
  useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value))
  }, [value]) // depend only on `value` — re-syncing on `text` would clobber mid-typing
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box component="label" htmlFor={id} sx={labelSx}>
        {label}
        {info && <InfoTip text={info} />}
      </Box>
      <TextField
        id={id}
        type="number"
        value={text}
        size="small"
        fullWidth
        sx={inputSx}
        slotProps={{ htmlInput: { step, min, max }, input: { endAdornment: unitAdornment(unit) } }}
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
  const id = useId()
  const [text, setText] = useState(value)
  useEffect(() => {
    if (text !== value) setText(value)
  }, [value]) // depend only on `value` — re-syncing on `text` would clobber mid-typing
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box component="label" htmlFor={id} sx={labelSx}>
        {label}
      </Box>
      <TextField
        id={id}
        type="number"
        value={text}
        size="small"
        fullWidth
        sx={inputSx}
        slotProps={{ htmlInput: { min, max, step: 'any' }, input: { endAdornment: unitAdornment('°') } }}
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
    </Box>
  )
}

function Group({ title, right, children }: { title: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          minHeight: 26,
          pb: 1,
          borderBottom: 1,
          borderColor: 'divider',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '1.2px',
          textTransform: 'uppercase',
          color: 'ev.micro',
        }}
      >
        <span>{title}</span>
        {right}
      </Box>
      {children && <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>{children}</Box>}
    </Box>
  )
}

const full = { gridColumn: '1 / -1' } as const

// header-right toggle of a group ("Transfer fees", "Use solar")
const GroupSwitch = ({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) => (
  <FormControlLabel
    control={<Switch checked={checked} onChange={e => onChange(e.target.checked)} />}
    label={label}
    sx={{
      textTransform: 'none',
      letterSpacing: 0,
      '& .MuiFormControlLabel-label': { fontWeight: 500, color: 'text.primary' },
    }}
  />
)

interface Props {
  open: boolean
  onClose: () => void
  /** < 760 px: bottom sheet instead of a right drawer */
  narrow: boolean
  params: Params
  onParamChange: <K extends keyof Params>(key: K, value: Params[K]) => void
  onResetParams: () => void
  colorMode: ColorMode
  onColorMode: (m: ColorMode) => void
  geoCoords: GeoCoords | null
  onGetGeo: () => void
  onGeoField: (key: keyof GeoCoords, value: string) => void
  onFetchSolar: () => void
  solarStatus: ApiStatus
}

export function SetupDialog({
  open,
  onClose,
  narrow,
  params,
  onParamChange,
  onResetParams,
  colorMode,
  onColorMode,
  geoCoords,
  onGetGeo,
  onGeoField,
  onFetchSolar,
  solarStatus,
}: Props) {
  const p =
    <K extends keyof Params>(key: K) =>
    (v: Params[K]) =>
      onParamChange(key, v)

  return (
    <Drawer
      anchor={narrow ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,0.45)' } } }}
      sx={{
        '& .MuiDrawer-paper': {
          bgcolor: 'background.paper',
          boxShadow: theme => theme.palette.ev.shadow,
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
          px: '22px',
          pt: narrow ? 1.25 : 2.5,
          pb: 3.5,
          ...(narrow
            ? { maxHeight: '86dvh', borderTopLeftRadius: 16, borderTopRightRadius: 16 }
            : { width: 420, maxWidth: '100%', borderLeft: 1, borderColor: 'divider' }),
        },
      }}
    >
      {narrow && <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', flexShrink: 0 }} />}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
            Vehicle &amp; pricing setup
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Close setup" sx={{ mr: -1 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          Set once. The plan recalculates as you edit.
        </Typography>
      </Box>

      <Group title="Battery">
        <NumField
          label="Capacity"
          info="Usable battery size."
          unit="kWh"
          value={params.batteryCapacity}
          step={1}
          min={1}
          onCommit={p('batteryCapacity')}
        />
        <SliderField
          small
          label="Charging loss"
          info="Energy lost as heat etc. — grid draw exceeds energy stored. Typically 5–15%."
          value={params.chargingLoss}
          unit="%"
          min={0}
          max={30}
          step={1}
          onChange={p('chargingLoss')}
        />
      </Group>

      <Group
        title="Charger"
        right={
          <Box
            component="span"
            sx={{ fontFamily: MONO, fontSize: 12, color: 'text.primary', textTransform: 'none', letterSpacing: 0 }}
          >
            = {fmtNum(gridPower(params))} kW
          </Box>
        }
      >
        <Box>
          <Box component="span" sx={labelSx}>
            Phases
            <InfoTip text="Single-phase or three-phase AC supply. Grid power = phases × current × voltage." />
          </Box>
          <ToggleButtonGroup
            value={params.phases}
            exclusive
            fullWidth
            onChange={(_, v: number | null) => v != null && onParamChange('phases', v)}
          >
            <ToggleButton value={1}>1-phase</ToggleButton>
            <ToggleButton value={3}>3-phase</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <SliderField
          small
          label="Current / phase"
          value={params.amperage}
          unit="A"
          min={6}
          max={32}
          step={1}
          onChange={p('amperage')}
        />
        <NumField
          label="Voltage"
          info="Grid voltage — usually 230 V in Finland."
          unit="V"
          value={params.voltage}
          step={1}
          min={100}
          max={400}
          onCommit={p('voltage')}
        />
        <NumField
          label="Onboard charger max"
          info="Your car's max AC charging power — caps the grid power regardless of the outlet."
          unit="kW"
          value={params.chargerCap}
          step={0.5}
          min={1}
          max={22}
          onCommit={p('chargerCap')}
        />
      </Group>

      <Group
        title="Pricing"
        right={<GroupSwitch label="Transfer fees" checked={params.transferEnabled} onChange={p('transferEnabled')} />}
      >
        <NumField
          label="Retailer margin (buy)"
          info="Your retailer's added margin per kWh on top of spot, before VAT."
          unit="c/kWh"
          value={params.buyMargin}
          step={0.01}
          onCommit={p('buyMargin')}
        />
        {params.transferEnabled && (
          <>
            <Box sx={full}>
              <Box component="span" sx={labelSx}>
                Transfer tariff
                <InfoTip text="Grid distribution fee (siirto) per kWh, separate from the energy price. Electricity tax (sähkövero, incl. VAT) is billed with it and added on top." />
              </Box>
              <ToggleButtonGroup
                value={params.transferFixed}
                exclusive
                fullWidth
                onChange={(_, v: boolean | null) => v != null && onParamChange('transferFixed', v)}
              >
                <ToggleButton value={true}>Fixed</ToggleButton>
                <ToggleButton value={false}>Day / night</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {params.transferFixed ? (
              <NumField
                label="Transfer fee"
                unit="c/kWh"
                value={params.transferFee}
                step={0.01}
                onCommit={p('transferFee')}
              />
            ) : (
              <>
                <NumField
                  label="Day 07–22"
                  unit="c/kWh"
                  value={params.transferDay}
                  step={0.01}
                  onCommit={p('transferDay')}
                />
                <NumField
                  label="Night 22–07"
                  unit="c/kWh"
                  value={params.transferNight}
                  step={0.01}
                  onCommit={p('transferNight')}
                />
              </>
            )}
            <NumField
              label="Electricity tax"
              unit="c/kWh"
              value={params.electricityTax}
              step={0.01}
              onCommit={p('electricityTax')}
            />
          </>
        )}
      </Group>

      <Group
        title="Solar"
        right={<GroupSwitch label="Use solar" checked={params.solarEnabled} onChange={p('solarEnabled')} />}
      >
        {params.solarEnabled && (
          <>
            <GeoField
              label="Latitude"
              value={geoCoords?.lat ?? ''}
              min={-90}
              max={90}
              onCommit={v => onGeoField('lat', v)}
            />
            <GeoField
              label="Longitude"
              value={geoCoords?.lon ?? ''}
              min={-180}
              max={180}
              onCommit={v => onGeoField('lon', v)}
            />
            <Box sx={{ ...full, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                onClick={onGetGeo}
                sx={{ borderColor: 'divider' }}
              >
                Use GPS
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                onClick={onFetchSolar}
                sx={{ borderColor: 'divider' }}
              >
                Fetch forecast
              </Button>
              <Typography
                sx={{
                  fontSize: 12,
                  ml: 0.5,
                  color: solarStatus.ok ? 'ev.go' : solarStatus.warn ? 'ev.warn' : 'text.secondary',
                }}
              >
                {solarStatus.text}
              </Typography>
            </Box>
            <NumField
              label="Panel peak"
              info="Total rated capacity of your panels."
              unit="kWp"
              value={params.solarKwp}
              step={0.1}
              min={0.1}
              max={30}
              onCommit={p('solarKwp')}
            />
            <NumField
              label="Margin (sell)"
              info="Deducted from spot when valuing solar energy sold back to the grid."
              unit="c/kWh"
              value={params.sellMargin}
              step={0.01}
              onCommit={p('sellMargin')}
            />
            <Box sx={full}>
              <SliderField
                small
                label="House base load"
                info="Other household load (fridge, standby, heat pump…) served by solar before any is left for charging. Only surplus solar offsets charging cost."
                value={params.solarBase}
                unit="W"
                min={0}
                max={2000}
                step={50}
                onChange={p('solarBase')}
              />
            </Box>
            <SliderField
              small
              label="Tilt"
              info="Panel angle from horizontal. 0° = flat, 90° = vertical."
              value={params.solarDec}
              unit="°"
              min={0}
              max={90}
              step={5}
              onChange={p('solarDec')}
            />
            <SliderField
              small
              label="Azimuth"
              info="Compass direction the panels face. 180° = due south."
              value={params.solarAz}
              unit="°"
              min={0}
              max={360}
              step={5}
              marks={['N', 'E', 'S', 'W', 'N'].map((label, i) => ({ value: i * 90, label }))}
              track={false}
              onChange={p('solarAz')}
            />
          </>
        )}
      </Group>

      <Group title="Appearance" />
      <ToggleButtonGroup
        value={colorMode}
        exclusive
        fullWidth
        aria-label="Color theme"
        onChange={(_, v: ColorMode | null) => v && onColorMode(v)}
        sx={{ mt: -1 }}
      >
        <ToggleButton value="light">Light</ToggleButton>
        <ToggleButton value="system">System</ToggleButton>
        <ToggleButton value="dark">Dark</ToggleButton>
      </ToggleButtonGroup>

      <Button
        variant="text"
        color="inherit"
        onClick={onResetParams}
        sx={{
          alignSelf: 'flex-start',
          p: 0,
          minWidth: 0,
          color: 'text.secondary',
          textDecoration: 'underline',
          fontWeight: 500,
          fontSize: 12.5,
        }}
      >
        Reset to defaults
      </Button>
    </Drawer>
  )
}
