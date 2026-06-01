import { Box, Card, CardContent, Typography } from '@mui/material'

function Metric({ label, value, unit, sub }: { label: string; value: string | number; unit?: string; sub?: string }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary" display="block">
          {label}
        </Typography>
        <Typography variant="h5">
          {value}
          {unit && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              {unit}
            </Typography>
          )}
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
  completionTime: Date | null
  nHours: number
  totalCost: number
  solarNow: number
  solarPct: number
  solarSavings: number
  avgNetCost: number
  solarEnabled: boolean
}

export function Metrics({ hoursNeeded, kWhNeeded, completionTime, nHours, totalCost, solarNow, solarPct, solarSavings, avgNetCost, solarEnabled }: Props) {
  const cols = 3 + (completionTime ? 1 : 0) + (solarEnabled ? 1 : 0)
  const sameDay = completionTime && completionTime.toDateString() === new Date().toDateString()
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: `repeat(${cols}, 1fr)` }, gap: 1.5 }}>
      <Metric label="Needed"             value={hoursNeeded.toFixed(1)} unit="h" sub={`${kWhNeeded.toFixed(1)} kWh`} />
      <Metric label="Duration (rounded)" value={nHours}                 unit="h" />
      <Metric label="Est. cost"          value={totalCost.toFixed(2)}   unit="€" sub={`avg ${avgNetCost.toFixed(1)} c/kWh`} />
      {completionTime &&
        <Metric label="Done by"          value={completionTime.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}
                sub={sameDay ? undefined : completionTime.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })} />
      }
      {solarEnabled &&
        <Metric label="Solar now"        value={Math.round(solarNow)}   unit="W" sub={`covers ${solarPct.toFixed(0)}% · saves ${solarSavings.toFixed(2)} €`} />
      }
    </Box>
  )
}
