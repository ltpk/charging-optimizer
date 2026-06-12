import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material'
import { SLOT_MS } from '../utils/optimization'
import type { SlotEntry } from '../types'

interface Props {
  selectedList: SlotEntry[]
  netCostMin: number
  netCostMax: number
  currentTs: string
}

interface Group {
  start: Date
  end: Date
  netCost: number
  count: number
  isNow: boolean
}

// contiguous selected slots grouped per clock hour: a fully selected hour is one row,
// window edges and isolated quarters show as partial rows (cost = average of the slots)
function groupSlots(selectedList: SlotEntry[], currentTs: string): Group[] {
  const groups: Group[] = []
  for (const h of selectedList) {
    const last = groups[groups.length - 1]
    if (last && h.dt.getTime() === last.end.getTime() && h.dt.getMinutes() !== 0) {
      last.end = new Date(h.dt.getTime() + SLOT_MS)
      last.netCost += h.netCost
      last.count++
      last.isNow ||= h.ts === currentTs
    } else {
      groups.push({
        start: h.dt,
        end: new Date(h.dt.getTime() + SLOT_MS),
        netCost: h.netCost,
        count: 1,
        isNow: h.ts === currentTs,
      })
    }
  }
  return groups.map(g => ({ ...g, netCost: g.netCost / g.count }))
}

function dayLabel(dt: Date): string | null {
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (dt.toDateString() === today.toDateString()) return null
  if (dt.toDateString() === tomorrow.toDateString()) return 'tomorrow'
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })
}

export function HourList({ selectedList, netCostMin, netCostMax, currentTs }: Props) {
  const groups = groupSlots(selectedList, currentTs)
  // anchor bars to the spread of all upcoming slots: full+green = cheapest available, empty+red = priciest
  const range = Math.max(netCostMax - netCostMin, 0.01)
  const cheapest = groups.length ? Math.min(...groups.map(g => g.netCost)) : 0

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
          Cheapest hours
        </Typography>

        {groups.map((g, i) => {
          const norm = (g.netCost - netCostMin) / range // 0 = cheapest, 1 = priciest
          const pct = (1 - norm) * 100
          const color = norm < 0.34 ? 'success' : norm < 0.67 ? 'warning' : 'error'
          const date = dayLabel(g.start)
          const delta = g.netCost - cheapest
          // caption priority: now > other-day date > partial-hour duration
          const caption = g.isNow ? 'now' : (date ?? (g.count < 4 ? `${g.count * 15} min` : null))
          return (
            <Box
              key={g.start.toISOString()}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 1,
                px: 1,
                mx: -1,
                borderRadius: 1,
                bgcolor: g.isNow ? 'action.selected' : 'transparent',
                borderBottom: i < groups.length - 1 ? '1px solid' : 'none',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ minWidth: 48 }}>
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{ fontWeight: 'medium', fontVariantNumeric: 'tabular-nums' }}
                >
                  {g.start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </Typography>
                {caption && (
                  <Typography
                    variant="caption"
                    color={g.isNow ? 'primary' : 'text.secondary'}
                    sx={{ display: 'block', ...(g.isNow && { fontWeight: 'medium' }) }}
                  >
                    {caption}
                  </Typography>
                )}
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <LinearProgress variant="determinate" value={pct} color={color} />
              </Box>

              <Box sx={{ minWidth: 64, textAlign: 'right' }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
                >
                  {g.netCost.toFixed(2)} c/kWh
                </Typography>
                <Typography
                  variant="caption"
                  color={delta < 0.005 ? 'success.main' : 'text.disabled'}
                  sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
                >
                  {delta < 0.005 ? 'cheapest' : `+${delta.toFixed(2)}`}
                </Typography>
              </Box>
            </Box>
          )
        })}
      </CardContent>
    </Card>
  )
}
