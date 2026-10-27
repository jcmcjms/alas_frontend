import { describe, expect, it } from "vitest"

import {
  daysUntil,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDeadline,
  formatElapsed,
  formatNumber,
  formatRelative,
  roundToDenomination,
} from "./format"

describe("formatCurrency", () => {
  it("formats PHP with two decimals", () => {
    expect(formatCurrency(150_000)).toMatch(/150,000\.00/)
    expect(formatCurrency(150_000)).toContain("₱")
  })

  it("prints real zeros as zeros and missing values as a dash", () => {
    expect(formatCurrency(0)).toMatch(/0\.00/)
    expect(formatCurrency(null)).toBe("—")
    expect(formatCurrency(undefined)).toBe("—")
  })
})

describe("formatNumber", () => {
  it("separates thousands", () => {
    expect(formatNumber(1234567)).toBe("1,234,567")
    expect(formatNumber(null)).toBe("—")
  })
})

describe("formatDate / formatDateTime", () => {
  it("renders ISO-style dates for comparable columns", () => {
    expect(formatDate("2026-03-05T14:00:00Z")).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(formatDate(null)).toBe("—")
    expect(formatDate("not-a-date")).toBe("—")
  })

  it("appends local time for detail views", () => {
    expect(formatDateTime("2026-03-05T14:32:00")).toBe("2026-03-05 14:32")
  })
})

describe("formatRelative", () => {
  const now = new Date("2026-10-27T12:00:00Z")
  it("uses recency words", () => {
    expect(formatRelative("2026-10-27T11:59:40Z", now)).toBe("just now")
    expect(formatRelative("2026-10-27T11:30:00Z", now)).toBe("30 min ago")
    expect(formatRelative("2026-10-27T06:00:00Z", now)).toBe("6 h ago")
    expect(formatRelative("2026-10-26T12:00:00Z", now)).toBe("yesterday")
    expect(formatRelative("2026-10-21T12:00:00Z", now)).toBe("6 days ago")
  })
})

describe("formatElapsed", () => {
  it("renders durations compactly", () => {
    expect(formatElapsed(30_000)).toBe("<1 m")
    expect(formatElapsed(45 * 60_000)).toBe("45 m")
    expect(formatElapsed(2 * 3_600_000 + 15 * 60_000)).toBe("2 h 15 m")
    expect(formatElapsed(3 * 86_400_000 + 5 * 3_600_000)).toBe("3 d 5 h")
    expect(formatElapsed(-1)).toBe("—")
  })
})

describe("disbursement deadline maths", () => {
  const now = new Date("2026-10-27T12:00:00Z")

  it("counts whole days until the deadline", () => {
    expect(daysUntil("2026-10-30T12:00:00Z", now)).toBe(3)
    expect(daysUntil("2026-10-24T12:00:00Z", now)).toBe(-3)
    expect(daysUntil(null, now)).toBeNull()
  })

  it("words the deadline with its baseline", () => {
    expect(formatDeadline("2026-11-05T12:00:00Z", now)).toBe("9 days left")
    expect(formatDeadline("2026-10-28T12:00:00Z", now)).toBe("1 day left")
    expect(formatDeadline("2026-10-27T12:00:00Z", now)).toBe("due today")
    expect(formatDeadline("2026-10-23T12:00:00Z", now)).toBe("4 days overdue")
    expect(formatDeadline(null, now)).toBe("—")
  })
})

describe("roundToDenomination", () => {
  it("floors to whole hundreds of pesos", () => {
    expect(roundToDenomination(12_345)).toBe(12_300)
    expect(roundToDenomination(99)).toBe(0)
    expect(roundToDenomination(-5)).toBe(0)
  })
})
