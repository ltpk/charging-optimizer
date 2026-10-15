import { useState, useEffect } from 'react'
import { Box, Typography } from '@mui/material'
import { SLOT_MS } from '../utils/optimization'
import { MONO, overline } from '../theme'
import type { SlotEntry } from '../types'

// Finnish decimal comma for displayed numbers
export const fmtNum = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',')

export const fmtTime = (dt: Date) => dt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })

// time plus a day hint when it isn't today ("tomorrow" / "7.10.")
function fmtWhen(dt: Date): string {
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (dt.toDateString() === today.toDateString()) return fmtTime(dt)
  if (dt.toDateString() === tomorrow.toDateString()) return `${fmtTime(dt)} tomorrow`
  return `${fmtTime(dt)} ${dt.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}`
}

function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

// live h:mm:ss countdown
function fmtClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export interface PlanStatus {
  /** ev palette key: wait = blue, go = green, muted = battery full, warn only for problems */
  tone: 'go' | 'wait' | 'warn' | 'muted'
  /** the huge verdict word */
  label: string
  /** line under the verdict, e.g. "Start at 02:15 tomorrow" */
  title: string
  /** compact form for the sticky header pill */
  short: string
}

export function planStatus(isGo: boolean, isFull: boolean, firstSel?: SlotEntry, lastSel?: SlotEntry): PlanStatus {
  if (isFull) return { tone: 'muted', label: 'Battery full', title: 'Nothing to charge', short: 'Battery full' }
  if (!firstSel) return { tone: 'warn', label: 'No window', title: 'No charging window', short: 'No window' }
  if (isGo && lastSel) {
    const end = new Date(lastSel.dt.getTime() + SLOT_MS)
    return { tone: 'go', label: 'Charge now', title: 'Charge now', short: `Charge now → ${fmtTime(end)}` }
  }
  return {
    tone: 'wait',
    label: 'Wait',
    title: `Start at ${fmtWhen(firstSel.dt)}`,
    short: `Start ${fmtTime(firstSel.dt)}`,
  }
}

function Stat({
  label,
  value,
  sub,
  color,
  big,
}: {
  label: string
  value: string
  sub?: string
  color?: string
  big?: boolean
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Box component="span" sx={{ ...overline, mb: 0.5 }}>
        {label}
      </Box>
      <Box
        component="span"
        sx={{
          fontFamily: MONO,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
          letterSpacing: '-0.03em',
          lineHeight: 1.05,
          color: color ?? 'text.primary',
          fontSize: big ? { xs: 26, sm: 34 } : { xs: 22, sm: 26 },
        }}
      >
        {value}
      </Box>
      {sub && (
        <Box component="span" sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
          {sub}
        </Box>
      )}
    </Box>
  )
}

interface Props {
  isGo: boolean
  isFull: boolean
  firstSel?: SlotEntry
  lastSel?: SlotEntry
  hoursNeeded: number
  kWhNeeded: number
  chargingPower: number
  completionTime: Date | null
  totalCost: number
  avgNetCost: number
  savingsVsNow: number
  solarEnabled: boolean
  solarPct: number
  solarSavings: number
}

// the answer first: a huge verdict, when it starts / ends, then the supporting figures
export function PlanCard(props: Props) {
  const { isGo, isFull, firstSel, lastSel, completionTime, totalCost, savingsVsNow } = props
  // 1 s tick for the countdown — local to the hero so the rest of the app doesn't re-render
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const status = planStatus(isGo, isFull, firstSel, lastSel)
  const tone = status.tone === 'muted' ? 'text.secondary' : `ev.${status.tone}`
  const planned = !isFull && !!firstSel && !!lastSel
  // completion (not window end) is what the user waits for; it can land mid-way through the last slot
  const done = completionTime ?? (lastSel ? new Date(lastSel.dt.getTime() + SLOT_MS) : now)
  const startsInMs = firstSel ? firstSel.dt.getTime() - now.getTime() : 0
  const leftMs = done.getTime() - now.getTime()

  let sub = ''
  if (planned) {
    sub = isGo
      ? `Done by ${fmtWhen(done)} · ${fmtDuration(Math.max(leftMs, 0))} left`
      : `in ${fmtDuration(Math.max(startsInMs, 0))} · done by ${fmtWhen(done)}`
    sub += ` · ${fmtDuration(props.hoursNeeded * 3_600_000)} of charging at ${fmtNum(props.chargingPower, 1)} kW`
  }

  let solarSub = 'no solar in window'
  if (props.solarSavings >= 0.005) solarSub = `saves ${fmtNum(props.solarSavings)} €`
  // negative spot: grid power beats free solar, so self-consuming solar costs money
  else if (props.solarSavings <= -0.005) solarSub = `adds ${fmtNum(-props.solarSavings)} € (negative spot)`

  const baseline = totalCost + savingsVsNow
  const saves = savingsVsNow >= 0.005

  return (
    <Box
      component="section"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(320px, 1fr) auto' },
        gap: 3.5,
        alignItems: 'end',
        pb: 1,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box sx={overline}>
          Charging plan{planned && props.hoursNeeded > 0 ? ` · ${fmtNum(props.kWhNeeded, 1)} kWh` : ''}
        </Box>
        <Typography
          component="h2"
          sx={{
            fontWeight: 700,
            letterSpacing: '-0.035em',
            lineHeight: 0.95,
            fontSize: { xs: 48, sm: 76 },
            color: tone,
            mt: 0.25,
            mb: 1,
          }}
        >
          {status.label}
        </Typography>
        <Typography sx={{ fontWeight: 600, letterSpacing: '-0.01em', fontSize: { xs: 19, sm: 24 } }}>
          {isGo && planned ? `Until ${fmtWhen(done)}` : status.title}
        </Typography>
        {sub && (
          <Typography sx={{ color: 'text.secondary', mt: 0.75, fontSize: 14, lineHeight: 1.5 }}>{sub}</Typography>
        )}
      </Box>

      {planned && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', sm: `repeat(${props.solarEnabled ? 4 : 3}, auto)` },
            gap: { xs: '18px 24px', sm: '18px 32px' },
            alignItems: 'start',
          }}
        >
          {isGo ? (
            <Stat label="Time left" value={fmtClock(leftMs)} color={tone} big />
          ) : (
            <Stat label="Starts in" value={fmtClock(startsInMs)} color={tone} big />
          )}
          <Stat label="Est. cost" value={`${fmtNum(totalCost)} €`} sub={`avg ${fmtNum(props.avgNetCost)} c/kWh`} big />
          <Stat
            label="vs charging now"
            value={saves ? `−${fmtNum(savingsVsNow)} €` : '–'}
            color={saves ? 'ev.go' : 'text.secondary'}
            sub={
              !saves
                ? 'no cheaper time ahead'
                : // negative spot can drive the baseline through zero, where the percent explodes
                  baseline >= 0.01
                  ? `${((savingsVsNow / baseline) * 100).toFixed(0)} % cheaper by waiting`
                  : 'cheaper by waiting'
            }
          />
          {props.solarEnabled && (
            <Stat label="Solar covers" value={`${props.solarPct.toFixed(0)} %`} color="ev.solar" sub={solarSub} />
          )}
        </Box>
      )}
    </Box>
  )
}
