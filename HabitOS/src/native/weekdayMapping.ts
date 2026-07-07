import type { Weekday } from "@/domain/types";

/** expo-notifications' WEEKLY trigger numbers weekdays 1-7 starting on Sunday,
 * while our domain Weekday follows ISO-8601 (1 = Monday, 7 = Sunday). */
export function isoWeekdayToExpoWeekday(weekday: Weekday): number {
  return weekday === 7 ? 1 : weekday + 1;
}
