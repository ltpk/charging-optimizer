import { Box, Slider, Tooltip } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { MONO, overline } from '../theme'

// shared field helpers used by the controls panel and the Setup drawer

export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip title={text} enterTouchDelay={0} leaveTouchDelay={4000}>
      <InfoOutlinedIcon
        sx={{
          fontSize: 14,
          color: 'text.disabled',
          verticalAlign: 'middle',
          cursor: 'help',
          // pad the ~14 px glyph to a ~26 px touch target; negative margins keep the layout unchanged
          boxSizing: 'content-box',
          p: 0.75,
          m: -0.75,
          ml: -0.25,
        }}
      />
    </Tooltip>
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
  marks?: { value: number; label?: string }[]
  track?: false // no fill for circular values like a compass direction
  /** small muted label (Setup fields) instead of the overline (daily controls) */
  small?: boolean
}

export function SliderField({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
  info,
  marks,
  track,
  small,
}: SliderFieldProps) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
        <Box component="span" sx={small ? { fontSize: 12, fontWeight: 500, color: 'text.secondary' } : overline}>
          {label}
          {info && <InfoTip text={info} />}
        </Box>
        <Box component="span" sx={{ fontFamily: MONO, fontSize: small ? 13 : 15, fontWeight: 600 }}>
          {value}
          <Box component="small" sx={{ fontSize: 11, color: 'ev.micro', ml: '1px' }}>
            {unit}
          </Box>
        </Box>
      </Box>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        marks={marks}
        track={track}
        aria-label={label}
        onChange={(_, v) => onChange(v as number)}
      />
    </Box>
  )
}
