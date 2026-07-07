import { isCompletedOnDate, isHabitDueOnDate } from "@/domain/frequency";
import type { Habit, HabitCompletion, LogicalDate } from "@/domain/types";
import type { HabitRepository } from "@/repositories/habitRepository";

export interface DailyHabitView {
  habit: Habit;
  isCompleted: boolean;
}

export async function getDailyHabits(
  repository: HabitRepository,
  logicalDate: LogicalDate,
): Promise<DailyHabitView[]> {
  const [habits, completions] = await Promise.all([
    repository.listHabits(),
    repository.listCompletions(),
  ]);

  return selectDailyHabits(habits, completions, logicalDate);
}

export function selectDailyHabits(
  habits: Habit[],
  completions: HabitCompletion[],
  logicalDate: LogicalDate,
): DailyHabitView[] {
  return habits
    .filter((habit) => isHabitDueOnDate(habit, logicalDate))
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((habit) => ({
      habit,
      isCompleted: isCompletedOnDate(completions, habit.id, logicalDate),
    }));
}
