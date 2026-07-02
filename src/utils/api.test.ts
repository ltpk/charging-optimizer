import { describe, expect, test } from 'bun:test'
import { awaitingDayAhead } from './api'
import type { PriceEntry } from '../types'

function entry(dt: Date, source: 'actual' | 'predicted'): PriceEntry {
  return { dt, spotCent: 5, hour: dt.getHours(), ts: dt.toISOString().slice(0, 16), source }
}

describe('awaitingDayAhead', () => {
  // "now" is local Wed 2026-06-10; day-ahead prices land ~14:00
  const at = (h: number, m = 0) => new Date(2026, 5, 10, h, m)
  const todayOnly = [entry(new Date(2026, 5, 10, 23, 45), 'actual'), entry(new Date(2026, 5, 11, 10, 0), 'predicted')]
  const withTomorrow = [...todayOnly, entry(new Date(2026, 5, 11, 10, 0), 'actual')]

  test("true inside the publication window while tomorrow's actual prices are missing", () => {
    expect(awaitingDayAhead(todayOnly, at(13))).toBe(true)
    expect(awaitingDayAhead(todayOnly, at(14))).toBe(true)
    expect(awaitingDayAhead(todayOnly, at(15, 59))).toBe(true)
  })

  test('false outside the window even when tomorrow is missing', () => {
    expect(awaitingDayAhead(todayOnly, at(12, 59))).toBe(false)
    expect(awaitingDayAhead(todayOnly, at(16))).toBe(false)
  })

  test("false once tomorrow's actual prices are in", () => {
    expect(awaitingDayAhead(withTomorrow, at(14))).toBe(false)
  })

  test('predicted entries for tomorrow do not count as published', () => {
    const predictedOnly = [entry(new Date(2026, 5, 11, 10, 0), 'predicted')]
    expect(awaitingDayAhead(predictedOnly, at(14))).toBe(true)
  })
})
