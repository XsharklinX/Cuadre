import { describe, expect, it } from "vitest";

import { habitDraftFromForm, type HabitFormValues, validateHabitForm } from "@/domain/habitValidation";

const baseValues: HabitFormValues = {
  name: "Read",
  description: "",
  icon: "B",
  color: "#22c55e",
  frequencyType: "daily",
  weekdays: [1, 2, 3],
  targetCount: 3,
  reminderEnabled: false,
  reminderHour: 8,
  reminderMinute: 0,
  referenceTimeZone: "America/Santo_Domingo",
  displayOrder: 0,
};

describe("habit form validation", () => {
  it("rejects missing names and invalid colors", () => {
    const result = validateHabitForm({ ...baseValues, name: "", color: "green" });

    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeTruthy();
    expect(result.errors.color).toBeTruthy();
  });

  it("requires weekdays for specific weekday frequency", () => {
    const result = validateHabitForm({
      ...baseValues,
      frequencyType: "specific_weekdays",
      weekdays: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.weekdays).toBeTruthy();
  });

  it("builds a weekly draft with optional reminder", () => {
    const draft = habitDraftFromForm({
      ...baseValues,
      description: "Read fiction",
      frequencyType: "times_per_week",
      targetCount: 4,
      reminderEnabled: true,
      reminderHour: 21,
      reminderMinute: 30,
    });

    expect(draft.goal.frequency).toEqual({ type: "times_per_week", targetCount: 4, weekStartsOn: 1 });
    expect(draft.description).toBe("Read fiction");
    expect(draft.reminders).toEqual([
      {
        id: "reminder-21-30",
        enabled: true,
        hour: 21,
        minute: 30,
        weekdays: undefined,
      },
    ]);
  });
});
