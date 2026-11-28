import { useEffect, useState, type ChangeEvent } from 'react'
import { Box, Slider, Tooltip, Typography } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

// shared field helpers used by the Sidebar, SetupDialog and the mobile battery card

// text-buffered numeric input (spread onto a TextField): each keystroke commits live without
// remounting/dropping focus, partial input ("", "1.", "-") stays editable, only in-range values
// commit (htmlInput min/max don't stop typing), and blur reverts invalid text to the committed value
export function useRangeText(
  value: number | string,
  min: number | undefined,
  max: number | undefined,
  onCommit: (raw: string) => void,
) {
  const [text, setText] = useState(String(value))
  // re-sync only when the value changes from outside (e.g. localStorage restore), never mid-typing
  useEffect(() => {
    if (parseFloat(text) !== parseFloat(String(value))) setText(String(value))
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const ok = (t: string) => {
    const v = parseFloat(t)
    return !isNaN(v) && (min == null || v >= min) && (max == null || v <= max)
  }
  return {
    value: text,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value)
      if (ok(e.target.value)) onCommit(e.target.value)
    },
    onBlur: () => {
      if (!ok(text)) setText(String(value))
    },
  }
}

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
}

export function SliderField({ label, value, unit, min, max, step, onChange, info, marks, track }: SliderFieldProps) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
          {info && <InfoTip text={info} />}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
          {value}
          {unit === '°' ? '' : '\u00a0'}
          {unit}
        </Typography>
      </Box>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        marks={marks}
        track={track}
        size="small"
        aria-label={label}
        onChange={(_, v) => onChange(v as number)}
      />
    </Box>
  )
}

// overline section heading with an optional info tip
export function SectionLabel({ children, info }: { children: string; info?: string }) {
  return (
    <Typography variant="overline" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
      {children}
      {info && <InfoTip text={info} />}
    </Typography>
  )
}

// label with an optional info tip, used for the toggle-group controls
export function FieldLabel({ children, info }: { children: string; info?: string }) {
  return (
    <Typography variant="body2" color="text.secondary" gutterBottom>
      {children}
      {info && <InfoTip text={info} />}
    </Typography>
  )
}
