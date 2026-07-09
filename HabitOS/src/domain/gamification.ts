import { Temporal } from "@js-temporal/polyfill";

import { addDays, compareLogicalDates, datesBetweenInclusive, startOfWeek } from "@/dates/logicalDate";
import { isCompletedOnDate, isHabitDueOnDate } from "@/domain/frequency";
import { habitArchivedDate, habitCreatedDate } from "@/domain/habitDates";
import { calculateBestStreak, calculateCurrentStreak } from "@/domain/streaks";
import type { Habit, HabitCompletion, LogicalDate } from "@/domain/types";

export const XP_PER_COMPLETION = 10;

export type AchievementId =
  | "first_step"
  | "streak_3"
  | "streak_7"
  | "streak_30"
  | "collector_5"
  | "century_100"
  | "perfect_week"
  | "early_bird_10"
  | "level_5"
  | "level_10";

export interface AchievementDefinition {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "first_step", name: "Primer paso", description: "Completa tu primer hábito.", icon: "leaf" },
  { id: "streak_3", name: "Calentando", description: "Alcanza una racha de 3.", icon: "sparkle" },
  { id: "streak_7", name: "En llamas", description: "Alcanza una racha de 7.", icon: "fire" },
  { id: "streak_30", name: "Imparable", description: "Alcanza una racha de 30.", icon: "rocket" },
  { id: "collector_5", name: "Coleccionista", description: "Crea 5 hábitos.", icon: "folder-open" },
  { id: "century_100", name: "Centenario", description: "Acumula 100 completados.", icon: "medal" },
  {
    id: "perfect_week",
    name: "Semana perfecta",
    description: "Completa todos tus hábitos cada día de una semana.",
    icon: "trophy",
  },
  {
    id: "early_bird_10",
    name: "Madrugador",
    description: "Completa 10 hábitos antes de las 8 a. m.",
    icon: "sun-horizon",
  },
  { id: "level_5", name: "Veterano", description: "Alcanza el nivel 5.", icon: "star" },
  { id: "level_10", name: "Leyenda", description: "Alcanza el nivel 10.", icon: "crown" },
];

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
}

export interface GamificationSnapshot extends LevelProgress {
  totalXp: number;
  totalCompletions: number;
  bestStreakOverall: number;
  currentStreakOverall: number;
  unlockedAchievements: AchievementId[];
}

export function streakBonus(chainLength: number): number {
  if (chainLength >= 30) {
    return 25;
  }
  if (chainLength >= 14) {
    return 15;
  }
  if (chainLength >= 7) {
    return 10;
  }
  if (chainLength >= 3) {
    return 5;
  }
  return 0;
}

export function xpCostForLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

export function levelFromXp(totalXp: number): LevelProgress {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpCostForLevel(level)) {
    remaining -= xpCostForLevel(level);
    level += 1;
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: xpCostForLevel(level) };
}

export function calculateHabitXp(habit: Habit, completions: HabitCompletion[], today: LogicalDate): number {
  const evalHabit: Habit = habit.status === "archived" ? { ...habit, status: "active" } : habit;
  const createdDate = habitCreatedDate(habit);
  const archivedDate = habitArchivedDate(habit);
  const end = archivedDate && compareLogicalDates(archivedDate, today) < 0 ? archivedDate : today;

  if (compareLogicalDates(createdDate, end) > 0) {
    return 0;
  }

  let xp = 0;
  let chain = 0;
  for (const date of datesBetweenInclusive(createdDate, end)) {
    if (!isHabitDueOnDate(evalHabit, date)) {
      continue;
    }
    if (isCompletedOnDate(completions, habit.id, date)) {
      chain += 1;
      xp += XP_PER_COMPLETION + streakBonus(chain);
    } else {
      chain = 0;
    }
  }
  return xp;
}

export function calculateTotalXp(habits: Habit[], completions: HabitCompletion[], today: LogicalDate): number {
  return habits.reduce((sum, habit) => sum + calculateHabitXp(habit, completions, today), 0);
}

export function hasPerfectWeek(habits: Habit[], completions: HabitCompletion[], today: LogicalDate): boolean {
  if (habits.length === 0) {
    return false;
  }

  const earliest = habits
    .map((habit) => habitCreatedDate(habit))
    .sort((left, right) => compareLogicalDates(left, right))[0];
  if (!earliest) {
    return false;
  }

  let cursor = startOfWeek(earliest, 1);
  while (compareLogicalDates(cursor, today) <= 0) {
    const weekEnd = addDays(cursor, 6);
    if (compareLogicalDates(weekEnd, today) > 0) {
      break;
    }

    let dueDayCount = 0;
    let allCompleted = true;
    for (const day of datesBetweenInclusive(cursor, weekEnd)) {
      const dueHabits = habits.filter((habit) => isHabitDueOnDate(habit, day));
      if (dueHabits.length === 0) {
        continue;
      }
      dueDayCount += 1;
      if (!dueHabits.every((habit) => isCompletedOnDate(completions, habit.id, day))) {
        allCompleted = false;
        break;
      }
    }

    if (allCompleted && dueDayCount >= 4) {
      return true;
    }
    cursor = addDays(cursor, 7);
  }

  return false;
}

export function countEarlyCompletions(completions: HabitCompletion[]): number {
  return completions.filter((completion) => {
    const zoned = Temporal.Instant.from(completion.completedAtUtc).toZonedDateTimeISO(completion.timeZone);
    return zoned.hour < 8;
  }).length;
}

export function calculateGamification(
  habits: Habit[],
  completions: HabitCompletion[],
  today: LogicalDate,
): GamificationSnapshot {
  const totalXp = calculateTotalXp(habits, completions, today);
  const levelProgress = levelFromXp(totalXp);
  const totalCompletions = completions.length;

  const bestStreakOverall = habits.reduce((best, habit) => {
    const evalHabit: Habit = habit.status === "archived" ? { ...habit, status: "active" } : habit;
    return Math.max(best, calculateBestStreak(evalHabit, completions, today));
  }, 0);

  const currentStreakOverall = habits.reduce(
    (best, habit) => Math.max(best, calculateCurrentStreak(habit, completions, today)),
    0,
  );

  const unlockedAchievements: AchievementId[] = [];
  if (totalCompletions >= 1) {
    unlockedAchievements.push("first_step");
  }
  if (bestStreakOverall >= 3) {
    unlockedAchievements.push("streak_3");
  }
  if (bestStreakOverall >= 7) {
    unlockedAchievements.push("streak_7");
  }
  if (bestStreakOverall >= 30) {
    unlockedAchievements.push("streak_30");
  }
  if (habits.length >= 5) {
    unlockedAchievements.push("collector_5");
  }
  if (totalCompletions >= 100) {
    unlockedAchievements.push("century_100");
  }
  if (hasPerfectWeek(habits, completions, today)) {
    unlockedAchievements.push("perfect_week");
  }
  if (countEarlyCompletions(completions) >= 10) {
    unlockedAchievements.push("early_bird_10");
  }
  if (levelProgress.level >= 5) {
    unlockedAchievements.push("level_5");
  }
  if (levelProgress.level >= 10) {
    unlockedAchievements.push("level_10");
  }

  return {
    ...levelProgress,
    totalXp,
    totalCompletions,
    bestStreakOverall,
    currentStreakOverall,
    unlockedAchievements,
  };
}
