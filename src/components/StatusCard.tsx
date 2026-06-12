import { useState, useEffect } from 'react'
import { Alert, AlertTitle, Typography } from '@mui/material'
import { SLOT_MS } from '../utils/optimization'
import type { SlotEntry } from '../types'

const fmtFi = (dt: Date) =>
  dt.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }) +
  ' ' +
  dt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })

const fmtTime = (dt: Date) => dt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })

const slotEnd = (dt: Date) => new Date(dt.getTime() + SLOT_MS)

function fmtRemaining(target: Date, now: Date): string {
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) return ''
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')} remaining` : `${m} min remaining`
}

interface Props {
  isGo: boolean
  isFull: boolean
  firstSel?: SlotEntry
  lastSel?: SlotEntry
}

export function StatusCard({ isGo, isFull, firstSel, lastSel }: Props) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const severity = isFull ? 'info' : isGo ? 'success' : 'warning'
  const title = isFull ? 'Battery full' : isGo ? 'Charge now' : 'Wait'

  let sub = '–'
  let rem = ''
  if (!isFull && firstSel) {
    if (isGo && lastSel) {
      const end = slotEnd(lastSel.dt)
      sub = `Charging — window ${fmtFi(firstSel.dt)}–${fmtTime(end)}`
      rem = fmtRemaining(end, now)
    } else {
      sub = `Optimal window starts ${fmtFi(firstSel.dt)}`
      rem = fmtRemaining(firstSel.dt, now)
    }
  }

  return (
    <Alert severity={severity}>
      <AlertTitle>{title}</AlertTitle>
      <Typography variant="body2">
        {sub}
        {rem && ` — ${rem}`}
      </Typography>
    </Alert>
  )
}
