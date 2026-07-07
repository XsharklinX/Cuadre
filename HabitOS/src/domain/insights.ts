import {
  addDays,
  compareLogicalDates,
  datesBetweenInclusive,
  endOfMonth,
  startOfMonth,
  weekdayOf,
} from "@/dates/logicalDate";
import { isCompletedOnDate, isHabitDueOnDate } from "@/domain/frequency";
import { calculateBestStreak, calculateCurrentStreak } from "@/domain/streaks";
import type { Habit, HabitCompletion, LogicalDate, Weekday } from "@/domain/types";

export interface DayCompletion {
  date: LogicalDate;
  dueCount: number;
  completedCount: number;
  rate: number;
}

export interface WeekdayRanking {
  weekday: Weekday;
  dueCount: number;
  completedCount: number;
  rate: number;
}

export interface MonthlyTrendPoint {
  monthStart: LogicalDate;
  dueCount: number;
  completedCount: number;
  rate: number;
}

export interface HabitComparison {
  habit: Habit;
  windowRate: number;
  currentStreak: number;
  bestStreak: number;
}

/** Treats a habit as due on `date` using the frequency rules that were in effect at the
 * time, ignoring its *current* archived status (archiving must not erase history). */
function wasHabitDueOnDate(habit: Habit, date: LogicalDate): boolean {
  const archivedDate = habit.archivedAt ? (habit.archivedAt.slice(0, 10) as LogicalDate) : undefined;
  if (archivedDate && compareLogicalDates(date, archivedDate) > 0) {
    return false;
  }
  const historicalHabit: Habit = habit.status === "archived" ? { ...habit, status: "active" } : habit;
  return isHabitDueOnDate(historicalHabit, date);
}

function buildDayCompletion(habits: Habit[], completions: HabitCompletion[], date: LogicalDate): DayCompletion {
  const dueHabits = habits.filter((habit) => wasHabitDueOnDate(habit, date));
  const completedCount = dueHabits.filter((habit) => isCompletedOnDate(completions, habit.id, date)).length;
  return {
    date,
    dueCount: dueHabits.length,
    completedCount,
    rate: dueHabits.length === 0 ? 0 : completedCount / dueHabits.length,
  };
}

export function buildYearHeatmap(
  habits: Habit[],
  completions: HabitCompletion[],
  today: LogicalDate,
  days = 365,
): DayCompletion[] {
  const start = addDays(today, -(days - 1));
  return datesBetweenInclusive(start, today).map((date) => buildDayCompletion(habits, completions, date));
}

export function rankWeekdaysByCompletion(
  habits: Habit[],
  completions: HabitCompletion[],
  periodStart: LogicalDate,
  periodEnd: LogicalDate,
): WeekdayRanking[] {
  const totals = new Map<Weekday, { dueCount: number; completedCount: number }>();
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    totals.set(weekday as Weekday, { dueCount: 0, completedCount: 0 });
  }

  for (const date of datesBetweenInclusive(periodStart, periodEnd)) {
    const day = buildDayCompletion(habits, completions, date);
    if (day.dueCount === 0) {
      continue;
    }
    const bucket = totals.get(weekdayOf(date));
    if (!bucket) {
      continue;
    }
    bucket.dueCount += day.dueCount;
    bucket.completedCount += day.completedCount;
  }

  return Array.from(totals.entries())
    .map(([weekday, bucket]) => ({
      weekday,
      dueCount: bucket.dueCount,
      completedCount: bucket.completedCount,
      rate: bucket.dueCount === 0 ? 0 : bucket.completedCount / bucket.dueCount,
    }))
    .sort((left, right) => right.rate - left.rate);
}

export function buildMonthlyTrend(
  habits: Habit[],
  completions: HabitCompletion[],
  today: LogicalDate,
  monthsCount = 6,
): MonthlyTrendPoint[] {
  const points: MonthlyTrendPoint[] = [];
  let cursor = startOfMonth(today);

  for (let index = 0; index < monthsCount; index += 1) {
    const monthStart = cursor;
    const monthEndCandidate = endOfMonth(cursor);
    const monthEnd = compareLogicalDates(monthEndCandidate, today) > 0 ? today : monthEndCandidate;

    let dueCount = 0;
    let completedCount = 0;
    if (compareLogicalDates(monthStart, monthEnd) <= 0) {
      for (const date of datesBetweenInclusive(monthStart, monthEnd)) {
        const day = buildDayCompletion(habits, completions, date);
        dueCount += day.dueCount;
        completedCount += day.completedCount;
      }
    }

    points.unshift({
      monthStart,
      dueCount,
      completedCount,
      rate: dueCount === 0 ? 0 : completedCount / dueCount,
    });

    cursor = addDays(startOfMonth(cursor), -1);
    cursor = startOfMonth(cursor);
  }

  return points;
}

export function compareHabits(
  habits: Habit[],
  completions: HabitCompletion[],
  today: LogicalDate,
  windowDays = 30,
): HabitComparison[] {
  const windowStart = addDays(today, -(windowDays - 1));

  return habits
    .filter((habit) => habit.status === "active")
    .map((habit) => {
      const createdDate = habit.createdAt.slice(0, 10) as LogicalDate;
      const effectiveStart = compareLogicalDates(createdDate, windowStart) > 0 ? createdDate : windowStart;

      let dueCount = 0;
      let completedCount = 0;
      if (compareLogicalDates(effectiveStart, today) <= 0) {
        for (const date of datesBetweenInclusive(effectiveStart, today)) {
          if (!isHabitDueOnDate(habit, date)) {
            continue;
          }
          dueCount += 1;
          if (isCompletedOnDate(completions, habit.id, date)) {
            completedCount += 1;
          }
        }
      }

      return {
        habit,
        windowRate: dueCount === 0 ? 0 : completedCount / dueCount,
        currentStreak: calculateCurrentStreak(habit, completions, today),
        bestStreak: calculateBestStreak(habit, completions, today),
      };
    })
    .sort((left, right) => right.windowRate - left.windowRate);
}
