import { lsGet, lsSet, LS_SPOT, LS_SPOT_ACTUAL, localDateStr } from './storage'
import { ALV, SLOT_MS, slotTs } from './optimization'
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
  PriceNoTax: number
}

// the prediction is hourly — expand each point into four flat 15-min slots
function parsePredict(raw: [number, number][]): PriceEntry[] {
  return raw
    .flatMap(([ms, spotCent]) => {
      const hourMs = Math.floor(ms / 3_600_000) * 3_600_000
      return [0, 1, 2, 3].map(q => {
        const dt = new Date(hourMs + q * SLOT_MS)
        return { dt, spotCent, hour: dt.getHours(), ts: slotTs(dt), source: 'predicted' as const }
      })
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
    const lastSlotActive = lastDt.getTime() + SLOT_MS > Date.now() // last slot not yet fully elapsed
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

  // spot-hinta.fi returns 15-min slots — keep them as-is, dedupe by slot key
  const slotMap = new Map<string, PriceEntry>()
  raw
    .filter(d => d.DateTime != null)
    .forEach(d => {
      const dt = new Date(Math.floor(new Date(d.DateTime).getTime() / SLOT_MS) * SLOT_MS)
      const ts = slotTs(dt)
      // apply VAT to the untaxed price ourselves — the API's PriceWithTax is pre-rounded
      // to 5 decimals, which can flip the displayed 2-decimal price (4.684915 → 4.69)
      slotMap.set(ts, { dt, spotCent: d.PriceNoTax * 100 * ALV, hour: dt.getHours(), ts, source: 'actual' })
    })

  const data = [...slotMap.values()].sort((a, b) => a.dt.getTime() - b.dt.getTime())

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

let prewarmed: Promise<FetchPricesResult> | null = null

// kick off the price round-trip before React mounts so the network overlaps with bundle
// parse/execute; the first fetchPrices() reuses it instead of starting a fresh request
export function prewarmPrices(): void {
  prewarmed ??= runFetchPrices()
}

export function fetchPrices(): Promise<FetchPricesResult> {
  const p = prewarmed ?? runFetchPrices()
  prewarmed = null
  return p
}

async function runFetchPrices(): Promise<FetchPricesResult> {
  const [actualResult, predictResult] = await Promise.allSettled([fetchActualSpot(), fetchPredict()])

  const actual = actualResult.status === 'fulfilled' ? actualResult.value : []
  const predicted = predictResult.status === 'fulfilled' ? predictResult.value : []

  if (!actual.length && !predicted.length) throw new Error('No data from either source')

  const merged = new Map<string, PriceEntry>()
  predicted.forEach(d => merged.set(d.ts, d))
  actual.forEach(d => merged.set(d.ts, d))

  const priceData = [...merged.values()].sort((a, b) => a.dt.getTime() - b.dt.getTime())
  const hActual = Math.round(priceData.filter(d => d.source === 'actual').length / 4)
  const hPredict = Math.round(priceData.filter(d => d.source === 'predicted').length / 4)
  const last = priceData[priceData.length - 1].dt

  return {
    priceData,
    statusText: `${hActual} h spot · ${hPredict} h forecast (until ${last.toLocaleDateString('en-GB')})`,
  }
}
