import { addDays, compareLogicalDates, datesBetweenInclusive, startOfWeek } from "@/dates/logicalDate";
import {
  getEvaluationPeriod,
  isCompletedOnDate,
  isFrequencySatisfiedForPeriod,
  isHabitDueOnDate,
  previousEvaluationPeriod,
} from "@/domain/frequency";
import { habitCreatedDate } from "@/domain/habitDates";
import type { Habit, HabitCompletion, LogicalDate } from "@/domain/types";

export function calculateCurrentStreak(
  habit: Habit,
  completions: HabitCompletion[],
  today: LogicalDate,
): number {
  if (habit.status === "archived") {
    return 0;
  }

  if (habit.goal.frequency.type === "times_per_week") {
    return calculateWeeklyCurrentStreak(habit, completions, today);
  }

  let streak = 0;
  let cursor = today;
  let isCurrentDay = true;

  while (compareLogicalDates(cursor, habitCreatedDate(habit)) >= 0) {
    if (!isHabitDueOnDate(habit, cursor)) {
      cursor = addDays(cursor, -1);
      isCurrentDay = false;
      continue;
    }

    if (!isCompletedOnDate(completions, habit.id, cursor)) {
      if (isCurrentDay) {
        cursor = addDays(cursor, -1);
        isCurrentDay = false;
        continue;
      }
      break;
    }

    streak += 1;
    cursor = addDays(cursor, -1);
    isCurrentDay = false;
  }

  return streak;
}

export function calculateBestStreak(
  habit: Habit,
  completions: HabitCompletion[],
  throughDate: LogicalDate,
): number {
  if (habit.status === "archived") {
    return 0;
  }

  if (habit.goal.frequency.type === "times_per_week") {
    return calculateWeeklyBestStreak(habit, completions, throughDate);
  }

  const start = habitCreatedDate(habit);
  let best = 0;
  let current = 0;

  for (const date of datesBetweenInclusive(start, throughDate)) {
    if (!isHabitDueOnDate(habit, date)) {
      continue;
    }

    if (isCompletedOnDate(completions, habit.id, date)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return best;
}

function calculateWeeklyCurrentStreak(
  habit: Habit,
  completions: HabitCompletion[],
  today: LogicalDate,
): number {
  const frequency = habit.goal.frequency;
  if (frequency.type !== "times_per_week") {
    return 0;
  }

  let streak = 0;
  let cursorStart = startOfWeek(today, frequency.weekStartsOn);
  const createdDate = habitCreatedDate(habit);
  let isCurrentPeriod = true;

  while (compareLogicalDates(cursorStart, createdDate) >= 0 || isDateInsideWeek(createdDate, cursorStart)) {
    const cursorEnd = addDays(cursorStart, 6);
    if (!isFrequencySatisfiedForPeriod(habit, completions, cursorStart, cursorEnd)) {
      if (isCurrentPeriod) {
        const previous = previousEvaluationPeriod(habit, cursorStart);
        cursorStart = previous.start;
        isCurrentPeriod = false;
        continue;
      }
      break;
    }

    streak += 1;
    const previous = previousEvaluationPeriod(habit, cursorStart);
    cursorStart = previous.start;
    isCurrentPeriod = false;
  }

  return streak;
}

function calculateWeeklyBestStreak(
  habit: Habit,
  completions: HabitCompletion[],
  throughDate: LogicalDate,
): number {
  const frequency = habit.goal.frequency;
  if (frequency.type !== "times_per_week") {
    return 0;
  }

  const createdDate = habitCreatedDate(habit);
  let cursorStart = startOfWeek(createdDate, frequency.weekStartsOn);
  const finalStart = startOfWeek(throughDate, frequency.weekStartsOn);
  let best = 0;
  let current = 0;

  while (compareLogicalDates(cursorStart, finalStart) <= 0) {
    const cursorEnd = addDays(cursorStart, 6);
    if (isFrequencySatisfiedForPeriod(habit, completions, cursorStart, cursorEnd)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
    cursorStart = addDays(cursorStart, 7);
  }

  return best;
}

function isDateInsideWeek(date: LogicalDate, weekStart: LogicalDate): boolean {
  return compareLogicalDates(date, weekStart) >= 0 && compareLogicalDates(date, addDays(weekStart, 6)) <= 0;
}
