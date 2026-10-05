import { useEffect, useState } from 'react'
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
  Paper,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import RefreshIcon from '@mui/icons-material/Refresh'
import TuneIcon from '@mui/icons-material/Tune'
import { InfoTip, SliderField, SectionLabel, FieldLabel } from './fields'
import type { Params, ApiStatus } from '../types'

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
  /** false on small screens, where Battery State renders as a card in the main view instead */
  showBattery: boolean
  onOpenSetup: () => void
  onRefreshPrices: () => void
  spotStatus: ApiStatus
  solarStatus: ApiStatus
  notifyEnabled: boolean
  onToggleNotify: (v: boolean) => void
}

export function Sidebar({
  params,
  onParamChange,
  showBattery,
  onOpenSetup,
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
        height: { md: '100%' },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.75,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Battery state — on small screens this lives as a card in the main view instead */}
      {showBattery && (
        <>
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
        </>
      )}

      {/* Charging plan */}
      <Box>
        <SectionLabel>Charging Plan</SectionLabel>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
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

      {/* set-once config lives in a dialog so it doesn't crowd the everyday controls */}
      <Button variant="outlined" size="small" startIcon={<TuneIcon fontSize="small" />} onClick={onOpenSetup}>
        Vehicle &amp; pricing setup
      </Button>

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
          <Tooltip title="Refresh prices">
            <IconButton size="small" onClick={onRefreshPrices} aria-label="Refresh prices" sx={{ my: -0.5 }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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
