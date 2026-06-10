export interface PriceEntry {
  dt: Date
  spotCent: number
  hour: number
  ts: string
  source: 'actual' | 'predicted'
}

export interface HourEntry extends PriceEntry {
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
  hours: HourEntry[]
  selectedList: HourEntry[]
  selectedTs: Set<string>
  currentHour: HourEntry
  hoursNeeded: number
  achievableHours: number
  kWhNeeded: number
  completionTime: Date | null
  deadlinePassed: boolean
  nHours: number
  totalCost: number
  nowIdx: number
  hourSources: boolean[]
  netCostMin: number
  netCostMax: number
  solarNow: number
  solarPct: number
  solarSavings: number
  avgNetCost: number
}
