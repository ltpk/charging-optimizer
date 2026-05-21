import { memo, useRef, useMemo } from 'react'
import { Box, Card, CardContent, Typography } from '@mui/material'
import { useTheme, alpha } from '@mui/material/styles'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController,
  PointElement, Tooltip, Filler,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import type { Plugin, ScriptableLineSegmentContext, ChartOptions } from 'chart.js'
import type { HourEntry, Params } from '../types'
import { calcNetCost } from '../utils/optimization'

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Tooltip, Filler)

interface Props {
  hours: HourEntry[]
  selectedTs: Set<string>
  nowIdx: number
  hourSources: boolean[]
  horizonH: number
  params: Params
}

export const PriceChart = memo(function PriceChart({ hours, selectedTs, nowIdx, hourSources, horizonH, params }: Props) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const P = theme.palette.primary.main
  const S = theme.palette.success.main
  const W = theme.palette.warning.main
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
  const tickColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
  const nightBg   = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'

  // Ref pattern: plugin is memoized once, reads latest values via ref
  const colorsRef = useRef({ W, P, S, gridColor, tickColor, nightBg, isDark })
  colorsRef.current = { W, P, S, gridColor, tickColor, nightBg, isDark }
  const nowIdxRef = useRef(-1)
  nowIdxRef.current = nowIdx

  const nowLinePlugin = useMemo<Plugin<'bar'>>(() => ({
    id: 'nowLine',
    afterDraw(chart) {
      const idx = nowIdxRef.current
      if (idx < 0) return
      const { W } = colorsRef.current
      const { ctx, chartArea, scales } = chart
      const x = scales['x'].getPixelForValue(idx)
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(x, chartArea.top)
      ctx.lineTo(x, chartArea.bottom)
      ctx.strokeStyle = alpha(W, 0.8)
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = W
      ctx.font = '10px monospace'
      ctx.fillText('now', x + 3, chartArea.top + 12)
      ctx.restore()
    },
  }), [])

  const showDate = horizonH > 24
  const labels   = hours.map(h => {
    const t = h.dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    if (!showDate) return t
    if (h.hour === 0 || h === hours[0])
      return h.dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' }) + ' ' + t
    return t
  })

  const netCostData = hours.map(h => +calcNetCost(params, h.spotCent, h.hour, h.solarW).toFixed(3))
  const spotData  = hours.map(h => +h.spotCent.toFixed(3))
  const solarKw   = hours.map(h => +(h.solarW / 1000).toFixed(3))
  const maxY      = Math.max(...netCostData, 1) * 1.2
  const maxY2     = Math.max(...solarKw, 1) * 1.5

  const selBg   = hours.map(h => selectedTs.has(h.ts) ? alpha(P, 0.13) : 'rgba(0,0,0,0)')
  const nightBgData = hours.map(h => (h.hour >= 22 || h.hour < 7) ? nightBg : 'rgba(0,0,0,0)')

  const segBorder = (ctx: ScriptableLineSegmentContext, actual: string, predicted: string, past: string) => {
    const i = ctx.p0DataIndex
    if (nowIdx >= 0 && i < nowIdx) return past
    return hourSources[i] ? actual : predicted
  }

  const data = {
    labels,
    datasets: [
      {
        type: 'line' as const, label: 'Net cost', data: netCostData,
        borderColor: P, backgroundColor: alpha(P, 0.09),
        borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y', fill: true, order: 1,
        segment: {
          borderColor:     (ctx: ScriptableLineSegmentContext) => segBorder(ctx, P, alpha(P, 0.53), alpha(P, 0.27)),
          backgroundColor: (ctx: ScriptableLineSegmentContext) => segBorder(ctx, alpha(P, 0.09), alpha(P, 0.05), alpha(P, 0.03)),
        },
      },
      {
        type: 'line' as const, label: 'Spot price', data: spotData,
        borderColor: alpha(P, 0.4), borderWidth: 1,
        pointRadius: 0, tension: 0.3, yAxisID: 'y', fill: false, order: 2,
        segment: {
          borderColor: (ctx: ScriptableLineSegmentContext) => segBorder(ctx, alpha(P, 0.73), alpha(P, 0.4), alpha(P, 0.2)),
          borderDash:  (ctx: ScriptableLineSegmentContext) => hourSources[ctx.p0DataIndex] ? [] : [2, 3],
        },
      },
      {
        type: 'line' as const, label: 'Solar output', data: solarKw,
        borderColor: alpha(S, 0.8), backgroundColor: alpha(S, 0.09),
        borderWidth: 1.5, pointRadius: 0, tension: 0.4, yAxisID: 'y2', fill: true, order: 3,
      },
      {
        type: 'bar' as const, label: '_sel',   data: hours.map(() => 9999),
        backgroundColor: selBg,      yAxisID: 'y', barPercentage: 1, categoryPercentage: 1, order: 10,
      },
      {
        type: 'bar' as const, label: '_night', data: hours.map(() => 9999),
        backgroundColor: nightBgData, yAxisID: 'y', barPercentage: 1, categoryPercentage: 1, order: 11,
      },
    ],
  }

  const options: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index', intersect: false,
        filter: item => !item.dataset.label!.startsWith('_'),
        callbacks: {
          title: ctx => ctx[0]?.label ?? '',
          label: ctx => {
            const l   = ctx.dataset.label ?? ''
            const v   = ctx.parsed.y ?? 0
            const src = hourSources[ctx.dataIndex] ? 'actual' : 'forecast'
            if (l === 'Net cost')     return ` Net cost: ${v.toFixed(2)} c/kWh`
            if (l === 'Spot price')   return ` Spot (${src}): ${v.toFixed(2)} c/kWh`
            if (l === 'Solar output') return ` Solar: ${v.toFixed(2)} kW`
            return ''
          },
        },
      },
    },
    scales: {
      x:  {
        ticks: { color: tickColor, font: { size: 10, family: 'monospace' }, maxTicksLimit: 12, maxRotation: 0 },
        grid:  { color: gridColor },
      },
      y:  {
        position: 'left',
        title: { display: true, text: 'c/kWh', color: tickColor, font: { size: 10 } },
        ticks: { color: tickColor, font: { size: 10, family: 'monospace' } },
        grid:  { color: gridColor },
        max: maxY,
      },
      y2: {
        position: 'right',
        title: { display: true, text: 'kW', color: alpha(S, 0.8), font: { size: 10 } },
        ticks: { color: alpha(S, 0.7), font: { size: 10, family: 'monospace' } },
        grid:  { drawOnChartArea: false },
        min: 0, max: maxY2,
      },
    },
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
          Price &amp; optimal window
        </Typography>

        <Box sx={{ position: 'relative', height: 200 }}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Chart type="bar" data={data as any} options={options} plugins={[nowLinePlugin]} />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
          {[
            { color: P,            label: 'Net cost (c/kWh)' },
            { color: alpha(P,0.73), label: 'Spot actual (c/kWh)' },
            { color: alpha(P,0.35), label: 'Spot forecast (c/kWh)' },
            { color: alpha(S,0.8),  label: 'Solar output (kW)' },
            { color: alpha(P,0.13), label: 'Selected window', border: true },
            { color: nightBg,       label: 'Night rate', border: true },
          ].map(({ color, label, border }) => (
            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.625 }}>
              <Box sx={{
                width: 10, height: 10, borderRadius: 0.25, bgcolor: color, flexShrink: 0,
                ...(border && { border: '1px solid', borderColor: 'divider' }),
              }} />
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  )
})
