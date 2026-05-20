import { Box, Paper, Typography } from '@mui/material'
import type { HourEntry } from '../types'

interface Props { selectedList: HourEntry[] }

export function HourList({ selectedList }: Props) {
  const netCostValues = selectedList.map(h => h.netCost)
  const minNetto    = selectedList.length > 0 ? Math.min(...netCostValues) : 0
  const maxNetto    = selectedList.length > 0 ? Math.max(...netCostValues) : 0.01
  const netCostRange  = Math.max(maxNetto - minNetto, 0.01)

  return (
    <Paper sx={{ p: '18px 20px', border: '1px solid', borderColor: 'divider' }}>
      <Typography
        variant="overline" color="text.secondary" display="block" mb={1.75}
        sx={{ fontSize: 11, letterSpacing: '0.1em' }}
      >
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
              display: 'flex', alignItems: 'center', gap: 1.5, py: 1.125,
              borderBottom: i < selectedList.length - 1 ? '1px solid' : 'none', borderColor: 'divider',
            }}
          >
            <Typography sx={{
              fontSize: 12, fontWeight: 600, color: 'primary.main',
              minWidth: 50, fontVariantNumeric: 'tabular-nums',
            }}>
              {h.dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </Typography>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.375}>
                {label}
              </Typography>
              <Box sx={{ height: 4, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
                <Box sx={{
                  height: '100%', width: `${pct.toFixed(0)}%`,
                  bgcolor: 'success.main', borderRadius: 1, transition: 'width 0.4s',
                }} />
              </Box>
            </Box>

            <Typography variant="caption" color="text.secondary"
              sx={{ minWidth: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {h.netCost.toFixed(2)} c
            </Typography>
          </Box>
        )
      })}
    </Paper>
  )
}
