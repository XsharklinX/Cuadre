import {
  addDays,
  compareLogicalDates,
  datesBetweenInclusive,
  previousPeriod,
  startOfWeek,
} from "@/dates/logicalDate";
import {
  countCompletionsBetween,
  isCompletedOnDate,
  isHabitDueOnDate,
  requiredCompletionsForPeriod,
} from "@/domain/frequency";
import { calculateBestStreak, calculateCurrentStreak } from "@/domain/streaks";
import type { Habit, HabitCompletion, HabitStats, LogicalDate } from "@/domain/types";

export interface PeriodStats {
  requiredCount: number;
  completedCount: number;
  completionRate: number;
}

export interface HabitAnalytics extends HabitStats {
  period: PeriodStats;
  previousPeriod: PeriodStats;
  periodDelta: number;
}

export function calculateHabitAnalytics(
  habit: Habit,
  completions: HabitCompletion[],
  periodStart: LogicalDate,
  periodEnd: LogicalDate,
  today: LogicalDate,
): HabitAnalytics {
  const period = calculatePeriodStats(habit, completions, periodStart, periodEnd);
  const previous = previousPeriod(periodStart, periodEnd);
  const previousStats = calculatePeriodStats(habit, completions, previous.start, previous.end);

  return {
    currentStreak: calculateCurrentStreak(habit, completions, today),
    bestStreak: calculateBestStreak(habit, completions, today),
    completionRate: period.completionRate,
    period,
    previousPeriod: previousStats,
    periodDelta: period.completionRate - previousStats.completionRate,
  };
}

export function calculatePeriodStats(
  habit: Habit,
  completions: HabitCompletion[],
  periodStart: LogicalDate,
  periodEnd: LogicalDate,
): PeriodStats {
  if (habit.status === "archived") {
    return { requiredCount: 0, completedCount: 0, completionRate: 0 };
  }

  if (habit.goal.frequency.type === "times_per_week") {
    return calculateWeeklyTargetPeriodStats(habit, completions, periodStart, periodEnd);
  }

  const dueDates = datesBetweenInclusive(periodStart, periodEnd).filter((date) => isHabitDueOnDate(habit, date));
  const completedCount = dueDates.filter((date) => isCompletedOnDate(completions, habit.id, date)).length;
  return buildPeriodStats(dueDates.length, completedCount);
}

function calculateWeeklyTargetPeriodStats(
  habit: Habit,
  completions: HabitCompletion[],
  periodStart: LogicalDate,
  periodEnd: LogicalDate,
): PeriodStats {
  const frequency = habit.goal.frequency;
  if (frequency.type !== "times_per_week") {
    return { requiredCount: 0, completedCount: 0, completionRate: 0 };
  }

  let requiredCount = 0;
  let completedCount = 0;
  let cursor = startOfWeek(periodStart, frequency.weekStartsOn);

  while (compareLogicalDates(cursor, periodEnd) <= 0) {
    const weekStart = compareLogicalDates(cursor, periodStart) < 0 ? periodStart : cursor;
    const weekEndCandidate = addDays(cursor, 6);
    const weekEnd = compareLogicalDates(weekEndCandidate, periodEnd) > 0 ? periodEnd : weekEndCandidate;
    const required = requiredCompletionsForPeriod(habit, weekStart, weekEnd);

    requiredCount += required;
    completedCount += Math.min(required, countCompletionsBetween(completions, habit.id, weekStart, weekEnd));
    cursor = addDays(cursor, 7);
  }

  return buildPeriodStats(requiredCount, completedCount);
}

function buildPeriodStats(requiredCount: number, completedCount: number): PeriodStats {
  return {
    requiredCount,
    completedCount,
    completionRate: requiredCount === 0 ? 0 : completedCount / requiredCount,
  };
}
