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
  savingsVsNow: number
  spotNow: number
  transferNow: number
  transferEnabled: boolean
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
  savingsVsNow,
  spotNow,
  transferNow,
  transferEnabled,
  solarNow,
  solarPct,
  solarSavings,
  avgNetCost,
  solarEnabled,
}: Props) {
  const sameDay = completionTime && completionTime.toDateString() === new Date().toDateString()
  const doneBy = completionTime
    ? `done by ${completionTime.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}` +
      (sameDay ? '' : ` ${completionTime.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}`)
    : null
  const neededSub = [`${nHours} h rounded · ${kWhNeeded.toFixed(1)} kWh`]
  if (doneBy) neededSub.push(doneBy)
  if (solarEnabled) neededSub.push(`solar covers ${solarPct.toFixed(0)}% · saves ${solarSavings.toFixed(2)} €`)
  const nowSub = transferEnabled ? [`transfer ${transferNow.toFixed(2)} c/kWh`] : []
  if (solarEnabled) nowSub.push(`solar ${Math.round(solarNow)} W`)
  const costSub = [`avg ${avgNetCost.toFixed(1)} c/kWh`]
  if (savingsVsNow >= 0.005) {
    const savingsPct = (savingsVsNow / (totalCost + savingsVsNow)) * 100
    costSub.push(`saves ${savingsVsNow.toFixed(2)} € (${savingsPct.toFixed(0)} %) vs now`)
  }
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
      <Metric label="Charge plan" value={hoursNeeded.toFixed(1)} unit="h" sub={neededSub} />
      <Metric label="Est. cost" value={totalCost.toFixed(2)} unit="€" sub={costSub} />
      <Metric label="Spot now" value={spotNow.toFixed(2)} unit="c/kWh" sub={nowSub} />
    </Box>
  )
}
