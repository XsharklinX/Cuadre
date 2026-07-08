import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { addDays, endOfMonth, startOfMonth, todayLogicalDate, weekdayOf } from "@/dates/logicalDate";
import type { LogicalDate } from "@/domain/types";
import { Icon, type IconName } from "@/presentation/components/Icon";
import { useDeviceTimeZone } from "@/presentation/hooks/useDeviceTimeZone";
import { formatMonth, frequencyLabel, WEEKDAY_SHORT } from "@/presentation/labels";
import { iconSwatchGradient, UI } from "@/presentation/theme/colors";
import { useHabitStore } from "@/state/habitStore";
import { buildJournalFromData, type JournalDay } from "@/use-cases/buildJournal";

export function JournalScreen() {
  const timeZone = useDeviceTimeZone();
  const habits = useHabitStore((state) => state.habits);
  const completions = useHabitStore((state) => state.completions);

  const today = todayLogicalDate(timeZone);
  const [monthDate, setMonthDate] = useState<LogicalDate>(today);

  const journal = useMemo(
    () => buildJournalFromData(habits, completions, monthDate, today),
    [habits, completions, monthDate, today],
  );

  const weeks = useMemo(() => buildCalendarWeeks(journal.days), [journal.days]);
  const activeHabits = journal.habitAnalytics.filter((entry) => entry.habit.status === "active");

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text className="mb-4 text-2xl font-bold text-base-text">Diario</Text>

      <View className="mb-3 flex-row items-center justify-between">
        <Pressable
          className="h-9 w-9 items-center justify-center rounded-full bg-base-card"
          onPress={() => setMonthDate(addDays(startOfMonth(monthDate), -1))}
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
        >
          <Icon name="caret-left" size={16} color={UI.text} />
        </Pressable>
        <Text className="text-base font-semibold text-base-text">{formatMonth(monthDate)}</Text>
        <Pressable
          className="h-9 w-9 items-center justify-center rounded-full bg-base-card"
          onPress={() => setMonthDate(addDays(endOfMonth(monthDate), 1))}
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
        >
          <Icon name="caret-right" size={16} color={UI.text} />
        </Pressable>
      </View>

      <View className="rounded-2xl border border-base-borderSoft bg-base-card p-3">
        <View className="mb-2 flex-row">
          {([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => (
            <Text key={weekday} className="flex-1 text-center text-xs text-base-muted">
              {WEEKDAY_SHORT[weekday]}
            </Text>
          ))}
        </View>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} className="mb-1.5 flex-row">
            {week.map((day, dayIndex) => (
              <View key={dayIndex} className="flex-1 items-center">
                {day ? (
                  <View
                    className="h-9 w-9 items-center justify-center rounded-lg"
                    style={{ backgroundColor: dayColor(day) }}
                  >
                    <Text
                      className={
                        day.date === today
                          ? "text-xs font-bold text-habit-green"
                          : "text-xs text-base-text"
                      }
                    >
                      {Number(day.date.slice(8, 10))}
                    </Text>
                  </View>
                ) : (
                  <View className="h-9 w-9" />
                )}
              </View>
            ))}
          </View>
        ))}
      </View>

      <Text className="mb-3 mt-6 text-lg font-bold text-base-text">Hábitos del mes</Text>
      {activeHabits.length === 0 ? (
        <Text className="text-sm text-base-muted">
          Aún no hay hábitos activos. Crea uno desde la pestaña Hoy.
        </Text>
      ) : (
        activeHabits.map(({ habit, analytics }) => (
          <View
            key={habit.id}
            className="mb-3 rounded-2xl border border-base-borderSoft bg-base-card p-4"
          >
            <View className="flex-row items-center">
              <LinearGradient
                colors={iconSwatchGradient(habit.color)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: 40, height: 40, borderRadius: 12, marginRight: 12, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name={habit.icon as IconName} size={20} color={habit.color} weight="fill" />
              </LinearGradient>
              <View className="flex-1">
                <Text className="font-semibold text-base-text" numberOfLines={1}>
                  {habit.name}
                </Text>
                <Text className="text-xs text-base-muted">
                  {frequencyLabel(habit.goal.frequency)}
                </Text>
              </View>
            </View>
            <View className="mt-3 flex-row justify-between">
              <Metric label="Racha" value={`${analytics.currentStreak}`} icon="fire" />
              <Metric label="Mejor racha" value={`${analytics.bestStreak}`} />
              <Metric label="Mes" value={`${Math.round(analytics.completionRate * 100)}%`} />
              <Metric
                label="Tendencia"
                value={`${Math.abs(Math.round(analytics.periodDelta * 100))}%`}
                icon={analytics.periodDelta >= 0 ? "trend-up" : "trend-down"}
                iconColor={analytics.periodDelta >= 0 ? "#22c55e" : "#f43f5e"}
              />
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  icon,
  iconColor = "#f59e0b",
}: {
  label: string;
  value: string;
  icon?: IconName;
  iconColor?: string;
}) {
  return (
    <View className="items-center">
      <View className="flex-row items-center gap-1">
        {icon ? <Icon name={icon} size={12} weight="fill" color={iconColor} /> : null}
        <Text className="text-sm font-bold text-base-text">{value}</Text>
      </View>
      <Text className="mt-0.5 text-[10px] text-base-muted">{label}</Text>
    </View>
  );
}

function buildCalendarWeeks(days: JournalDay[]): Array<Array<JournalDay | undefined>> {
  const weeks: Array<Array<JournalDay | undefined>> = [];
  const first = days[0];
  if (!first) {
    return weeks;
  }

  let currentWeek: Array<JournalDay | undefined> = new Array(weekdayOf(first.date) - 1).fill(undefined);
  for (const day of days) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(undefined);
    }
    weeks.push(currentWeek);
  }
  return weeks;
}

function dayColor(day: JournalDay): string {
  if (day.dueCount === 0) {
    return "transparent";
  }
  if (day.completionRate === 0) {
    return "#33415555";
  }
  if (day.completionRate < 1) {
    return "#f59e0b55";
  }
  return "#22c55e66";
}
