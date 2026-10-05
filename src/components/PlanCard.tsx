import { useState, useEffect } from 'react'
import { Box, Card, CardContent, Chip, Typography } from '@mui/material'
import { SLOT_MS } from '../utils/optimization'
import type { SlotEntry } from '../types'

const fmtTime = (dt: Date) => dt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })

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

export interface PlanStatus {
  color: 'success' | 'warning' | 'info'
  label: string
  /** big headline, e.g. "Start at 02:15 tomorrow" */
  title: string
  /** compact form for the sticky app-bar pill */
  short: string
}

export function planStatus(isGo: boolean, isFull: boolean, firstSel?: SlotEntry, lastSel?: SlotEntry): PlanStatus {
  if (isFull) return { color: 'info', label: 'Battery full', title: 'Nothing to charge', short: 'Battery full' }
  if (!firstSel) return { color: 'warning', label: 'Wait', title: 'No charging window', short: 'No window' }
  if (isGo && lastSel) {
    const end = new Date(lastSel.dt.getTime() + SLOT_MS)
    return { color: 'success', label: 'Charge now', title: 'Charge now', short: `Charge now → ${fmtTime(end)}` }
  }
  return {
    color: 'warning',
    label: 'Wait',
    title: `Start at ${fmtWhen(firstSel.dt)}`,
    short: `Start ${fmtTime(firstSel.dt)}`,
  }
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {sub}
        </Typography>
      )}
    </Box>
  )
}

// a percent of a baseline that negative spot can drive to ~0, where the percent explodes — € only then
const pctOf = (part: number, baseline: number) =>
  baseline >= 0.01 ? ` (${((part / baseline) * 100).toFixed(0)} %)` : ''

interface Props {
  isGo: boolean
  isFull: boolean
  firstSel?: SlotEntry
  lastSel?: SlotEntry
  hoursNeeded: number
  kWhNeeded: number
  completionTime: Date | null
  totalCost: number
  avgTransfer: number
  avgNetCost: number
  savingsVsNow: number
  spotNow: number
  netCostNow: number
  transferNow: number
  transferEnabled: boolean
  solarEnabled: boolean
  solarNow: number
  solarPct: number
  solarSavings: number
}

// the answer first: when to charge, when it's done, what it costs — then the supporting figures
export function PlanCard(props: Props) {
  const { isGo, isFull, firstSel, lastSel, completionTime, totalCost, savingsVsNow } = props
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const status = planStatus(isGo, isFull, firstSel, lastSel)

  let sub = ''
  if (!isFull && firstSel && lastSel) {
    const end = new Date(lastSel.dt.getTime() + SLOT_MS)
    sub = isGo
      ? `Window runs until ${fmtWhen(end)} · ${fmtDuration(end.getTime() - now.getTime())} left`
      : `in ${fmtDuration(Math.max(firstSel.dt.getTime() - now.getTime(), 0))}`
  }

  let solarSub: string | undefined
  if (props.solarSavings >= 0.005) {
    solarSub = `saves ${props.solarSavings.toFixed(2)} €${pctOf(props.solarSavings, totalCost + props.solarSavings)}`
  } else if (props.solarSavings <= -0.005) {
    // negative spot: grid power beats free solar, so self-consuming solar costs money
    solarSub = `adds ${(-props.solarSavings).toFixed(2)} € (negative spot)`
  }

  // net cost is what the optimizer actually ranks by — surface the current slot's value
  const nowParts = [`spot ${props.spotNow.toFixed(2)}`, `net ${props.netCostNow.toFixed(2)}`]
  if (props.transferEnabled) nowParts.push(`transfer ${props.transferNow.toFixed(2)}`)
  let nowLine = `Now: ${nowParts.join(' · ')} c/kWh`
  if (props.solarEnabled) nowLine += ` · solar ${Math.round(props.solarNow)} W`

  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, '&:last-child': { pb: 2 } }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="overline" color="text.secondary">
              Charging plan
            </Typography>
            <Chip label={status.label} color={status.color} variant="outlined" size="small" />
          </Box>
          <Typography variant="h5" component="p">
            {status.title}
          </Typography>
          {sub && (
            <Typography variant="body2" color="text.secondary">
              {sub}
            </Typography>
          )}
        </Box>

        {!isFull && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                sm: `repeat(${props.solarEnabled ? 4 : 3}, minmax(0, 1fr))`,
              },
              gap: 2,
              pt: 2,
              borderTop: 1,
              borderColor: 'divider',
              // 3 figures in a 2-col grid leave an orphan slot on xs — stretch the last one across
              ...(!props.solarEnabled && { '& > :last-of-type': { gridColumn: { xs: '1 / -1', sm: 'auto' } } }),
            }}
          >
            <Figure
              label="Done by"
              value={completionTime ? fmtWhen(completionTime) : '–'}
              sub={`${props.hoursNeeded.toFixed(1)} h · ${props.kWhNeeded.toFixed(1)} kWh`}
            />
            <Figure
              label="Est. cost"
              value={`${totalCost.toFixed(2)} €`}
              sub={
                `avg ${props.avgNetCost.toFixed(2)} c/kWh` +
                (props.transferEnabled
                  ? // "spot" = everything but transfer (spot + retailer margin, incl. solar opportunity cost)
                    ` (spot ${(props.avgNetCost - props.avgTransfer).toFixed(2)} c/kWh, transfer ${props.avgTransfer.toFixed(2)} c/kWh)`
                  : '')
              }
            />
            <Figure
              label="vs charging now"
              value={savingsVsNow >= 0.005 ? `−${savingsVsNow.toFixed(2)} €` : '–'}
              sub={
                savingsVsNow < 0.005
                  ? 'no cheaper time ahead'
                  : totalCost + savingsVsNow >= 0.01
                    ? `${((savingsVsNow / (totalCost + savingsVsNow)) * 100).toFixed(0)} % cheaper by waiting`
                    : 'cheaper by waiting'
              }
            />
            {props.solarEnabled && (
              <Figure label="Solar covers" value={`${props.solarPct.toFixed(0)} %`} sub={solarSub} />
            )}
          </Box>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
          {nowLine}
        </Typography>
      </CardContent>
    </Card>
  )
}
