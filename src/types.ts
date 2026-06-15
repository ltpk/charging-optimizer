// one 15-minute price slot; `ts` is the UTC quarter key (YYYY-MM-DDTHH:MM), `hour` the local start hour
export interface PriceEntry {
  dt: Date
  spotCent: number
  hour: number
  ts: string
  source: 'actual' | 'predicted'
}

export interface SlotEntry extends PriceEntry {
  netCost: number
  solarW: number
}

export type SolarData = Record<string, number>

export interface GeoCoords {
  lat: string
  lon: string
}

export interface ApiStatus {
  ok: boolean
  warn: boolean
  text: string
}

export interface Params {
  socNow: number
  socTarget: number
  batteryCapacity: number
  chargingLoss: number // stored as percent (e.g. 11 means 11%)
  chargingPower: number
  consecutive: boolean
  horizonH: number
  chargeByEnabled: boolean
  chargeByHour: number
  chargeByDay: number
  transferEnabled: boolean
  transferFixed: boolean // true: single fixed fee; false: separate day/night fees
  transferFee: number // fixed fee, used when transferFixed
  transferDay: number
  transferNight: number
  buyMargin: number
  sellMargin: number
  solarDec: number
  solarAz: number
  solarKwp: number
  solarEnabled: boolean
}

export interface OptimizeResult {
  slots: SlotEntry[]
  selectedList: SlotEntry[]
  selectedTs: Set<string>
  currentSlot: SlotEntry
  hoursNeeded: number
  achievableHours: number
  kWhNeeded: number
  completionTime: Date | null
  deadlinePassed: boolean
  nHours: number
  totalCost: number
  nowIdx: number
  slotSources: boolean[]
  netCostMin: number
  netCostMax: number
  solarNow: number
  solarPct: number
  solarSavings: number
  avgNetCost: number
}
