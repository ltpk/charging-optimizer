import { Box, Slider, Tooltip, Typography } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

// shared field helpers used by the Sidebar and the mobile quick-controls card

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
}

export function SliderField({ label, value, unit, min, max, step, onChange, info }: SliderFieldProps) {
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
