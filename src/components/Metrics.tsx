import { Box, Card, CardContent, Typography } from '@mui/material'

function Metric({
  label,
  value,
  unit,
  sub,
}: {
  label: string
  value: string | number
  unit?: string
  sub?: string | string[]
}) {
  const subLines = sub == null ? [] : Array.isArray(sub) ? sub : [sub]
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
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
        {subLines.map((line, i) => (
          <Typography key={i} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {line}
          </Typography>
        ))}
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

export function Metrics({
  hoursNeeded,
  kWhNeeded,
  completionTime,
  nHours,
  totalCost,
  solarNow,
  solarPct,
  solarSavings,
  avgNetCost,
  solarEnabled,
}: Props) {
  const cols = 2 + (solarEnabled ? 1 : 0)
  const sameDay = completionTime && completionTime.toDateString() === new Date().toDateString()
  const doneBy = completionTime
    ? `done by ${completionTime.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}` +
      (sameDay ? '' : ` ${completionTime.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}`)
    : null
  const neededSub = [`${nHours} h rounded · ${kWhNeeded.toFixed(1)} kWh`]
  if (doneBy) neededSub.push(doneBy)
  if (solarEnabled) neededSub.push(`solar covers ${solarPct.toFixed(0)}% · saves ${solarSavings.toFixed(2)} €`)
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: `repeat(${cols}, 1fr)` }, gap: 1.5 }}>
      <Metric label="Charge plan" value={hoursNeeded.toFixed(1)} unit="h" sub={neededSub} />
      <Metric label="Est. cost" value={totalCost.toFixed(2)} unit="€" sub={`avg ${avgNetCost.toFixed(1)} c/kWh`} />
      {solarEnabled && <Metric label="Solar now" value={Math.round(solarNow)} unit="W" />}
    </Box>
  )
}
