import { memo, useRef, useMemo } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Filler,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import type { Plugin, ScriptableLineSegmentContext, ChartOptions } from 'chart.js'
import type { HourEntry } from '../types'
import { calcNetCost } from '../utils/optimization'
import type { Params } from '../types'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Filler)

interface Props {
  hours: HourEntry[]
  selectedTs: Set<string>
  nowIdx: number
  hourSources: boolean[]
  horizonH: number
  params: Params
}

export const PriceChart = memo(function PriceChart({ hours, selectedTs, nowIdx, hourSources, horizonH, params }: Props) {
  // Ref so the plugin closure always reads the latest values without recreating the plugin
  const ref = useRef({ nowIdx: -1 })
  ref.current.nowIdx = nowIdx

  const nowLinePlugin = useMemo<Plugin<'bar'>>(() => ({
    id: 'nowLine',
    afterDraw(chart) {
      const idx = ref.current.nowIdx
      if (idx < 0) return
      const { ctx, chartArea, scales } = chart
      const x = scales['x'].getPixelForValue(idx)
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(x, chartArea.top)
      ctx.lineTo(x, chartArea.bottom)
      ctx.strokeStyle = 'rgba(240,160,96,0.8)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(240,160,96,0.9)'
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

  const selBg   = hours.map(h => selectedTs.has(h.ts) ? 'rgba(126,212,160,0.25)' : 'rgba(0,0,0,0)')
  const nightBg = hours.map(h => (h.hour >= 22 || h.hour < 7) ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0)')

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
        borderColor: '#4f8ef7', backgroundColor: 'rgba(79,142,247,0.1)',
        borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y', fill: true, order: 1,
        segment: {
          borderColor:     (ctx: ScriptableLineSegmentContext) => segBorder(ctx, '#4f8ef7', 'rgba(79,142,247,0.55)', 'rgba(79,142,247,0.22)'),
          backgroundColor: (ctx: ScriptableLineSegmentContext) => segBorder(ctx, 'rgba(79,142,247,0.1)', 'rgba(79,142,247,0.06)', 'rgba(79,142,247,0.03)'),
        },
      },
      {
        type: 'line' as const, label: 'Spot price', data: spotData,
        borderColor: 'rgba(79,142,247,0.4)', borderWidth: 1,
        pointRadius: 0, tension: 0.3, yAxisID: 'y', fill: false, order: 2,
        segment: {
          borderColor: (ctx: ScriptableLineSegmentContext) => segBorder(ctx, 'rgba(79,142,247,0.9)', 'rgba(79,142,247,0.4)', 'rgba(79,142,247,0.15)'),
          borderDash:  (ctx: ScriptableLineSegmentContext) => hourSources[ctx.p0DataIndex] ? [] : [2, 3],
        },
      },
      {
        type: 'line' as const, label: 'Solar output', data: solarKw,
        borderColor: 'rgba(126,212,160,0.8)', backgroundColor: 'rgba(126,212,160,0.07)',
        borderWidth: 1.5, pointRadius: 0, tension: 0.4, yAxisID: 'y2', fill: true, order: 3,
      },
      {
        type: 'bar' as const, label: '_sel',   data: hours.map(() => 9999),
        backgroundColor: selBg,   yAxisID: 'y', barPercentage: 1, categoryPercentage: 1, order: 10,
      },
      {
        type: 'bar' as const, label: '_night', data: hours.map(() => 9999),
        backgroundColor: nightBg, yAxisID: 'y', barPercentage: 1, categoryPercentage: 1, order: 11,
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
        ticks: { color: '#6b7080', font: { size: 10, family: 'monospace' }, maxTicksLimit: 12, maxRotation: 0 },
        grid:  { color: 'rgba(255,255,255,0.04)' },
      },
      y:  {
        position: 'left',
        title: { display: true, text: 'c/kWh', color: '#6b7080', font: { size: 10 } },
        ticks: { color: '#6b7080', font: { size: 10, family: 'monospace' } },
        grid:  { color: 'rgba(255,255,255,0.04)' },
        max: maxY,
      },
      y2: {
        position: 'right',
        title: { display: true, text: 'kW', color: 'rgba(126,212,160,0.8)', font: { size: 10 } },
        ticks: { color: 'rgba(126,212,160,0.7)', font: { size: 10, family: 'monospace' } },
        grid:  { drawOnChartArea: false },
        min: 0, max: maxY2,
      },
    },
  }

  return (
    <Paper sx={{ p: '18px 20px', border: '1px solid', borderColor: 'divider' }}>
      <Typography
        variant="overline" color="text.secondary" display="block" mb={1.75}
        sx={{ fontSize: 11, letterSpacing: '0.1em' }}
      >
        Price &amp; optimal window
      </Typography>

      <Box sx={{ position: 'relative', height: 200 }}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Chart type="bar" data={data as any} options={options} plugins={[nowLinePlugin]} />
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
        {[
          { color: '#4f8ef7',               label: 'Net cost (c/kWh)' },
          { color: 'rgba(79,142,247,0.9)',   label: 'Spot actual (c/kWh)' },
          { color: 'rgba(79,142,247,0.35)',  label: 'Spot forecast (c/kWh)' },
          { color: 'rgba(126,212,160,0.8)',  label: 'Solar output (kW)' },
          { color: 'rgba(126,212,160,0.25)', label: 'Selected window' },
          { color: 'rgba(255,255,255,0.05)', label: 'Night rate' },
        ].map(({ color, label }) => (
          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.625 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.25, bgcolor: color, flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  )
})
