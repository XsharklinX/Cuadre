import { Temporal } from "@js-temporal/polyfill";

import type { IanaTimeZone, IsoUtcTimestamp, LogicalDate, Weekday } from "@/domain/types";

export function toLogicalDate(timestampUtc: IsoUtcTimestamp, timeZone: IanaTimeZone): LogicalDate {
  const instant = Temporal.Instant.from(timestampUtc);
  const zoned = instant.toZonedDateTimeISO(timeZone);
  return zoned.toPlainDate().toString() as LogicalDate;
}

export function todayLogicalDate(timeZone: IanaTimeZone, now: Date = new Date()): LogicalDate {
  return toLogicalDate(now.toISOString(), timeZone);
}

export function parseLogicalDate(date: LogicalDate): Temporal.PlainDate {
  return Temporal.PlainDate.from(date);
}

export function addDays(date: LogicalDate, days: number): LogicalDate {
  return parseLogicalDate(date).add({ days }).toString() as LogicalDate;
}

export function compareLogicalDates(left: LogicalDate, right: LogicalDate): number {
  return Temporal.PlainDate.compare(parseLogicalDate(left), parseLogicalDate(right));
}

export function weekdayOf(date: LogicalDate): Weekday {
  return parseLogicalDate(date).dayOfWeek as Weekday;
}

export function startOfWeek(date: LogicalDate, weekStartsOn: Weekday): LogicalDate {
  let cursor = parseLogicalDate(date);
  while (cursor.dayOfWeek !== weekStartsOn) {
    cursor = cursor.subtract({ days: 1 });
  }
  return cursor.toString() as LogicalDate;
}

export function endOfWeek(date: LogicalDate, weekStartsOn: Weekday): LogicalDate {
  return parseLogicalDate(startOfWeek(date, weekStartsOn)).add({ days: 6 }).toString() as LogicalDate;
}

export function startOfMonth(date: LogicalDate): LogicalDate {
  const parsed = parseLogicalDate(date);
  return Temporal.PlainDate.from({ year: parsed.year, month: parsed.month, day: 1 }).toString() as LogicalDate;
}

export function endOfMonth(date: LogicalDate): LogicalDate {
  return parseLogicalDate(startOfMonth(date)).add({ months: 1 }).subtract({ days: 1 }).toString() as LogicalDate;
}

export function previousPeriod(
  start: LogicalDate,
  end: LogicalDate,
): { start: LogicalDate; end: LogicalDate } {
  const days = parseLogicalDate(start).until(parseLogicalDate(end)).days + 1;
  const previousEnd = addDays(start, -1);
  return {
    start: addDays(previousEnd, -(days - 1)),
    end: previousEnd,
  };
}

export function datesBetweenInclusive(start: LogicalDate, end: LogicalDate): LogicalDate[] {
  const dates: LogicalDate[] = [];
  let cursor = parseLogicalDate(start);
  const finalDate = parseLogicalDate(end);

  while (Temporal.PlainDate.compare(cursor, finalDate) <= 0) {
    dates.push(cursor.toString() as LogicalDate);
    cursor = cursor.add({ days: 1 });
  }

  return dates;
}
