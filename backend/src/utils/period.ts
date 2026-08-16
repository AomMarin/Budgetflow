// Calendar-month bookkeeping for the monthly reset/rollover feature.
// All month math is anchored to Asia/Bangkok regardless of server process TZ
// (Render/Neon run UTC) — reports.service.ts historically got this wrong by
// using new Date().getMonth() directly. Do not repeat that here.

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

const BANGKOK_YM_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: 'numeric',
});

export function getBangkokYearMonth(date: Date = new Date()): YearMonth {
  const parts = BANGKOK_YM_FORMATTER.formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  return { year, month };
}

export function nextYearMonth({ year, month }: YearMonth): YearMonth {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

// True when `a` is strictly before `b` on the calendar (not equal).
export function isBeforeYearMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year !== b.year ? a.year < b.year : a.month < b.month;
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, no DST

// [start, end] instants (both inclusive) that bound a Bangkok calendar month,
// expressed as the actual UTC instants — safe to compare directly against
// Transaction.date without depending on the server process's own TZ.
export function bangkokMonthRangeUtc(year: number, month: number): { start: Date; end: Date } {
  const next = nextYearMonth({ year, month });
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - BANGKOK_OFFSET_MS);
  const nextStart = new Date(Date.UTC(next.year, next.month - 1, 1, 0, 0, 0) - BANGKOK_OFFSET_MS);
  const end = new Date(nextStart.getTime() - 1);
  return { start, end };
}
