import type { HabitDraft, HabitFrequency, HabitReminder, Weekday } from "@/domain/types";

export interface HabitFormValues {
  name: string;
  description: string;
  icon: string;
  color: string;
  frequencyType: "daily" | "specific_weekdays" | "times_per_week";
  weekdays: Weekday[];
  targetCount: number;
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  referenceTimeZone: string;
  displayOrder: number;
}

export interface HabitValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof HabitFormValues, string>>;
}

export function validateHabitForm(values: HabitFormValues): HabitValidationResult {
  const errors: Partial<Record<keyof HabitFormValues, string>> = {};

  if (values.name.trim().length < 1) {
    errors.name = "El nombre es obligatorio.";
  }

  if (values.name.trim().length > 60) {
    errors.name = "Usa 60 caracteres o menos.";
  }

  if (values.icon.trim().length < 1) {
    errors.icon = "El icono es obligatorio.";
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(values.color)) {
    errors.color = "El color debe estar en formato #RRGGBB.";
  }

  if (values.frequencyType === "specific_weekdays" && values.weekdays.length === 0) {
    errors.weekdays = "Selecciona al menos un dia.";
  }

  if (values.frequencyType === "times_per_week" && (values.targetCount < 1 || values.targetCount > 7)) {
    errors.targetCount = "El objetivo semanal debe estar entre 1 y 7.";
  }

  if (values.reminderEnabled && (values.reminderHour < 0 || values.reminderHour > 23)) {
    errors.reminderHour = "La hora debe estar entre 0 y 23.";
  }

  if (values.reminderEnabled && (values.reminderMinute < 0 || values.reminderMinute > 59)) {
    errors.reminderMinute = "Los minutos deben estar entre 0 y 59.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function habitDraftFromForm(values: HabitFormValues): HabitDraft {
  const frequency = buildFrequency(values);
  const reminders: HabitReminder[] = values.reminderEnabled
    ? [
        {
          id: `reminder-${values.reminderHour}-${values.reminderMinute}`,
          enabled: true,
          hour: values.reminderHour,
          minute: values.reminderMinute,
          weekdays: values.frequencyType === "specific_weekdays" ? values.weekdays : undefined,
        },
      ]
    : [];

  return {
    name: values.name.trim(),
    description: values.description.trim() || undefined,
    icon: values.icon.trim(),
    color: values.color,
    referenceTimeZone: values.referenceTimeZone,
    goal: {
      type: "single",
      frequency,
    },
    reminders,
    displayOrder: values.displayOrder,
  };
}

function buildFrequency(values: HabitFormValues): HabitFrequency {
  if (values.frequencyType === "specific_weekdays") {
    return {
      type: "specific_weekdays",
      weekdays: values.weekdays,
    };
  }

  if (values.frequencyType === "times_per_week") {
    return {
      type: "times_per_week",
      targetCount: values.targetCount,
      weekStartsOn: 1,
    };
  }

  return { type: "daily" };
}
