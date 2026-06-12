import { memo, useRef, useMemo } from 'react'
import { Box, Card, CardContent, Typography } from '@mui/material'
import { useTheme, alpha } from '@mui/material/styles'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Tooltip,
  Filler,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import type { Plugin, ScriptableLineSegmentContext, ChartOptions } from 'chart.js'
import { isNightHour, SLOT_MS } from '../utils/optimization'
import type { SlotEntry, Params } from '../types'

ChartJS.register(CategoryScale, LinearScale, LineElement, LineController, PointElement, Tooltip, Filler)

interface Props {
  slots: SlotEntry[]
  selectedTs: Set<string>
  nowIdx: number
  slotSources: boolean[]
  horizonH: number
  params: Params
}

export const PriceChart = memo(function PriceChart({
  slots,
  selectedTs,
  nowIdx,
  slotSources,
  horizonH,
  params,
}: Props) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const P = theme.palette.primary.main
  const S = theme.palette.success.main
  const W = theme.palette.warning.main
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
  const tickColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
  const nightBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'

  // Ref pattern: plugin is memoized once, reads latest values via ref
  const colorsRef = useRef({ W, P, S, gridColor, tickColor, nightBg, isDark })
  colorsRef.current = { W, P, S, gridColor, tickColor, nightBg, isDark }
  // Ticks mark slot starts; the now-line sits at the elapsed fraction of the current slot
  const nowPos =
    nowIdx >= 0 ? nowIdx + Math.min(Math.max((Date.now() - slots[nowIdx].dt.getTime()) / SLOT_MS, 0), 1) : -1
  const nowPosRef = useRef(-1)
  nowPosRef.current = nowPos

  const nowLinePlugin = useMemo<Plugin<'line'>>(
    () => ({
      id: 'nowLine',
      afterDraw(chart) {
        const idx = nowPosRef.current
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
    }),
    [],
  )

  // Slot i shades the span from tick i to tick i+1; drawn as rects so it aligns
  // with slot starts instead of bar cells centered on the ticks
  const shadeRef = useRef<{ sel: boolean[]; night: boolean[]; hourStart: boolean[] }>({
    sel: [],
    night: [],
    hourStart: [],
  })
  shadeRef.current = {
    sel: slots.map(h => selectedTs.has(h.ts)),
    night: slots.map(h => isNightHour(h.hour)),
    hourStart: slots.map(h => h.dt.getMinutes() === 0),
  }

  const bgShadePlugin = useMemo<Plugin<'line'>>(
    () => ({
      id: 'bgShade',
      beforeDatasetsDraw(chart) {
        const { sel, night, hourStart } = shadeRef.current
        const { S, nightBg } = colorsRef.current
        const { ctx, chartArea, scales } = chart
        const x = scales['x']
        const clampL = (px: number) => Math.max(px, chartArea.left)
        const clampR = (px: number) => Math.min(px, chartArea.right)
        ctx.save()

        // night shading: merge contiguous slots into single rects (avoids hairline seams)
        let runStart = -1
        for (let i = 0; i <= night.length; i++) {
          if (i < night.length && night[i]) {
            if (runStart < 0) runStart = i
            continue
          }
          if (runStart >= 0) {
            const left = clampL(x.getPixelForValue(runStart))
            const right = clampR(x.getPixelForValue(i))
            if (right > left) {
              ctx.fillStyle = nightBg
              ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top)
            }
            runStart = -1
          }
        }

        // selected window: gaps only at hour boundaries inside a contiguous run, so the
        // window reads as per-hour bars while its outer edges stay flush with the slot ticks
        for (let i = 0; i < sel.length; i++) {
          if (!sel[i]) continue
          const left = clampL(x.getPixelForValue(i))
          const right = clampR(x.getPixelForValue(i + 1))
          if (right <= left) continue
          const inset = Math.min(2, (right - left) * 0.4)
          const l = left + (sel[i - 1] && hourStart[i] ? inset : 0)
          const r = right - (sel[i + 1] && hourStart[i + 1] ? inset : 0)
          ctx.fillStyle = alpha(S, 0.25)
          ctx.fillRect(l, chartArea.top, r - l, chartArea.bottom - chartArea.top)
        }
        ctx.restore()
      },
    }),
    [],
  )

  const solarEnabled = params.solarEnabled

  const showDate = horizonH > 24
  const fmtLabel = (dt: Date, first: boolean) => {
    const t = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    if (!showDate) return t
    if (dt.getHours() === 0 || first)
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' }) + ' ' + t
    return t
  }
  // One extra end-of-window label so the last slot's span has width on the axis
  const dts = slots.map(h => h.dt)
  if (slots.length > 0) dts.push(new Date(slots[slots.length - 1].dt.getTime() + SLOT_MS))
  const labels = dts.map((dt, i) => fmtLabel(dt, i === 0))

  // axis labels/gridlines only at hour starts, thinned to ≤ ~12 clock-aligned labels
  const labelStepH = Math.max(1, Math.ceil(dts.length / 4 / 12))
  const tickShow = dts.map(dt => dt.getMinutes() === 0 && dt.getHours() % labelStepH === 0)

  const netCostData = slots.map(h => +h.netCost.toFixed(3))
  const spotData = slots.map(h => +h.spotCent.toFixed(3))
  const transferData = slots.map(h => (isNightHour(h.hour) ? params.transferNight : params.transferDay))
  // Hold the last slot's fee through to the end-of-window tick
  if (transferData.length > 0) transferData.push(transferData[transferData.length - 1])
  const solarKw = slots.map(h => +(h.solarW / 1000).toFixed(3))
  const maxY = Math.max(...netCostData, ...spotData, ...transferData, 1) * 1.2
  const minY = Math.min(0, ...netCostData, ...spotData) * 1.1
  const maxY2 = Math.max(...solarKw, 1) * 1.5

  const segBorder = (ctx: ScriptableLineSegmentContext, actual: string, predicted: string, past: string) => {
    const i = ctx.p0DataIndex
    if (nowIdx >= 0 && i < nowIdx) return past
    return slotSources[i] ? actual : predicted
  }

  const data = {
    labels,
    datasets: [
      {
        type: 'line' as const,
        label: 'Net cost',
        data: netCostData,
        borderColor: P,
        backgroundColor: alpha(P, 0.09),
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'y',
        fill: true,
        order: 1,
        segment: {
          borderColor: (ctx: ScriptableLineSegmentContext) => segBorder(ctx, P, alpha(P, 0.53), alpha(P, 0.27)),
          backgroundColor: (ctx: ScriptableLineSegmentContext) =>
            segBorder(ctx, alpha(P, 0.09), alpha(P, 0.05), alpha(P, 0.03)),
        },
      },
      {
        type: 'line' as const,
        label: 'Spot price',
        data: spotData,
        borderColor: alpha(P, 0.4),
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'y',
        fill: false,
        order: 2,
        segment: {
          borderColor: (ctx: ScriptableLineSegmentContext) =>
            segBorder(ctx, alpha(P, 0.73), alpha(P, 0.4), alpha(P, 0.2)),
          borderDash: (ctx: ScriptableLineSegmentContext) => (slotSources[ctx.p0DataIndex] ? [] : [2, 3]),
        },
      },
      {
        type: 'line' as const,
        label: 'Transfer fee',
        data: transferData,
        borderColor: theme.palette.text.secondary,
        borderWidth: 1,
        pointRadius: 0,
        tension: 0,
        stepped: 'before' as const,
        yAxisID: 'y',
        fill: false,
        order: 3,
        borderDash: [4, 3],
      },
      ...(solarEnabled
        ? [
            {
              type: 'line' as const,
              label: 'Solar output',
              data: solarKw,
              borderColor: alpha(S, 0.8),
              backgroundColor: alpha(S, 0.09),
              borderWidth: 1.5,
              pointRadius: 0,
              tension: 0.4,
              yAxisID: 'y2',
              fill: true,
              order: 3,
            },
          ]
        : []),
    ],
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        filter: item => item.dataIndex < slots.length,
        callbacks: {
          title: ctx => ctx[0]?.label ?? '',
          label: ctx => {
            const l = ctx.dataset.label ?? ''
            const v = ctx.parsed.y ?? 0
            const src = slotSources[ctx.dataIndex] ? 'actual' : 'forecast'
            if (l === 'Net cost') return ` Net cost: ${v.toFixed(2)} c/kWh`
            if (l === 'Spot price') return ` Spot (${src}): ${v.toFixed(2)} c/kWh`
            if (l === 'Transfer fee') return ` Transfer: ${v.toFixed(2)} c/kWh`
            if (l === 'Solar output') return ` Solar: ${v.toFixed(2)} kW`
            return ''
          },
        },
      },
    },
    scales: {
      x: {
        offset: false,
        ticks: {
          color: tickColor,
          font: { size: 10, family: 'monospace' },
          maxRotation: 0,
          autoSkip: false,
          // returning null hides the tick and its gridline — only hour-start ticks show
          callback: (_v, i) => (tickShow[i] ? labels[i] : null),
        },
        grid: { color: gridColor, offset: false },
      },
      y: {
        position: 'left',
        title: { display: true, text: 'c/kWh', color: tickColor, font: { size: 10 } },
        ticks: { color: tickColor, font: { size: 10, family: 'monospace' } },
        grid: { color: gridColor },
        min: minY,
        max: maxY,
      },
      y2: {
        display: solarEnabled,
        position: 'right',
        title: { display: true, text: 'kW', color: alpha(S, 0.8), font: { size: 10 } },
        ticks: { color: alpha(S, 0.7), font: { size: 10, family: 'monospace' } },
        grid: { drawOnChartArea: false },
        min: 0,
        max: maxY2,
      },
    },
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
          Price &amp; optimal window
        </Typography>

        <Box sx={{ position: 'relative', height: 200, touchAction: 'pan-y' }}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Chart type="line" data={data as any} options={options} plugins={[bgShadePlugin, nowLinePlugin]} />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
          {[
            { color: P, label: 'Net cost (c/kWh)' },
            { color: alpha(P, 0.73), label: 'Spot actual (c/kWh)' },
            { color: alpha(P, 0.35), label: 'Spot forecast (c/kWh)' },
            { color: theme.palette.text.secondary, label: 'Transfer fee (c/kWh)' },
            ...(solarEnabled ? [{ color: alpha(S, 0.8), label: 'Solar output (kW)' }] : []),
            { color: alpha(S, 0.25), label: 'Selected window', border: true },
            { color: nightBg, label: 'Night rate', border: true },
          ].map(({ color, label, border }) => (
            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.625 }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: 0.25,
                  bgcolor: color,
                  flexShrink: 0,
                  ...(border && { border: '1px solid', borderColor: 'divider' }),
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  )
})
