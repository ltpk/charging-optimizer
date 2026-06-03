import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material'
import type { HourEntry } from '../types'

interface Props {
  selectedList: HourEntry[]
  netCostMin: number
  netCostMax: number
  currentTs: string
}

function dayLabel(dt: Date): string | null {
  const today    = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (dt.toDateString() === today.toDateString())    return null
  if (dt.toDateString() === tomorrow.toDateString()) return 'tomorrow'
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })
}

export function HourList({ selectedList, netCostMin, netCostMax, currentTs }: Props) {
  // anchor bars to the spread of all upcoming hours: full+green = cheapest available, empty+red = priciest
  const range    = Math.max(netCostMax - netCostMin, 0.01)
  const cheapest = selectedList.length ? Math.min(...selectedList.map(h => h.netCost)) : 0

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
          Cheapest hours
        </Typography>

        {selectedList.map((h, i) => {
          const norm  = (h.netCost - netCostMin) / range          // 0 = cheapest, 1 = priciest
          const pct   = (1 - norm) * 100
          const color = norm < 0.34 ? 'success' : norm < 0.67 ? 'warning' : 'error'
          const date  = dayLabel(h.dt)
          const isNow = h.ts === currentTs
          const delta = h.netCost - cheapest
          return (
            <Box
              key={h.ts}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, py: 1, px: 1, mx: -1, borderRadius: 1,
                bgcolor: isNow ? 'action.selected' : 'transparent',
                borderBottom: i < selectedList.length - 1 ? '1px solid' : 'none', borderColor: 'divider',
              }}
            >
              <Box sx={{ minWidth: 48 }}>
                <Typography variant="body2" color="primary"
                  sx={{ fontWeight: 'medium', fontVariantNumeric: 'tabular-nums' }}>
                  {h.dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </Typography>
                {isNow
                  ? <Typography variant="caption" color="primary" sx={{ fontWeight: 'medium', display: 'block' }}>now</Typography>
                  : date && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {date}
                    </Typography>
                  )}
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <LinearProgress variant="determinate" value={pct} color={color} />
              </Box>

              <Box sx={{ minWidth: 64, textAlign: 'right' }}>
                <Typography variant="caption" color="text.secondary"
                  sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>
                  {h.netCost.toFixed(2)} c/kWh
                </Typography>
                <Typography variant="caption" color={delta < 0.005 ? 'success.main' : 'text.disabled'}
                  sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>
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
