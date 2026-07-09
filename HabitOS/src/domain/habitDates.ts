import { toLogicalDate } from "@/dates/logicalDate";
import type { Habit, LogicalDate } from "@/domain/types";

/** A habit's `createdAt`/`archivedAt` are UTC instants. Comparing their raw
 * `YYYY-MM-DD` slice against a local logical date is wrong near midnight UTC:
 * a habit created at 10pm in a UTC-4 timezone already has a UTC date one day
 * ahead, so it would look "created tomorrow" and be hidden from today's due
 * list. Always resolve through the habit's own reference time zone instead. */
export function habitCreatedDate(habit: Habit): LogicalDate {
  return toLogicalDate(habit.createdAt, habit.referenceTimeZone);
}

export function habitArchivedDate(habit: Habit): LogicalDate | undefined {
  return habit.archivedAt ? toLogicalDate(habit.archivedAt, habit.referenceTimeZone) : undefined;
}
