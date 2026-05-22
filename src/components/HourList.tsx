import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material'
import type { HourEntry } from '../types'

interface Props { selectedList: HourEntry[] }

function dayLabel(dt: Date): string | null {
  const today    = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (dt.toDateString() === today.toDateString())    return null
  if (dt.toDateString() === tomorrow.toDateString()) return 'tomorrow'
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })
}

export function HourList({ selectedList }: Props) {
  const netCostValues = selectedList.map(h => h.netCost)
  const minNetto    = selectedList.length > 0 ? Math.min(...netCostValues) : 0
  const maxNetto    = selectedList.length > 0 ? Math.max(...netCostValues) : 0.01
  const netCostRange  = Math.max(maxNetto - minNetto, 0.01)

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
          Cheapest hours
        </Typography>

        {selectedList.map((h, i) => {
          const pct  = (maxNetto - h.netCost) / netCostRange * 100
          const date = dayLabel(h.dt)
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
                <LinearProgress variant="determinate" value={pct} color="success" />
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
