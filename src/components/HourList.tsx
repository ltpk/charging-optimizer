import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material'
import type { HourEntry } from '../types'

interface Props {
  selectedList: HourEntry[]
  netCostMin: number
  netCostMax: number
}

function dayLabel(dt: Date): string | null {
  const today    = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (dt.toDateString() === today.toDateString())    return null
  if (dt.toDateString() === tomorrow.toDateString()) return 'tomorrow'
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })
}

export function HourList({ selectedList, netCostMin, netCostMax }: Props) {
  // anchor bars to the spread of all upcoming hours: full+green = cheapest available, empty+red = priciest
  const range = Math.max(netCostMax - netCostMin, 0.01)

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
          Cheapest hours
        </Typography>

        {selectedList.map((h, i) => {
          const norm  = (h.netCost - netCostMin) / range          // 0 = cheapest, 1 = priciest
          const pct   = (1 - norm) * 100
          const color = norm < 0.34 ? 'success' : norm < 0.67 ? 'warning' : 'error'
          const date  = dayLabel(h.dt)
          return (
            <Box
              key={h.ts}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, py: 1,
                borderBottom: i < selectedList.length - 1 ? '1px solid' : 'none', borderColor: 'divider',
              }}
            >
              <Box sx={{ minWidth: 48 }}>
                <Typography variant="body2" fontWeight="medium" color="primary"
                  sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {h.dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </Typography>
                {date && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {date}
                  </Typography>
                )}
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <LinearProgress variant="determinate" value={pct} color={color} />
              </Box>

              <Typography variant="caption" color="text.secondary"
                sx={{ minWidth: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {h.netCost.toFixed(2)} c/kWh
              </Typography>
            </Box>
          )
        })}
      </CardContent>
    </Card>
  )
}
