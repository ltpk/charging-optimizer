import { memo, useRef, useMemo, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Button, FormControlLabel, Popover, Switch } from '@mui/material'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
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
import { isNightHour, getTransfer, SLOT_MS } from '../utils/optimization'
import type { SlotEntry, Params } from '../types'
import { fmtNum, fmtTime } from './PlanCard'
import { panelSx } from './Controls'
import { MONO, overline } from '../theme'
import { lsGet, lsSet, LS_CHART_LAYERS } from '../utils/storage'

ChartJS.register(CategoryScale, LinearScale, LineElement, LineController, PointElement, Tooltip, Filler)

type Layer = 'spot' | 'transfer' | 'solar' | 'night'
const DEFAULT_LAYERS: Record<Layer, boolean> = { spot: false, transfer: false, solar: true, night: false }

interface Props {
  slots: SlotEntry[]
  selectedTs: Set<string>
  nowIdx: number
  slotSources: boolean[]
  completionTime: Date | null
  horizonH: number
  params: Params
  /** < 760 px: shorter chart in a horizontal scroller */
  narrow: boolean
}

const fmtDate = (dt: Date) => dt.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })

// one rule for every price line: solid = actual, dashed = forecast, faded = past
export const PriceChart = memo(function PriceChart({
  slots,
  selectedTs,
  nowIdx,
  slotSources,
  completionTime,
  horizonH,
  params,
  narrow,
}: Props) {
  const theme = useTheme()
  const t = theme.palette.ev
  const isDark = theme.palette.mode === 'dark'

  const [layers, setLayers] = useState<Record<Layer, boolean>>(() => ({
    ...DEFAULT_LAYERS,
    ...lsGet<Partial<Record<Layer, boolean>>>(LS_CHART_LAYERS),
  }))
  const setLayer = (k: Layer, v: boolean) => {
    const next = { ...layers, [k]: v }
    setLayers(next)
    lsSet(LS_CHART_LAYERS, next)
  }
  const [layersAnchor, setLayersAnchor] = useState<HTMLElement | null>(null)

  // layers that can't apply to the current setup are disabled, not just hidden
  const avail: Record<Layer, boolean> = {
    spot: true,
    transfer: params.transferEnabled,
    solar: params.solarEnabled,
    night: params.transferEnabled && !params.transferFixed,
  }
  const on = (k: Layer) => layers[k] && avail[k]

  const nowMs = Date.now()
  // ticks mark slot starts; the now-line sits at the elapsed fraction of the current slot
  const nowPos = nowIdx >= 0 ? nowIdx + Math.min(Math.max((nowMs - slots[nowIdx].dt.getTime()) / SLOT_MS, 0), 1) : -1
  // minutes of charging per slot: the current slot starts at now, the last ends at completion
  const doneMs = completionTime?.getTime() ?? Infinity
  const selMin = slots.map(h => {
    if (!selectedTs.has(h.ts)) return 0
    const start = Math.max(h.dt.getTime(), nowMs)
    const end = Math.min(h.dt.getTime() + SLOT_MS, doneMs)
    return Math.max(0, (end - start) / 60_000)
  })

  // plugins are memoized once and read the latest values from this ref (no stale closures)
  const drawRef = useRef({
    t,
    isDark,
    nowPos,
    netNow: 0,
    selFrom: [] as number[],
    selTo: [] as number[],
    hourStart: [] as boolean[],
    midnight: [] as boolean[],
    night: [] as boolean[],
    time: [] as string[],
    solar: false,
  })
  drawRef.current = {
    t,
    isDark,
    nowPos,
    netNow: nowIdx >= 0 ? slots[nowIdx].netCost : 0,
    // selected span of each slot in slot units (partial first/last slot drawn at its fraction)
    selFrom: slots.map((h, i) => (selMin[i] > 0 ? i + Math.max(0, nowMs - h.dt.getTime()) / SLOT_MS : -1)),
    selTo: slots.map((h, i) =>
      selMin[i] > 0 ? i + Math.min(1, (Math.min(doneMs, h.dt.getTime() + SLOT_MS) - h.dt.getTime()) / SLOT_MS) : -1,
    ),
    hourStart: slots.map(h => h.dt.getMinutes() === 0),
    midnight: slots.map(h => h.dt.getHours() === 0 && h.dt.getMinutes() === 0),
    night: slots.map(h => on('night') && isNightHour(h.hour)),
    time: slots.map(h => fmtTime(h.dt)),
    solar: on('solar'),
  }

  const bgPlugin = useMemo<Plugin<'line'>>(
    () => ({
      id: 'bgShade',
      beforeDatasetsDraw(chart) {
        const { t, isDark, selFrom, selTo, hourStart, midnight, night, time, solar } = drawRef.current
        const { ctx, chartArea: a, scales } = chart
        const x = (v: number) => Math.min(Math.max(scales['x'].getPixelForValue(v), a.left), a.right)
        const h = a.bottom - a.top
        ctx.save()

        // axis units above each y axis
        ctx.font = `9.5px ${MONO}`
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = t.micro
        ctx.textAlign = 'left'
        ctx.fillText('c/kWh', scales['y'].left, a.top - 10)
        if (solar) {
          ctx.fillStyle = t.solar
          ctx.textAlign = 'left'
          ctx.fillText('kW', a.right + 6, a.top - 10)
        }
        ctx.textAlign = 'left'

        // night rate: merge contiguous slots into single rects (avoids hairline seams)
        ctx.fillStyle = t.nightBg
        for (let i = 0, start = -1; i <= night.length; i++) {
          if (i < night.length && night[i]) {
            if (start < 0) start = i
          } else if (start >= 0) {
            ctx.fillRect(x(start), a.top, x(i) - x(start), h)
            start = -1
          }
        }

        // midnight rules
        ctx.fillStyle = t.line
        midnight.forEach((m, i) => m && ctx.fillRect(Math.round(x(i)), a.top, 1, h))

        // charging window: 1 px gaps at hour boundaries inside the run, flush outer edges, 3 px cap on top
        for (let i = 0; i < selFrom.length; i++) {
          if (selFrom[i] < 0) continue
          const l = x(selFrom[i]) + (selFrom[i - 1] >= 0 && hourStart[i] ? 0.5 : 0)
          const r = x(selTo[i]) - (selFrom[i + 1] >= 0 && hourStart[i + 1] ? 0.5 : 0)
          if (r <= l) continue
          ctx.fillStyle = alpha(t.go, isDark ? 0.16 : 0.13)
          ctx.fillRect(l, a.top, r - l, h)
          ctx.fillStyle = t.go
          ctx.fillRect(x(selFrom[i]), a.top - 3, x(selTo[i]) - x(selFrom[i]), 3)
        }
        // start time above the block (always one contiguous window)
        const first = selFrom.findIndex(v => v >= 0)
        if (first >= 0) {
          ctx.font = `600 10.5px ${MONO}`
          ctx.fillStyle = t.go
          const w = ctx.measureText(time[first]).width
          ctx.fillText(time[first], Math.min(x(selFrom[first]), a.right - w), a.top - 8)
        }
        ctx.restore()
      },
      // now marker carries the current price: dashed line, dot on the net-cost line, pill label
      afterDatasetsDraw(chart) {
        const { t, nowPos, netNow } = drawRef.current
        if (nowPos < 0) return
        const { ctx, chartArea: a, scales } = chart
        const x = scales['x'].getPixelForValue(nowPos)
        const y = scales['y'].getPixelForValue(netNow)
        ctx.save()
        ctx.globalAlpha = 0.6
        ctx.strokeStyle = t.text
        ctx.lineWidth = 1
        ctx.setLineDash([2, 3])
        ctx.beginPath()
        ctx.moveTo(x, a.top)
        ctx.lineTo(x, a.bottom)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fillStyle = t.text
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = t.panel
        ctx.stroke()
        const label = `now ${fmtNum(netNow)}`
        ctx.font = `600 10.5px ${MONO}`
        const w = ctx.measureText(label).width + 12
        // flip to the left of the line near the right edge
        const lx = x + 7 + w > a.right ? x - 7 - w : x + 7
        const ly = Math.max(y - 22, a.top)
        ctx.fillStyle = t.text
        ctx.beginPath()
        ctx.roundRect(lx, ly, w, 17, 4)
        ctx.fill()
        ctx.fillStyle = t.panel
        ctx.textBaseline = 'middle'
        ctx.fillText(label, lx + 6, ly + 9)
        ctx.restore()
      },
    }),
    [],
  )

  // One extra end-of-window label so the last slot's span has width on the axis
  const dts = slots.map(h => h.dt)
  if (slots.length > 0) dts.push(new Date(slots[slots.length - 1].dt.getTime() + SLOT_MS))
  // hour labels every 3 h (6 h on the long horizon); midnight shows the date instead
  const labelStepH = !narrow && horizonH > 48 ? 6 : 3
  const labels = dts.map(dt => (dt.getHours() === 0 && dt.getMinutes() === 0 ? fmtDate(dt) : fmtTime(dt)))
  const tickShow = dts.map(dt => dt.getMinutes() === 0 && dt.getHours() % labelStepH === 0)
  // vertical gridlines every 3 h, even where the 6 h label step leaves the tick unlabelled
  const gridShow = dts.map(dt => dt.getMinutes() === 0 && dt.getHours() % 3 === 0)

  // on phones the full horizon doesn't fit legibly — fixed ~26 px per hour inside a horizontal scroller
  const chartMinWidth = narrow ? Math.round((dts.length / 4) * 26) : undefined
  const scrollRef = useRef<HTMLDivElement>(null)
  const dtsLen = dts.length
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !narrow || nowPos < 0) return
    // keep ~40 px of past context visible left of the now-line
    el.scrollLeft = Math.max((nowPos / Math.max(dtsLen - 1, 1)) * el.scrollWidth - 40, 0)
    // scroll only when the layout mode or horizon changes — not on data refreshes, which
    // would yank the position while the user is panning
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrow, horizonH])

  // keep raw values — rounding here and again in the tooltip can disagree on .xx5 prices
  const netCostData = slots.map(h => h.netCost)
  const spotData = slots.map(h => h.spotCent)
  const transferData = slots.map(h => getTransfer(params, h.hour))
  // solar slots repeat their hour's average — interpolate between hour centers so the
  // curve reads as the smooth daily profile instead of an hourly staircase
  const hourAvgW = new Map<string, number>()
  slots.forEach(h => hourAvgW.set(h.ts.slice(0, 13), h.solarW))
  const solarKw = slots.map(h => {
    const hourStartMs = Math.floor(h.dt.getTime() / 3_600_000) * 3_600_000
    const offsetH = (h.dt.getTime() + SLOT_MS / 2 - (hourStartMs + 1_800_000)) / 3_600_000 // slot center vs hour center
    const nbKey = new Date(hourStartMs + Math.sign(offsetH) * 3_600_000).toISOString().slice(0, 13)
    const nb = hourAvgW.get(nbKey) ?? h.solarW
    const w = Math.abs(offsetH)
    return +(((1 - w) * h.solarW + w * nb) / 1000).toFixed(3)
  })
  // Hold each line's last value through to the end-of-window tick so the final slot is covered
  for (const arr of [netCostData, spotData, transferData, solarKw]) {
    if (arr.length > 0) arr.push(arr[arr.length - 1])
  }
  const shown = [...netCostData, ...(on('spot') ? spotData : []), ...(on('transfer') ? transferData : [])]
  const rawMax = Math.max(...shown, 1)
  const step = rawMax > 30 ? 10 : 5
  const maxY = Math.ceil((rawMax * 1.08) / step) * step
  const minY = Math.floor(Math.min(0, ...shown) / step) * step
  const maxY2 = Math.max(...solarKw, 1) * 1.4

  // past → faded, forecast → dashed, actual → solid
  const segColor = (color: string) => (ctx: ScriptableLineSegmentContext) =>
    nowIdx >= 0 && ctx.p0DataIndex < nowIdx ? alpha(color, 0.35) : color
  const segDash = (ctx: ScriptableLineSegmentContext) => (slotSources[ctx.p0DataIndex] ? undefined : [5, 4])

  const data = {
    labels,
    datasets: [
      {
        label: 'Net cost',
        data: netCostData,
        borderColor: t.text,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3.5,
        pointHoverBackgroundColor: t.text,
        pointHoverBorderColor: t.panel,
        pointHoverBorderWidth: 1.5,
        // prices are constant within a slot — step instead of smoothing through the jumps
        stepped: 'before' as const,
        yAxisID: 'y',
        order: 1,
        segment: { borderColor: segColor(t.text), borderDash: segDash },
      },
      ...(on('spot')
        ? [
            {
              label: 'Spot',
              data: spotData,
              borderColor: t.muted,
              borderWidth: 1.2,
              pointRadius: 0,
              pointHoverRadius: 0,
              stepped: 'before' as const,
              yAxisID: 'y',
              order: 2,
              segment: { borderColor: segColor(t.muted), borderDash: segDash },
            },
          ]
        : []),
      ...(on('transfer')
        ? [
            {
              label: 'Transfer',
              data: transferData,
              borderWidth: 0,
              backgroundColor: alpha(t.text, isDark ? 0.07 : 0.06),
              pointRadius: 0,
              pointHoverRadius: 0,
              stepped: 'before' as const,
              fill: 'origin' as const,
              yAxisID: 'y',
              order: 4,
            },
          ]
        : []),
      ...(on('solar')
        ? [
            {
              label: 'Solar',
              data: solarKw,
              borderColor: t.solar,
              backgroundColor: alpha(t.solar, 0.12),
              borderWidth: 1.5,
              pointRadius: 0,
              pointHoverRadius: 0,
              tension: 0.4,
              fill: 'origin' as const,
              yAxisID: 'y2',
              order: 3,
            },
          ]
        : []),
    ],
  }

  const pad = (k: string) => k.padEnd(13)
  const tickFont = { family: MONO, size: 10 }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    // decimal comma on axis ticks
    locale: 'fi-FI',
    // headroom above the plot for the axis units, window cap and start time
    layout: { padding: { top: 26 } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        // one tooltip per slot, built from the net-cost item
        filter: item => item.datasetIndex === 0 && item.dataIndex < slots.length,
        backgroundColor: t.panel,
        borderColor: t.line,
        borderWidth: 1,
        cornerRadius: 8,
        padding: { x: 10, y: 8 },
        titleColor: t.text,
        bodyColor: t.muted,
        titleFont: { family: MONO, size: 11, weight: 600 },
        bodyFont: { family: MONO, size: 11 },
        displayColors: false,
        callbacks: {
          title: ([item]) => {
            const s = slots[item.dataIndex]
            return `${fmtDate(s.dt)} ${fmtTime(s.dt)} · ${slotSources[item.dataIndex] ? 'actual' : 'forecast'}`
          },
          label: item => {
            const i = item.dataIndex
            const s = slots[i]
            const rows = [`${pad('net')}${fmtNum(s.netCost)} c`, `${pad('spot')}${fmtNum(s.spotCent)} c`]
            if (params.transferEnabled) rows.push(`${pad('transfer+tax')}${fmtNum(transferData[i])} c`)
            if (on('solar')) rows.push(`${pad('solar')}${fmtNum(solarKw[i])} kW`)
            if (selMin[i] > 0) rows.push(`${pad('charging')}${Math.round(selMin[i])} min`)
            return rows
          },
        },
      },
    },
    scales: {
      x: {
        offset: false,
        ticks: {
          color: t.micro,
          font: tickFont,
          maxRotation: 0,
          autoSkip: false,
          // null hides the tick and its gridline; '' keeps the gridline without a label
          callback: (_v, i) => (tickShow[i] ? labels[i] : gridShow[i] ? '' : null),
        },
        grid: { color: t.grid, offset: false },
        border: { color: t.grid },
      },
      y: {
        position: 'left',
        ticks: { color: t.micro, font: tickFont, stepSize: step },
        grid: { color: t.grid },
        border: { display: false },
        min: minY,
        max: maxY,
      },
      y2: {
        display: on('solar'),
        position: 'right',
        ticks: { color: t.solar, font: tickFont, maxTicksLimit: 3, precision: 0 },
        grid: { drawOnChartArea: false },
        border: { display: false },
        min: 0,
        max: maxY2,
      },
    },
  }

  const legend = (label: string, swatch: ReactNode) => (
    <Box
      key={label}
      component="span"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        fontFamily: MONO,
        fontSize: 11.5,
        fontWeight: 500,
        color: 'text.secondary',
      }}
    >
      {swatch}
      {label}
    </Box>
  )
  const line = (color: string, style = 'solid') => (
    <Box component="i" sx={{ width: 16, borderTop: `2px ${style} ${color}` }} />
  )

  return (
    <Box component="section" sx={{ ...panelSx, pb: 1.25 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.25,
          mb: 1.25,
        }}
      >
        <Box component="span" sx={overline}>
          Price &amp; charging window · next {horizonH} h
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, flexWrap: 'wrap' }}>
          {legend('actual', line(t.text))}
          {legend('forecast', line(t.text, 'dashed'))}
          {legend(
            'charging',
            <Box component="i" sx={{ width: 10, height: 10, bgcolor: alpha(t.go, 0.5), borderRadius: '2px' }} />,
          )}
          {on('solar') && legend('solar kW', line(t.solar))}
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            endIcon={<ArrowDropDownIcon />}
            onClick={e => setLayersAnchor(e.currentTarget)}
            aria-haspopup="true"
            sx={{
              borderColor: 'divider',
              minHeight: 28,
              py: 0.25,
              pl: 1.25,
              pr: 0.75,
              fontSize: 12,
              '& .MuiButton-endIcon': { ml: 0 },
            }}
          >
            Layers
          </Button>
          {/* Popover closes on outside click / Esc */}
          <Popover
            open={!!layersAnchor}
            anchorEl={layersAnchor}
            onClose={() => setLayersAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 0.75,
                  minWidth: 190,
                  p: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.25,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: '10px',
                  boxShadow: t.shadow,
                },
              },
            }}
          >
            {(
              [
                ['spot', 'Spot price'],
                ['transfer', 'Transfer + tax'],
                ['solar', 'Solar output'],
                ['night', 'Night rate'],
              ] as const
            ).map(([k, label]) => (
              <FormControlLabel
                key={k}
                disabled={!avail[k]}
                control={<Switch checked={on(k)} onChange={e => setLayer(k, e.target.checked)} />}
                label={label}
              />
            ))}
          </Popover>
        </Box>
      </Box>

      <Box ref={scrollRef} sx={{ overflowX: narrow ? 'auto' : 'hidden' }}>
        <Box
          sx={{
            position: 'relative',
            height: narrow ? 260 : 380,
            // allow horizontal panning of the scroller on the narrow layout
            touchAction: narrow ? 'pan-x pan-y' : 'pan-y',
            minWidth: chartMinWidth,
          }}
        >
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Chart type="line" data={data as any} options={options} plugins={[bgPlugin]} />
        </Box>
      </Box>
    </Box>
  )
})
