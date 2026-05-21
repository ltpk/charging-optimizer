import { Box, Card, CardContent, Typography } from '@mui/material'

function Metric({ label, value, unit }: { label: string; value: string | number; unit: string }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary" display="block">
          {label}
        </Typography>
        <Typography variant="h5">
          {value}
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
            {unit}
          </Typography>
        </Typography>
      </CardContent>
    </Card>
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
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
      <Metric label="Needed"             value={hoursNeeded.toFixed(1)} unit="h" />
      <Metric label="Duration (rounded)" value={nHours}                 unit="h" />
      <Metric label="Est. cost"          value={totalCost.toFixed(2)}   unit="€" />
      <Metric label="Solar now"          value={Math.round(solarNow)}   unit="W" />
    </Box>
  )
}
