import { toLogicalDate } from "@/dates/logicalDate";
import type { IanaTimeZone, IsoUtcTimestamp, LogicalDate } from "@/domain/types";

export function assertCompletionMatchesLocalDate(
  logicalDate: LogicalDate,
  completedAtUtc: IsoUtcTimestamp,
  timeZone: IanaTimeZone,
): void {
  const actualLogicalDate = toLogicalDate(completedAtUtc, timeZone);
  if (actualLogicalDate !== logicalDate) {
    throw new Error(
      `Completion date mismatch: expected ${logicalDate} but ${completedAtUtc} is ${actualLogicalDate} in ${timeZone}`,
    );
  }
}
