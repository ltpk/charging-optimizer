import { useState, useEffect } from 'react'
import { Box, Typography } from '@mui/material'
import type { HourEntry } from '../types'

const fmtFi = (dt: Date) =>
  dt.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }) + ' ' +
  dt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })

const fmtTime = (dt: Date) => dt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })

const addHour = (dt: Date) => { const e = new Date(dt); e.setHours(e.getHours() + 1); return e }

function fmtRemaining(target: Date, now: Date): string {
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) return ''
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')} remaining`
    : `${m} min remaining`
}

interface Props {
  isGo: boolean
  isFull: boolean
  firstSel?: HourEntry
  lastSel?: HourEntry
}

export function StatusCard({ isGo, isFull, firstSel, lastSel }: Props) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const state = isFull ? 'full' : isGo ? 'go' : 'wait'

  const palette = {
    go:   { bg: 'rgba(126,212,160,0.12)', border: 'rgba(126,212,160,0.35)', color: '#7ed4a0' },
    wait: { bg: 'rgba(240,160,96,0.10)',  border: 'rgba(240,160,96,0.35)',  color: '#f0a060' },
    full: { bg: 'rgba(79,142,247,0.10)',  border: 'rgba(79,142,247,0.35)',  color: '#4f8ef7' },
  }[state]

  const icon  = isFull ? '⚡' : isGo ? '✓' : '⏳'
  const title = isFull ? 'Battery full' : isGo ? 'Charge now' : 'Wait'

  let sub = '–'
  let rem = ''
  if (!isFull && firstSel) {
    if (isGo && lastSel) {
      const end = addHour(lastSel.dt)
      sub = `Charging — window ${fmtFi(firstSel.dt)}–${fmtTime(end)}`
      rem = fmtRemaining(end, now)
    } else {
      sub = `Optimal window starts ${fmtFi(firstSel.dt)}`
      rem = fmtRemaining(firstSel.dt, now)
    }
  }

  return (
    <Box sx={{
      borderRadius: 2, px: 3, py: 2.5,
      display: 'flex', alignItems: 'center', gap: 2.5,
      border: `1px solid ${palette.border}`,
      backgroundColor: palette.bg,
      transition: 'all 0.3s',
    }}>
      <Typography sx={{ fontSize: 32, lineHeight: 1 }}>{icon}</Typography>
      <Box>
        <Typography sx={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.04em', color: palette.color }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
          {sub}{rem && ` — ${rem}`}
        </Typography>
      </Box>
    </Box>
  )
}
