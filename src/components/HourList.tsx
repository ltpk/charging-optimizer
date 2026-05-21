import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material'
import type { HourEntry } from '../types'

interface Props { selectedList: HourEntry[] }

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
          const pct   = (maxNetto - h.netCost) / netCostRange * 100
          const label = h.dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' }) + ' ' +
                        h.dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          return (
            <Box
              key={h.ts}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, py: 1,
                borderBottom: i < selectedList.length - 1 ? '1px solid' : 'none', borderColor: 'divider',
              }}
            >
              <Typography variant="body2" fontWeight="medium" color="primary"
                sx={{ minWidth: 48, fontVariantNumeric: 'tabular-nums' }}>
                {h.dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </Typography>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.375}>
                  {label}
                </Typography>
                <LinearProgress variant="determinate" value={pct} color="success" />
              </Box>

              <Typography variant="caption" color="text.secondary"
                sx={{ minWidth: 56, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {h.netCost.toFixed(2)} c
              </Typography>
            </Box>
          )
        })}
      </CardContent>
    </Card>
  )
}
