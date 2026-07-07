import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { calculateCurrentStreak } from "@/domain/streaks";
import { EmptyState } from "@/presentation/components/EmptyState";
import { HabitCard } from "@/presentation/components/HabitCard";
import { useDeviceTimeZone } from "@/presentation/hooks/useDeviceTimeZone";
import { formatLogicalDate } from "@/presentation/labels";
import { useHabitStore } from "@/state/habitStore";

export function DashboardScreen() {
  const timeZone = useDeviceTimeZone();
  const dailyHabits = useHabitStore((state) => state.dailyHabits);
  const completions = useHabitStore((state) => state.completions);
  const selectedDate = useHabitStore((state) => state.selectedDate);
  const isHydrated = useHabitStore((state) => state.isHydrated);
  const errorMessage = useHabitStore((state) => state.errorMessage);
  const completeHabit = useHabitStore((state) => state.completeHabit);
  const undoCompletion = useHabitStore((state) => state.undoCompletion);

  const streaksByHabit = useMemo(() => {
    const streaks = new Map<string, number>();
    for (const view of dailyHabits) {
      streaks.set(view.habit.id, calculateCurrentStreak(view.habit, completions, selectedDate));
    }
    return streaks;
  }, [dailyHabits, completions, selectedDate]);

  const completedCount = dailyHabits.filter((view) => view.isCompleted).length;
  const totalCount = dailyHabits.length;
  const progress = totalCount === 0 ? 0 : completedCount / totalCount;

  if (!isHydrated) {
    return null;
  }

  return (
    <View className="flex-1">
      <View className="px-5 pb-4 pt-3">
        <Text className="text-2xl font-bold text-base-text">HabitOS</Text>
        <Text className="mt-0.5 text-sm text-base-muted">{formatLogicalDate(selectedDate)}</Text>

        {totalCount > 0 ? (
          <View className="mt-4">
            <View className="mb-1.5 flex-row justify-between">
              <Text className="text-xs text-base-muted">Progreso de hoy</Text>
              <Text className="text-xs font-semibold text-base-text">
                {completedCount}/{totalCount}
              </Text>
            </View>
            <View className="h-2.5 overflow-hidden rounded-full bg-base-card">
              <View
                className="h-full rounded-full bg-habit-green"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </View>
            {progress === 1 ? (
              <Text className="mt-2 text-center text-sm font-semibold text-habit-green">
                🎉 ¡Día completado!
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {errorMessage ? (
        <View className="mx-5 mb-3 rounded-xl bg-habit-rose/20 p-3">
          <Text className="text-sm text-habit-rose">{errorMessage}</Text>
        </View>
      ) : null}

      {totalCount === 0 ? (
        <EmptyState
          title="Sin hábitos todavía"
          subtitle="Crea tu primer hábito con el botón + y empieza a construir tu racha."
        />
      ) : (
        <FlatList
          data={dailyHabits}
          keyExtractor={(view) => view.habit.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 96 }}
          renderItem={({ item }) => (
            <HabitCard
              habit={item.habit}
              isCompleted={item.isCompleted}
              currentStreak={streaksByHabit.get(item.habit.id) ?? 0}
              onToggle={() => {
                if (item.isCompleted) {
                  void undoCompletion(item.habit.id);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } else {
                  void completeHabit(item.habit.id, timeZone);
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
              }}
              onOpen={() => router.push(`/habits/${item.habit.id}`)}
            />
          )}
        />
      )}

      <Pressable
        className="absolute bottom-5 right-5 h-14 w-14 items-center justify-center rounded-full bg-habit-green shadow-lg active:opacity-80"
        onPress={() => router.push("/habits/new")}
        accessibilityRole="button"
        accessibilityLabel="Crear hábito"
      >
        <Text className="text-3xl font-light text-white">+</Text>
      </Pressable>
    </View>
  );
}
