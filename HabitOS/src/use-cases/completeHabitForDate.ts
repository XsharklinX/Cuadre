import { assertCompletionMatchesLocalDate } from "@/domain/completionGuards";
import type { CompletionSource, LogicalDate } from "@/domain/types";
import type { HabitRepository } from "@/repositories/habitRepository";

export interface CompleteHabitForDateInput {
  habitId: string;
  logicalDate: LogicalDate;
  completedAtUtc: string;
  timeZone: string;
  source: CompletionSource;
}

export async function completeHabitForDate(
  repository: HabitRepository,
  input: CompleteHabitForDateInput,
) {
  assertCompletionMatchesLocalDate(input.logicalDate, input.completedAtUtc, input.timeZone);
  return repository.completeHabit(input);
}
