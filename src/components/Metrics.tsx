import { Box, Card, CardContent, Typography } from '@mui/material'

function Metric({ label, value, unit, sub }: { label: string; value: string | number; unit: string; sub?: string }) {
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
        {sub && (
          <Typography variant="caption" color="text.secondary" display="block">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

interface Props {
  hoursNeeded: number
  kWhNeeded: number
  nHours: number
  totalCost: number
  solarNow: number
  solarPct: number
  solarSavings: number
  avgNetCost: number
  solarEnabled: boolean
}

export function Metrics({ hoursNeeded, kWhNeeded, nHours, totalCost, solarNow, solarPct, solarSavings, avgNetCost, solarEnabled }: Props) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
      <Metric label="Needed"             value={hoursNeeded.toFixed(1)} unit="h" sub={`${kWhNeeded.toFixed(1)} kWh`} />
      <Metric label="Duration (rounded)" value={nHours}                 unit="h" />
      <Metric label="Est. cost"          value={totalCost.toFixed(2)}   unit="€" sub={`avg ${avgNetCost.toFixed(1)} c/kWh`} />
      {solarEnabled
        ? <Metric label="Solar now"      value={Math.round(solarNow)}   unit="W" sub={`covers ${solarPct.toFixed(0)}% · saves ${solarSavings.toFixed(2)} €`} />
        : <Metric label="Avg. net cost"  value={avgNetCost.toFixed(2)}  unit="c/kWh" />
      }
    </Box>
  )
}
