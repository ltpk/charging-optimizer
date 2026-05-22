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

export interface Params {
  socNow: number
  socTarget: number
  batteryCapacity: number
  chargingLoss: number    // stored as percent (e.g. 11 means 11%)
  chargingPower: number
  consecutive: boolean
  horizonH: number
  chargeByEnabled: boolean
  chargeByHour: number
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
  nHours: number
  totalCost: number
  nowIdx: number
  hourSources: boolean[]
  solarNow: number
  avgNetCost: number
}
