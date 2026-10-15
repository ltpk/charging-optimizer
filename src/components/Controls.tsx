import type { ReactNode } from 'react'
import {
  Box,
  FormControlLabel,
  MenuItem,
  Select,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { SliderField } from './fields'
import { MONO, overline } from '../theme'
import type { Params } from '../types'

interface Props {
  params: Params
  onParamChange: <K extends keyof Params>(key: K, value: Params[K]) => void
  notifyEnabled: boolean
  onToggleNotify: (v: boolean) => void
  /** < 760 px: sliders + a collapsible "Plan options" section */
  narrow: boolean
}

export const panelSx = {
  bgcolor: 'background.paper',
  border: 1,
  borderColor: 'divider',
  borderRadius: '12px',
  px: '18px',
  py: 2,
} as const

const Ctl = ({ children }: { children: ReactNode }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</Box>
)

// the everyday controls — battery state, search window, charge-by deadline, notifications
export function Controls({ params, onParamChange, notifyEnabled, onToggleNotify, narrow }: Props) {
  const soc = (
    <>
      <Box sx={{ minWidth: 180 }}>
        <SliderField
          label="SOC now"
          info="State of charge — your battery's current level."
          value={params.socNow}
          unit="%"
          min={0}
          max={100}
          step={1}
          onChange={v => onParamChange('socNow', v)}
        />
      </Box>
      <Box sx={{ minWidth: 180 }}>
        <SliderField
          label="SOC target"
          info="State of charge you want to reach."
          value={params.socTarget}
          unit="%"
          min={10}
          max={100}
          step={10}
          onChange={v => onParamChange('socTarget', v)}
        />
      </Box>
    </>
  )

  const cb = params.chargeByEnabled
  const planControls = (
    <>
      <Ctl>
        <Box component="span" sx={overline}>
          Search window
        </Box>
        <ToggleButtonGroup
          value={params.horizonH}
          exclusive
          aria-label="Search window"
          onChange={(_, v: number | null) => v != null && onParamChange('horizonH', v)}
          sx={{ alignSelf: 'flex-start' }}
        >
          {[24, 48, 72].map(h => (
            <ToggleButton key={h} value={h}>
              {h} h
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Ctl>
      <Ctl>
        <FormControlLabel
          control={<Switch checked={cb} onChange={e => onParamChange('chargeByEnabled', e.target.checked)} />}
          label={
            <Box component="span" sx={overline}>
              Charge by
            </Box>
          }
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: cb ? 1 : 0.4 }}>
          <ToggleButtonGroup
            value={params.chargeByDay}
            exclusive
            disabled={!cb}
            aria-label="Charge-by day"
            onChange={(_, v: number | null) => v != null && onParamChange('chargeByDay', v)}
          >
            <ToggleButton value={0}>Today</ToggleButton>
            <ToggleButton value={1}>Tmrw</ToggleButton>
            <ToggleButton value={2}>+2d</ToggleButton>
          </ToggleButtonGroup>
          <Select
            size="small"
            value={params.chargeByHour}
            disabled={!cb}
            aria-label="Charge-by hour"
            onChange={e => onParamChange('chargeByHour', Number(e.target.value))}
            sx={{ fontFamily: MONO, fontSize: 13, bgcolor: 'ev.panel2', '& .MuiSelect-select': { py: '7px' } }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <MenuItem key={h} value={h} sx={{ fontFamily: MONO, fontSize: 13 }}>
                {String(h).padStart(2, '0')}:00
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Ctl>
      <Ctl>
        <Box component="span" sx={overline}>
          Alerts
        </Box>
        <FormControlLabel
          control={<Switch checked={notifyEnabled} onChange={e => onToggleNotify(e.target.checked)} />}
          label="Notify when charging starts"
        />
        {notifyEnabled && typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
          <Typography variant="caption" color="warning.main">
            Notifications blocked in browser settings
          </Typography>
        )}
      </Ctl>
    </>
  )

  if (narrow)
    return (
      <Box component="section" sx={{ ...panelSx, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {soc}
        <Box
          component="details"
          sx={{
            '& > summary': {
              ...overline,
              cursor: 'pointer',
              listStyle: 'none',
              display: 'flex',
              justifyContent: 'space-between',
            },
            '& > summary::-webkit-details-marker': { display: 'none' },
            '& > summary::after': { content: '"+"', fontSize: 14 },
            '&[open] > summary::after': { content: '"–"' },
          }}
        >
          <summary>Plan options</summary>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, pt: 1.5 }}>{planControls}</Box>
        </Box>
      </Box>
    )

  return (
    <Box
      component="section"
      sx={{ ...panelSx, display: 'flex', flexWrap: 'wrap', gap: '20px 32px', alignItems: 'flex-start' }}
    >
      {soc}
      {planControls}
    </Box>
  )
}
