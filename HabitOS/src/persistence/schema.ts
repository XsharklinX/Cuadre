import { z } from "zod";

import type { Habit, HabitCompletion, LogicalDate } from "@/domain/types";

export const CURRENT_SCHEMA_VERSION = 1;
export const HABITS_KEY = "habitos.habits";
export const COMPLETIONS_KEY = "habitos.completions";
export const META_KEY = "habitos.meta";

const logicalDateSchema = z.custom<LogicalDate>(
  (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
);

const weekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

export const habitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().min(1),
  color: z.string().min(1),
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
  status: z.enum(["active", "archived"]),
  referenceTimeZone: z.string().min(1),
  goal: z.object({
    type: z.literal("single"),
    frequency: z.union([
      z.object({ type: z.literal("daily") }),
      z.object({
        type: z.literal("specific_weekdays"),
        weekdays: z.array(weekdaySchema).min(1),
      }),
      z.object({
        type: z.literal("times_per_week"),
        targetCount: z.number().int().min(1).max(7),
        weekStartsOn: weekdaySchema,
      }),
    ]),
  }),
  reminders: z.array(z.object({
    id: z.string().min(1),
    enabled: z.boolean(),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    weekdays: z.array(weekdaySchema).optional(),
  })),
  displayOrder: z.number().int(),
  schemaVersion: z.literal(1),
}) satisfies z.ZodType<Habit>;

export const completionSchema = z.object({
  id: z.string().min(1),
  habitId: z.string().min(1),
  logicalDate: logicalDateSchema,
  completedAtUtc: z.string().datetime(),
  timeZone: z.string().min(1),
  source: z.enum(["app", "widget", "import", "automation"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  schemaVersion: z.literal(1),
}) satisfies z.ZodType<HabitCompletion>;

export const persistedStateSchema = z.object({
  schemaVersion: z.literal(1),
  habits: z.array(habitSchema),
  completions: z.array(completionSchema),
});

export type PersistedState = z.infer<typeof persistedStateSchema>;
