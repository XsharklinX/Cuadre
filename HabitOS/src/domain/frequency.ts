import {
  addDays,
  compareLogicalDates,
  datesBetweenInclusive,
  endOfWeek,
  startOfWeek,
  weekdayOf,
} from "@/dates/logicalDate";
import { habitCreatedDate } from "@/domain/habitDates";
import type { Habit, HabitCompletion, LogicalDate } from "@/domain/types";

export function isHabitDueOnDate(habit: Habit, date: LogicalDate): boolean {
  if (habit.status === "archived") {
    return false;
  }

  const createdDate = habitCreatedDate(habit);
  if (compareLogicalDates(date, createdDate) < 0) {
    return false;
  }

  const frequency = habit.goal.frequency;
  if (frequency.type === "daily" || frequency.type === "times_per_week") {
    return true;
  }

  return frequency.weekdays.includes(weekdayOf(date));
}

export function isCompletedOnDate(
  completions: HabitCompletion[],
  habitId: string,
  date: LogicalDate,
): boolean {
  return completions.some((completion) => completion.habitId === habitId && completion.logicalDate === date);
}

export function countCompletionsBetween(
  completions: HabitCompletion[],
  habitId: string,
  start: LogicalDate,
  end: LogicalDate,
): number {
  const uniqueDates = new Set(
    completions
      .filter(
        (completion) =>
      completion.habitId === habitId &&
      compareLogicalDates(completion.logicalDate, start) >= 0 &&
      compareLogicalDates(completion.logicalDate, end) <= 0,
      )
      .map((completion) => completion.logicalDate),
  );

  return uniqueDates.size;
}

export function isFrequencySatisfiedForPeriod(
  habit: Habit,
  completions: HabitCompletion[],
  periodStart: LogicalDate,
  periodEnd: LogicalDate,
): boolean {
  const frequency = habit.goal.frequency;

  if (frequency.type === "times_per_week") {
    const required = requiredCompletionsForPeriod(habit, periodStart, periodEnd);
    return required > 0 && countCompletionsBetween(completions, habit.id, periodStart, periodEnd) >= required;
  }

  return datesBetweenInclusive(periodStart, periodEnd)
    .filter((date) => isHabitDueOnDate(habit, date))
    .every((date) => isCompletedOnDate(completions, habit.id, date));
}

export function requiredCompletionsForPeriod(
  habit: Habit,
  periodStart: LogicalDate,
  periodEnd: LogicalDate,
): number {
  if (habit.status === "archived") {
    return 0;
  }

  const createdDate = habitCreatedDate(habit);
  const effectiveStart = compareLogicalDates(createdDate, periodStart) > 0 ? createdDate : periodStart;
  if (compareLogicalDates(effectiveStart, periodEnd) > 0) {
    return 0;
  }

  const frequency = habit.goal.frequency;
  if (frequency.type === "times_per_week") {
    const eligibleDays = datesBetweenInclusive(effectiveStart, periodEnd).length;
    return Math.min(frequency.targetCount, eligibleDays);
  }

  return datesBetweenInclusive(effectiveStart, periodEnd).filter((date) => isHabitDueOnDate(habit, date)).length;
}

export function previousEvaluationPeriod(
  habit: Habit,
  periodStart: LogicalDate,
): { start: LogicalDate; end: LogicalDate } {
  const frequency = habit.goal.frequency;
  if (frequency.type === "times_per_week") {
    const start = addDays(periodStart, -7);
    return { start, end: addDays(start, 6) };
  }

  const previousDate = addDays(periodStart, -1);
  return { start: previousDate, end: previousDate };
}

export function getEvaluationPeriod(
  habit: Habit,
  date: LogicalDate,
): { start: LogicalDate; end: LogicalDate } {
  const frequency = habit.goal.frequency;
  if (frequency.type === "times_per_week") {
    return {
      start: startOfWeek(date, frequency.weekStartsOn),
      end: endOfWeek(date, frequency.weekStartsOn),
    };
  }

  return { start: date, end: date };
}
