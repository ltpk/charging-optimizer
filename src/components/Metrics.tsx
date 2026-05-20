import { Box, Paper, Typography } from '@mui/material'

function Metric({ label, value, unit }: { label: string; value: string | number; unit: string }) {
  return (
    <Paper sx={{ p: '14px 16px', border: '1px solid', borderColor: 'divider' }}>
      <Typography
        variant="overline"
        color="text.secondary"
        display="block"
        mb={0.75}
        sx={{ fontSize: 10, letterSpacing: '0.1em' }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 700 }}>
        {value}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.4 }}>
          {unit}
        </Typography>
      </Typography>
    </Paper>
  )
}

interface Props {
  hoursNeeded: number
  nHours: number
  totalCost: number
  solarNow: number
}

export function Metrics({ hoursNeeded, nHours, totalCost, solarNow }: Props) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
      <Metric label="Needed"            value={hoursNeeded.toFixed(1)} unit="h" />
      <Metric label="Duration (rounded)" value={nHours}                unit="h" />
      <Metric label="Est. cost"          value={totalCost.toFixed(2)}  unit="€" />
      <Metric label="Solar now"          value={Math.round(solarNow)}  unit="W" />
    </Box>
  )
}
