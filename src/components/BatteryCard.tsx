import { Box, Card, CardContent, Typography } from '@mui/material'
import { SliderField } from './fields'
import type { Params } from '../types'

interface Props {
  params: Params
  onParamChange: <K extends keyof Params>(key: K, value: Params[K]) => void
}

// compact battery controls surfaced in the main view on small screens, where the full
// settings live behind the drawer — the daily SOC tweak shouldn't hide the plan it updates
export function BatteryCard({ params, onParamChange }: Props) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Typography variant="overline" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
          Battery State
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3, rowGap: 1.5 }}>
          <SliderField
            label="SOC now"
            value={params.socNow}
            unit="%"
            min={0}
            max={100}
            step={1}
            onChange={v => onParamChange('socNow', v)}
          />
          <SliderField
            label="SOC target"
            value={params.socTarget}
            unit="%"
            min={10}
            max={100}
            step={10}
            onChange={v => onParamChange('socTarget', v)}
          />
        </Box>
        {params.socNow >= params.socTarget && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
            SOC now ≥ target — battery already full
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
