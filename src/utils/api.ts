import { lsGet, lsSet, LS_SPOT, LS_SPOT_ACTUAL, localDateStr } from './storage'
import type { PriceEntry } from '../types'

const SPOT_TODAY_URL = 'https://api.spot-hinta.fi/today'
const SPOT_FORWARD_URL = 'https://api.spot-hinta.fi/dayforward'
const PREDICT_URL =
  'https://raw.githubusercontent.com/vividfog/nordpool-predict-fi/refs/heads/main/deploy/prediction.json'

interface StoredEntry extends Omit<PriceEntry, 'dt'> {
  dtIso: string
}
interface SpotHintaRow {
  DateTime: string
  PriceWithTax: number
}

function parsePredict(raw: [number, number][]): PriceEntry[] {
  return raw
    .map(([ms, spotCent]) => {
      const dt = new Date(Math.floor(ms / 3_600_000) * 3_600_000)
      return { dt, spotCent, hour: dt.getHours(), ts: dt.toISOString().slice(0, 13), source: 'predicted' as const }
    })
    .sort((a, b) => a.dt.getTime() - b.dt.getTime())
}

async function fetchActualSpot(): Promise<PriceEntry[]> {
  const cached = lsGet<{ data: StoredEntry[]; fetchedAt: number }>(LS_SPOT_ACTUAL)
  if (cached?.data?.length) {
    const lastDt = new Date(cached.data[cached.data.length - 1].dtIso)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const cacheAge = Date.now() - (cached.fetchedAt ?? 0)
    const hasTomorrow = lastDt >= tomorrow
    const lastSlotActive = lastDt.getTime() + 3_600_000 > Date.now() // last hour not yet fully elapsed
    // keep cache if it covers tomorrow OR was fetched less than 1 h ago
    if ((hasTomorrow || cacheAge < 3_600_000) && lastSlotActive)
      return cached.data.map(d => ({ ...d, dt: new Date(d.dtIso) }))
  }

  const [todayRes, forwardRes] = await Promise.allSettled([
    fetch(SPOT_TODAY_URL)
      .then(r => (r.ok ? (r.json() as Promise<SpotHintaRow[]>) : []))
      .catch(() => [] as SpotHintaRow[]),
    fetch(SPOT_FORWARD_URL)
      .then(r => (r.ok ? (r.json() as Promise<SpotHintaRow[]>) : []))
      .catch(() => [] as SpotHintaRow[]),
  ])

  const raw: SpotHintaRow[] = [
    ...(todayRes.status === 'fulfilled' ? todayRes.value : []),
    ...(forwardRes.status === 'fulfilled' ? forwardRes.value : []),
  ]

  // spot-hinta.fi returns 15-min slots — group into hourly averages
  const hourMap = new Map<string, { dt: Date; total: number; count: number }>()
  raw
    .filter(d => d.DateTime != null)
    .forEach(d => {
      const rawDt = new Date(d.DateTime)
      const dt = new Date(Math.floor(rawDt.getTime() / 3_600_000) * 3_600_000)
      const ts = dt.toISOString().slice(0, 13)
      const entry = hourMap.get(ts)
      if (entry) {
        entry.total += d.PriceWithTax
        entry.count++
      } else hourMap.set(ts, { dt, total: d.PriceWithTax, count: 1 })
    })

  const data: PriceEntry[] = [...hourMap.values()]
    .map(({ dt, total, count }) => ({
      dt,
      spotCent: (total / count) * 100,
      hour: dt.getHours(),
      ts: dt.toISOString().slice(0, 13),
      source: 'actual' as const,
    }))
    .sort((a, b) => a.dt.getTime() - b.dt.getTime())

  lsSet(LS_SPOT_ACTUAL, { fetchedAt: Date.now(), data: data.map(d => ({ ...d, dtIso: d.dt.toISOString() })) })
  return data
}

async function fetchPredict(): Promise<PriceEntry[]> {
  const todayStr = localDateStr()
  const cached = lsGet<{ date: string; fetchedAt: number; data: StoredEntry[] }>(LS_SPOT)
  if (cached?.date === todayStr && Date.now() - cached.fetchedAt < 3_600_000)
    return cached.data.map(d => ({ ...d, dt: new Date(d.dtIso), source: 'predicted' as const }))

  const res = await fetch(PREDICT_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = (await res.json()) as [number, number][]
  if (!raw.length) throw new Error('No data')

  const data = parsePredict(raw)
  lsSet(LS_SPOT, { date: todayStr, fetchedAt: Date.now(), data: data.map(d => ({ ...d, dtIso: d.dt.toISOString() })) })
  return data
}

export interface FetchPricesResult {
  priceData: PriceEntry[]
  statusText: string
}

export async function fetchPrices(): Promise<FetchPricesResult> {
  const [actualResult, predictResult] = await Promise.allSettled([fetchActualSpot(), fetchPredict()])

  const actual = actualResult.status === 'fulfilled' ? actualResult.value : []
  const predicted = predictResult.status === 'fulfilled' ? predictResult.value : []

  if (!actual.length && !predicted.length) throw new Error('No data from either source')

  const merged = new Map<string, PriceEntry>()
  predicted.forEach(d => merged.set(d.ts, d))
  actual.forEach(d => merged.set(d.ts, d))

  const priceData = [...merged.values()].sort((a, b) => a.dt.getTime() - b.dt.getTime())
  const nActual = priceData.filter(d => d.source === 'actual').length
  const nPredict = priceData.filter(d => d.source === 'predicted').length
  const last = priceData[priceData.length - 1].dt

  return {
    priceData,
    statusText: `${nActual} h spot · ${nPredict} h forecast (until ${last.toLocaleDateString('en-GB')})`,
  }
}
