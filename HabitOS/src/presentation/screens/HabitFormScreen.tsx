import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import type { HabitFormValues } from "@/domain/habitValidation";
import { habitDraftFromForm, validateHabitForm } from "@/domain/habitValidation";
import type { Habit, Weekday } from "@/domain/types";
import { useDeviceTimeZone } from "@/presentation/hooks/useDeviceTimeZone";
import { WEEKDAY_SHORT } from "@/presentation/labels";
import { HABIT_COLORS, HABIT_ICONS } from "@/presentation/theme/colors";
import { useHabitStore } from "@/state/habitStore";

const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Diario" },
  { value: "specific_weekdays", label: "Días fijos" },
  { value: "times_per_week", label: "Por semana" },
] as const;

interface HabitFormScreenProps {
  habitId?: string;
}

export function HabitFormScreen({ habitId }: HabitFormScreenProps) {
  const timeZone = useDeviceTimeZone();
  const habits = useHabitStore((state) => state.habits);
  const createHabit = useHabitStore((state) => state.createHabit);
  const updateHabit = useHabitStore((state) => state.updateHabit);
  const archiveHabit = useHabitStore((state) => state.archiveHabit);
  const requestNotificationPermission = useHabitStore((state) => state.requestNotificationPermission);

  const existing: Habit | undefined = useMemo(
    () => habits.find((habit) => habit.id === habitId),
    [habits, habitId],
  );

  const [values, setValues] = useState<HabitFormValues>(() => {
    if (existing) {
      const frequency = existing.goal.frequency;
      const reminder = existing.reminders[0];
      return {
        name: existing.name,
        description: existing.description ?? "",
        icon: existing.icon,
        color: existing.color,
        frequencyType: frequency.type,
        weekdays: frequency.type === "specific_weekdays" ? frequency.weekdays : [],
        targetCount: frequency.type === "times_per_week" ? frequency.targetCount : 3,
        reminderEnabled: reminder?.enabled ?? false,
        reminderHour: reminder?.hour ?? 8,
        reminderMinute: reminder?.minute ?? 0,
        referenceTimeZone: existing.referenceTimeZone,
        displayOrder: existing.displayOrder,
      };
    }

    return {
      name: "",
      description: "",
      icon: HABIT_ICONS[0] ?? "🎯",
      color: HABIT_COLORS[0] ?? "#22c55e",
      frequencyType: "daily",
      weekdays: [],
      targetCount: 3,
      reminderEnabled: false,
      reminderHour: 8,
      reminderMinute: 0,
      referenceTimeZone: timeZone,
      displayOrder: habits.length,
    };
  });
  const [errors, setErrors] = useState<Partial<Record<keyof HabitFormValues, string>>>({});

  function patch(partial: Partial<HabitFormValues>) {
    setValues((current) => ({ ...current, ...partial }));
  }

  async function handleReminderToggle(next: boolean) {
    if (!next) {
      patch({ reminderEnabled: false });
      return;
    }

    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert(
        "Permiso necesario",
        "Activa las notificaciones para HabitOS en los ajustes del sistema para recibir recordatorios.",
      );
      return;
    }
    patch({ reminderEnabled: true });
  }

  function toggleWeekday(weekday: Weekday) {
    patch({
      weekdays: values.weekdays.includes(weekday)
        ? values.weekdays.filter((candidate) => candidate !== weekday)
        : [...values.weekdays, weekday],
    });
  }

  async function handleSave() {
    const result = validateHabitForm(values);
    setErrors(result.errors);
    if (!result.valid) {
      return;
    }

    const draft = habitDraftFromForm(values);
    if (existing) {
      await updateHabit({
        ...existing,
        name: draft.name,
        description: draft.description,
        icon: draft.icon,
        color: draft.color,
        goal: draft.goal,
        reminders: draft.reminders ?? existing.reminders,
      });
    } else {
      await createHabit(draft);
    }
    router.back();
  }

  function handleArchive() {
    if (!existing) {
      return;
    }
    Alert.alert(
      "Archivar hábito",
      `"${existing.name}" dejará de aparecer en tu día, pero su historial se conserva.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Archivar",
          style: "destructive",
          onPress: () => {
            void archiveHabit(existing.id).then(() => router.back());
          },
        },
      ],
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <View className="mb-6 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text className="text-base text-base-muted">Cancelar</Text>
        </Pressable>
        <Text className="text-lg font-bold text-base-text">
          {existing ? "Editar hábito" : "Nuevo hábito"}
        </Text>
        <Pressable onPress={() => void handleSave()} accessibilityRole="button" hitSlop={12}>
          <Text className="text-base font-semibold text-habit-green">Guardar</Text>
        </Pressable>
      </View>

      <Text className="mb-1.5 text-xs font-semibold uppercase text-base-muted">Nombre</Text>
      <TextInput
        className="mb-1 rounded-xl border border-base-border bg-base-card px-4 py-3 text-base text-base-text"
        placeholder="Ej. Leer 20 minutos"
        placeholderTextColor="#64748b"
        value={values.name}
        onChangeText={(name) => patch({ name })}
        maxLength={60}
      />
      {errors.name ? <Text className="mb-2 text-xs text-habit-rose">{errors.name}</Text> : null}

      <Text className="mb-1.5 mt-4 text-xs font-semibold uppercase text-base-muted">
        Descripción (opcional)
      </Text>
      <TextInput
        className="rounded-xl border border-base-border bg-base-card px-4 py-3 text-base text-base-text"
        placeholder="¿Por qué importa este hábito?"
        placeholderTextColor="#64748b"
        value={values.description}
        onChangeText={(description) => patch({ description })}
        multiline
      />

      <Text className="mb-1.5 mt-4 text-xs font-semibold uppercase text-base-muted">Icono</Text>
      <View className="flex-row flex-wrap gap-2">
        {HABIT_ICONS.map((icon) => (
          <Pressable
            key={icon}
            className={
              values.icon === icon
                ? "h-11 w-11 items-center justify-center rounded-xl border-2 border-habit-green bg-base-card"
                : "h-11 w-11 items-center justify-center rounded-xl border border-base-border bg-base-card"
            }
            onPress={() => patch({ icon })}
          >
            <Text className="text-xl">{icon}</Text>
          </Pressable>
        ))}
      </View>

      <Text className="mb-1.5 mt-4 text-xs font-semibold uppercase text-base-muted">Color</Text>
      <View className="flex-row flex-wrap gap-2.5">
        {HABIT_COLORS.map((color) => (
          <Pressable
            key={color}
            className="h-9 w-9 rounded-full"
            style={{
              backgroundColor: color,
              borderWidth: values.color === color ? 3 : 0,
              borderColor: "#f1f5f9",
            }}
            onPress={() => patch({ color })}
            accessibilityRole="button"
            accessibilityLabel={`Color ${color}`}
          />
        ))}
      </View>

      <Text className="mb-1.5 mt-4 text-xs font-semibold uppercase text-base-muted">Frecuencia</Text>
      <View className="flex-row gap-2">
        {FREQUENCY_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            className={
              values.frequencyType === option.value
                ? "flex-1 items-center rounded-xl bg-habit-green py-2.5"
                : "flex-1 items-center rounded-xl border border-base-border bg-base-card py-2.5"
            }
            onPress={() => patch({ frequencyType: option.value })}
          >
            <Text
              className={
                values.frequencyType === option.value
                  ? "text-sm font-semibold text-white"
                  : "text-sm text-base-muted"
              }
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {values.frequencyType === "specific_weekdays" ? (
        <View className="mt-3">
          <View className="flex-row gap-2">
            {ALL_WEEKDAYS.map((weekday) => {
              const isSelected = values.weekdays.includes(weekday);
              return (
                <Pressable
                  key={weekday}
                  className={
                    isSelected
                      ? "h-10 flex-1 items-center justify-center rounded-lg bg-habit-green"
                      : "h-10 flex-1 items-center justify-center rounded-lg border border-base-border bg-base-card"
                  }
                  onPress={() => toggleWeekday(weekday)}
                >
                  <Text className={isSelected ? "font-semibold text-white" : "text-base-muted"}>
                    {WEEKDAY_SHORT[weekday]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.weekdays ? (
            <Text className="mt-1.5 text-xs text-habit-rose">{errors.weekdays}</Text>
          ) : null}
        </View>
      ) : null}

      {values.frequencyType === "times_per_week" ? (
        <View className="mt-3 flex-row items-center justify-center gap-6 rounded-xl border border-base-border bg-base-card py-3">
          <Pressable
            className="h-10 w-10 items-center justify-center rounded-full bg-base-bg"
            onPress={() => patch({ targetCount: Math.max(1, values.targetCount - 1) })}
            accessibilityRole="button"
            accessibilityLabel="Reducir objetivo semanal"
          >
            <Text className="text-xl text-base-text">−</Text>
          </Pressable>
          <Text className="text-lg font-bold text-base-text">
            {values.targetCount} {values.targetCount === 1 ? "vez" : "veces"}
          </Text>
          <Pressable
            className="h-10 w-10 items-center justify-center rounded-full bg-base-bg"
            onPress={() => patch({ targetCount: Math.min(7, values.targetCount + 1) })}
            accessibilityRole="button"
            accessibilityLabel="Aumentar objetivo semanal"
          >
            <Text className="text-xl text-base-text">+</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="mb-1.5 mt-4 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase text-base-muted">Recordatorio</Text>
        <Switch
          value={values.reminderEnabled}
          onValueChange={(next) => void handleReminderToggle(next)}
          trackColor={{ false: "#334155", true: "#22c55e" }}
          thumbColor="#f1f5f9"
        />
      </View>

      {values.reminderEnabled ? (
        <View className="flex-row items-center justify-center gap-4 rounded-xl border border-base-border bg-base-card py-3">
          <TimeStepper
            label="Hora"
            value={values.reminderHour}
            max={23}
            onChange={(reminderHour) => patch({ reminderHour })}
          />
          <Text className="text-lg font-bold text-base-text">:</Text>
          <TimeStepper
            label="Min"
            value={values.reminderMinute}
            max={59}
            step={5}
            onChange={(reminderMinute) => patch({ reminderMinute })}
          />
        </View>
      ) : (
        <Text className="text-xs text-base-muted">
          Recibe un aviso {values.frequencyType === "specific_weekdays" ? "los días de este hábito" : "todos los días"}.
        </Text>
      )}

      {existing ? (
        <Pressable
          className="mt-8 items-center rounded-xl border border-habit-rose/50 py-3 active:opacity-70"
          onPress={handleArchive}
          accessibilityRole="button"
        >
          <Text className="font-semibold text-habit-rose">Archivar hábito</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

interface TimeStepperProps {
  label: string;
  value: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

function TimeStepper({ label, value, max, step = 1, onChange }: TimeStepperProps) {
  function clamp(next: number): number {
    if (next < 0) {
      return max - (step - 1);
    }
    if (next > max) {
      return 0;
    }
    return next;
  }

  return (
    <View className="items-center">
      <Text className="mb-1 text-[10px] uppercase text-base-muted">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          className="h-9 w-9 items-center justify-center rounded-full bg-base-bg"
          onPress={() => onChange(clamp(value - step))}
          accessibilityRole="button"
          accessibilityLabel={`Reducir ${label}`}
        >
          <Text className="text-base text-base-text">−</Text>
        </Pressable>
        <Text className="w-9 text-center text-lg font-bold text-base-text">
          {value.toString().padStart(2, "0")}
        </Text>
        <Pressable
          className="h-9 w-9 items-center justify-center rounded-full bg-base-bg"
          onPress={() => onChange(clamp(value + step))}
          accessibilityRole="button"
          accessibilityLabel={`Aumentar ${label}`}
        >
          <Text className="text-base text-base-text">+</Text>
        </Pressable>
      </View>
    </View>
  );
}
