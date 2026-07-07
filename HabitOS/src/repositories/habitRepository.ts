import type { CompletionSource, Habit, HabitCompletion, HabitDraft, LogicalDate } from "@/domain/types";

export interface CompleteHabitInput {
  habitId: string;
  logicalDate: LogicalDate;
  completedAtUtc: string;
  timeZone: string;
  source: CompletionSource;
}

export interface HabitRepository {
  listHabits(): Promise<Habit[]>;
  listCompletions(): Promise<HabitCompletion[]>;
  createHabit(draft: HabitDraft, nowUtc: string): Promise<Habit>;
  updateHabit(habit: Habit): Promise<Habit>;
  archiveHabit(habitId: string, archivedAtUtc: string): Promise<Habit>;
  completeHabit(input: CompleteHabitInput): Promise<{ completion: HabitCompletion; created: boolean }>;
  undoCompletion(habitId: string, logicalDate: LogicalDate): Promise<boolean>;
}
