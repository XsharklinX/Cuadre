import type { HabitFrequency, LogicalDate, Weekday } from "@/domain/types";

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: "L",
  2: "M",
  3: "X",
  4: "J",
  5: "V",
  6: "S",
  7: "D",
};

export function frequencyLabel(frequency: HabitFrequency): string {
  if (frequency.type === "daily") {
    return "Todos los días";
  }

  if (frequency.type === "specific_weekdays") {
    return [...frequency.weekdays]
      .sort((left, right) => left - right)
      .map((weekday) => WEEKDAY_SHORT[weekday])
      .join(" · ");
  }

  return `${frequency.targetCount}× por semana`;
}

export function formatLogicalDate(date: LogicalDate): string {
  const label = new Date(`${date}T00:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatMonth(date: LogicalDate): string {
  const label = new Date(`${date}T00:00:00`).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
