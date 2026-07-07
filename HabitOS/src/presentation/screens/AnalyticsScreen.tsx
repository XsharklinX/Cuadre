import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

import { addDays, todayLogicalDate } from "@/dates/logicalDate";
import {
  buildMonthlyTrend,
  buildYearHeatmap,
  compareHabits,
  rankWeekdaysByCompletion,
} from "@/domain/insights";
import { HeatmapGrid } from "@/presentation/components/HeatmapGrid";
import { useDeviceTimeZone } from "@/presentation/hooks/useDeviceTimeZone";
import { WEEKDAY_SHORT } from "@/presentation/labels";
import { useHabitStore } from "@/state/habitStore";

const WEEKDAY_FULL: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

export function AnalyticsScreen() {
  const timeZone = useDeviceTimeZone();
  const habits = useHabitStore((state) => state.habits);
  const completions = useHabitStore((state) => state.completions);

  const today = todayLogicalDate(timeZone);

  const heatmap = useMemo(() => buildYearHeatmap(habits, completions, today), [habits, completions, today]);
  const weekdayRanking = useMemo(
    () => rankWeekdaysByCompletion(habits, completions, addDays(today, -83), today),
    [habits, completions, today],
  );
  const monthlyTrend = useMemo(() => buildMonthlyTrend(habits, completions, today, 6), [habits, completions, today]);
  const habitComparison = useMemo(() => compareHabits(habits, completions, today), [habits, completions, today]);

  const activeDueDays = heatmap.filter((day) => day.dueCount > 0);
  const overallRate =
    activeDueDays.length === 0
      ? 0
      : activeDueDays.reduce((sum, day) => sum + day.rate, 0) / activeDueDays.length;
  const bestWeekday = weekdayRanking.find((entry) => entry.dueCount > 0);
  const worstWeekday = [...weekdayRanking].reverse().find((entry) => entry.dueCount > 0);
  const maxTrendRate = Math.max(0.01, ...monthlyTrend.map((point) => point.rate));

  if (habits.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="mb-3 text-5xl">📊</Text>
        <Text className="mb-1 text-center text-lg font-semibold text-base-text">
          Aún no hay datos
        </Text>
        <Text className="text-center text-sm text-base-muted">
          Crea hábitos y complétalos por unos días para ver tus analíticas aquí.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text className="mb-4 text-2xl font-bold text-base-text">Analíticas</Text>

      <View className="rounded-2xl border border-base-border bg-base-card p-4">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-base-text">Último año</Text>
          <Text className="text-sm font-bold text-habit-green">{Math.round(overallRate * 100)}%</Text>
        </View>
        <HeatmapGrid days={heatmap} />
      </View>

      <Text className="mb-3 mt-6 text-lg font-bold text-base-text">Tendencia mensual</Text>
      <View className="rounded-2xl border border-base-border bg-base-card p-4">
        <View className="flex-row items-end justify-between" style={{ height: 90 }}>
          {monthlyTrend.map((point) => (
            <View key={point.monthStart} className="flex-1 items-center">
              <View
                className="w-5 rounded-t-md bg-habit-cyan"
                style={{ height: Math.max(4, (point.rate / maxTrendRate) * 70) }}
              />
            </View>
          ))}
        </View>
        <View className="mt-2 flex-row justify-between">
          {monthlyTrend.map((point) => (
            <Text key={point.monthStart} className="flex-1 text-center text-[10px] text-base-muted">
              {monthLabel(point.monthStart)}
            </Text>
          ))}
        </View>
      </View>

      <Text className="mb-3 mt-6 text-lg font-bold text-base-text">Mejores y peores días</Text>
      <View className="rounded-2xl border border-base-border bg-base-card p-4">
        {bestWeekday ? (
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm text-base-muted">
              🟢 {WEEKDAY_FULL[bestWeekday.weekday]} es tu mejor día
            </Text>
            <Text className="text-sm font-bold text-habit-green">
              {Math.round(bestWeekday.rate * 100)}%
            </Text>
          </View>
        ) : null}
        {worstWeekday && worstWeekday.weekday !== bestWeekday?.weekday ? (
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-base-muted">
              🔴 {WEEKDAY_FULL[worstWeekday.weekday]} es tu día más difícil
            </Text>
            <Text className="text-sm font-bold text-habit-rose">
              {Math.round(worstWeekday.rate * 100)}%
            </Text>
          </View>
        ) : null}
        <View className="mt-3 flex-row justify-between">
          {weekdayRanking
            .slice()
            .sort((left, right) => left.weekday - right.weekday)
            .map((entry) => (
              <View key={entry.weekday} className="items-center">
                <View
                  className="h-10 w-6 justify-end overflow-hidden rounded-md bg-base-bg"
                >
                  <View
                    className="w-full rounded-md bg-habit-blue"
                    style={{ height: `${Math.round(entry.rate * 100)}%` }}
                  />
                </View>
                <Text className="mt-1 text-[10px] text-base-muted">{WEEKDAY_SHORT[entry.weekday]}</Text>
              </View>
            ))}
        </View>
      </View>

      <Text className="mb-3 mt-6 text-lg font-bold text-base-text">Comparativa de hábitos</Text>
      {habitComparison.length === 0 ? (
        <Text className="text-sm text-base-muted">No hay hábitos activos para comparar.</Text>
      ) : (
        habitComparison.map((entry) => (
          <View
            key={entry.habit.id}
            className="mb-2.5 flex-row items-center rounded-xl border border-base-border bg-base-card p-3"
          >
            <View
              className="mr-3 h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${entry.habit.color}33` }}
            >
              <Text className="text-base">{entry.habit.icon}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-base-text" numberOfLines={1}>
                {entry.habit.name}
              </Text>
              <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-base-bg">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${Math.round(entry.windowRate * 100)}%`, backgroundColor: entry.habit.color }}
                />
              </View>
            </View>
            <View className="ml-3 items-end">
              <Text className="text-sm font-bold text-base-text">{Math.round(entry.windowRate * 100)}%</Text>
              <Text className="text-[10px] text-base-muted">🔥 {entry.currentStreak}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function monthLabel(monthStart: string): string {
  const label = new Date(`${monthStart}T00:00:00`).toLocaleDateString("es-ES", { month: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}
