import type { Habit, HabitCompletion, HabitFrequency, LogicalDate } from "@/domain/types";

export function makeHabit(overrides: Partial<Habit> = {}): Habit {
  const frequency: HabitFrequency = { type: "daily" };

  return {
    id: "habit-1",
    name: "Read",
    icon: "book",
    color: "#22c55e",
    createdAt: "2026-01-01T12:00:00.000Z",
    status: "active",
    referenceTimeZone: "America/Santo_Domingo",
    goal: {
      type: "single",
      frequency,
    },
    reminders: [],
    displayOrder: 0,
    schemaVersion: 1,
    ...overrides,
  };
}

export function makeCompletion(
  logicalDate: LogicalDate,
  overrides: Partial<HabitCompletion> = {},
): HabitCompletion {
  return {
    id: `completion-${logicalDate}`,
    habitId: "habit-1",
    logicalDate,
    completedAtUtc: `${logicalDate}T12:00:00.000Z`,
    timeZone: "America/Santo_Domingo",
    source: "app",
    createdAt: `${logicalDate}T12:00:00.000Z`,
    updatedAt: `${logicalDate}T12:00:00.000Z`,
    schemaVersion: 1,
    ...overrides,
  };
}
