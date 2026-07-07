import {
  addDays,
  compareLogicalDates,
  datesBetweenInclusive,
  endOfMonth,
  startOfMonth,
  startOfWeek,
} from "@/dates/logicalDate";
import { isCompletedOnDate, isHabitDueOnDate } from "@/domain/frequency";
import { calculateHabitAnalytics, type HabitAnalytics } from "@/domain/statistics";
import type { Habit, HabitCompletion, LogicalDate } from "@/domain/types";
import type { HabitRepository } from "@/repositories/habitRepository";

export interface JournalDay {
  date: LogicalDate;
  dueCount: number;
  completedCount: number;
  completionRate: number;
}

export interface JournalHistoryItem {
  completion: HabitCompletion;
  habit: Habit;
}

export interface JournalHabitAnalytics {
  habit: Habit;
  analytics: HabitAnalytics;
  weeklyConsistency: number;
}

export interface JournalModel {
  monthStart: LogicalDate;
  monthEnd: LogicalDate;
  days: JournalDay[];
  weeklyCompletion: Array<{ label: string; completed: number; required: number }>;
  history: JournalHistoryItem[];
  habitAnalytics: JournalHabitAnalytics[];
}

export async function buildJournal(
  repository: HabitRepository,
  selectedMonthDate: LogicalDate,
  today: LogicalDate,
): Promise<JournalModel> {
  const [habits, completions] = await Promise.all([
    repository.listHabits(),
    repository.listCompletions(),
  ]);

  return buildJournalFromData(habits, completions, selectedMonthDate, today);
}

export function buildJournalFromData(
  habits: Habit[],
  completions: HabitCompletion[],
  selectedMonthDate: LogicalDate,
  today: LogicalDate,
): JournalModel {
  const monthStart = startOfMonth(selectedMonthDate);
  const monthEnd = endOfMonth(selectedMonthDate);
  const days = datesBetweenInclusive(monthStart, monthEnd).map((date) =>
    buildJournalDay(habits, completions, date),
  );
  const weeklyCompletion = buildWeeklyCompletion(days);
  const habitById = new Map(habits.map((habit) => [habit.id, habit]));
  const history = completions
    .filter((completion) => compareLogicalDates(completion.logicalDate, monthStart) >= 0)
    .filter((completion) => compareLogicalDates(completion.logicalDate, monthEnd) <= 0)
    .map((completion) => {
      const habit = habitById.get(completion.habitId);
      return habit ? { completion, habit } : undefined;
    })
    .filter((item): item is JournalHistoryItem => Boolean(item))
    .sort((left, right) => right.completion.completedAtUtc.localeCompare(left.completion.completedAtUtc));

  const habitAnalytics = habits.map((habit) => ({
    habit,
    analytics: calculateHabitAnalytics(habit, completions, monthStart, monthEnd, today),
    weeklyConsistency: calculateWeeklyConsistency(habit, completions, monthStart, monthEnd),
  }));

  return {
    monthStart,
    monthEnd,
    days,
    weeklyCompletion,
    history,
    habitAnalytics,
  };
}

function buildWeeklyCompletion(days: JournalDay[]): Array<{ label: string; completed: number; required: number }> {
  const weeks: Array<{ label: string; completed: number; required: number }> = [];
  for (let index = 0; index < days.length; index += 7) {
    const slice = days.slice(index, index + 7);
    const first = slice[0];
    if (!first) {
      continue;
    }
    weeks.push({
      label: first.date.slice(8, 10),
      completed: slice.reduce((sum, day) => sum + day.completedCount, 0),
      required: slice.reduce((sum, day) => sum + day.dueCount, 0),
    });
  }
  return weeks;
}

function buildJournalDay(
  habits: Habit[],
  completions: HabitCompletion[],
  date: LogicalDate,
): JournalDay {
  const dueHabits = habits.filter((habit) => isHabitDueOnDate(habit, date));
  const completedCount = dueHabits.filter((habit) => isCompletedOnDate(completions, habit.id, date)).length;
  return {
    date,
    dueCount: dueHabits.length,
    completedCount,
    completionRate: dueHabits.length === 0 ? 0 : completedCount / dueHabits.length,
  };
}

function calculateWeeklyConsistency(
  habit: Habit,
  completions: HabitCompletion[],
  periodStart: LogicalDate,
  periodEnd: LogicalDate,
): number {
  let weekCount = 0;
  let successfulWeeks = 0;
  let cursor = startOfWeek(periodStart, 1);

  while (compareLogicalDates(cursor, periodEnd) <= 0) {
    const weekDays = datesBetweenInclusive(cursor, periodEnd).slice(0, 7);
    const daysInPeriod = weekDays.filter(
      (date) => compareLogicalDates(date, periodStart) >= 0 && compareLogicalDates(date, periodEnd) <= 0,
    );
    const dueDays = daysInPeriod.filter((date) => isHabitDueOnDate(habit, date));
    if (dueDays.length > 0) {
      weekCount += 1;
      const completedDays = dueDays.filter((date) => isCompletedOnDate(completions, habit.id, date)).length;
      if (completedDays === dueDays.length) {
        successfulWeeks += 1;
      }
    }
    cursor = addDays(cursor, 7);
  }

  return weekCount === 0 ? 0 : successfulWeeks / weekCount;
}
