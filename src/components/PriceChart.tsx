import { memo, useRef, useMemo } from 'react'
import { Box, Card, CardContent, Typography } from '@mui/material'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController,
  PointElement, Tooltip, Filler,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import type { Plugin, ScriptableLineSegmentContext, ChartOptions } from 'chart.js'
import type { HourEntry } from '../types'
import { calcNetCost } from '../utils/optimization'
import type { Params } from '../types'

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Tooltip, Filler)

const PRIMARY  = '#1976d2'
const SUCCESS  = '#2e7d32'
const WARNING  = '#ed6c02'

interface Props {
  hours: HourEntry[]
  selectedTs: Set<string>
  nowIdx: number
  hourSources: boolean[]
  horizonH: number
  params: Params
}

export const PriceChart = memo(function PriceChart({ hours, selectedTs, nowIdx, hourSources, horizonH, params }: Props) {
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
      ctx.strokeStyle = `${WARNING}cc`
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = WARNING
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

  const selBg   = hours.map(h => selectedTs.has(h.ts) ? `${PRIMARY}22` : 'rgba(0,0,0,0)')
  const nightBg = hours.map(h => (h.hour >= 22 || h.hour < 7) ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0)')

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
        borderColor: PRIMARY, backgroundColor: `${PRIMARY}18`,
        borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y', fill: true, order: 1,
        segment: {
          borderColor:     (ctx: ScriptableLineSegmentContext) => segBorder(ctx, PRIMARY, `${PRIMARY}88`, `${PRIMARY}44`),
          backgroundColor: (ctx: ScriptableLineSegmentContext) => segBorder(ctx, `${PRIMARY}18`, `${PRIMARY}0e`, `${PRIMARY}08`),
        },
      },
      {
        type: 'line' as const, label: 'Spot price', data: spotData,
        borderColor: `${PRIMARY}66`, borderWidth: 1,
        pointRadius: 0, tension: 0.3, yAxisID: 'y', fill: false, order: 2,
        segment: {
          borderColor: (ctx: ScriptableLineSegmentContext) => segBorder(ctx, `${PRIMARY}bb`, `${PRIMARY}66`, `${PRIMARY}33`),
          borderDash:  (ctx: ScriptableLineSegmentContext) => hourSources[ctx.p0DataIndex] ? [] : [2, 3],
        },
      },
      {
        type: 'line' as const, label: 'Solar output', data: solarKw,
        borderColor: `${SUCCESS}cc`, backgroundColor: `${SUCCESS}18`,
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
        ticks: { color: 'rgba(0,0,0,0.5)', font: { size: 10, family: 'monospace' }, maxTicksLimit: 12, maxRotation: 0 },
        grid:  { color: 'rgba(0,0,0,0.08)' },
      },
      y:  {
        position: 'left',
        title: { display: true, text: 'c/kWh', color: 'rgba(0,0,0,0.5)', font: { size: 10 } },
        ticks: { color: 'rgba(0,0,0,0.5)', font: { size: 10, family: 'monospace' } },
        grid:  { color: 'rgba(0,0,0,0.08)' },
        max: maxY,
      },
      y2: {
        position: 'right',
        title: { display: true, text: 'kW', color: `${SUCCESS}cc`, font: { size: 10 } },
        ticks: { color: `${SUCCESS}bb`, font: { size: 10, family: 'monospace' } },
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
            { color: PRIMARY,              label: 'Net cost (c/kWh)' },
            { color: `${PRIMARY}bb`,       label: 'Spot actual (c/kWh)' },
            { color: `${PRIMARY}55`,       label: 'Spot forecast (c/kWh)' },
            { color: `${SUCCESS}cc`,       label: 'Solar output (kW)' },
            { color: `${PRIMARY}22`,       label: 'Selected window' },
            { color: 'rgba(0,0,0,0.06)',   label: 'Night rate', border: true },
          ].map(({ color, label, border }) => (
            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.625 }}>
              <Box sx={{
                width: 10, height: 10, borderRadius: 0.25, bgcolor: color, flexShrink: 0,
                ...(border && { border: '1px solid rgba(0,0,0,0.2)' }),
              }} />
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  )
})
