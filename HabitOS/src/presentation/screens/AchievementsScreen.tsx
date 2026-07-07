import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

import { todayLogicalDate } from "@/dates/logicalDate";
import { ACHIEVEMENTS, calculateGamification } from "@/domain/gamification";
import { useDeviceTimeZone } from "@/presentation/hooks/useDeviceTimeZone";
import { useHabitStore } from "@/state/habitStore";

export function AchievementsScreen() {
  const timeZone = useDeviceTimeZone();
  const habits = useHabitStore((state) => state.habits);
  const completions = useHabitStore((state) => state.completions);

  const today = todayLogicalDate(timeZone);
  const gamification = useMemo(
    () => calculateGamification(habits, completions, today),
    [habits, completions, today],
  );

  const levelProgress = gamification.xpForNextLevel === 0
    ? 0
    : gamification.xpIntoLevel / gamification.xpForNextLevel;
  const unlocked = new Set(gamification.unlockedAchievements);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text className="mb-4 text-2xl font-bold text-base-text">Logros</Text>

      <View className="rounded-2xl border border-base-border bg-base-card p-5">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs uppercase text-base-muted">Nivel</Text>
            <Text className="text-4xl font-bold text-base-text">{gamification.level}</Text>
          </View>
          <View className="items-end">
            <Text className="text-xs text-base-muted">XP total</Text>
            <Text className="text-lg font-bold text-habit-violet">{gamification.totalXp} XP</Text>
          </View>
        </View>

        <View className="mt-4">
          <View className="mb-1 flex-row justify-between">
            <Text className="text-xs text-base-muted">Progreso al nivel {gamification.level + 1}</Text>
            <Text className="text-xs font-semibold text-base-text">
              {gamification.xpIntoLevel}/{gamification.xpForNextLevel} XP
            </Text>
          </View>
          <View className="h-2.5 overflow-hidden rounded-full bg-base-bg">
            <View
              className="h-full rounded-full bg-habit-violet"
              style={{ width: `${Math.round(levelProgress * 100)}%` }}
            />
          </View>
        </View>

        <View className="mt-4 flex-row justify-between">
          <Stat label="Completados" value={`${gamification.totalCompletions}`} />
          <Stat label="Racha actual" value={`🔥 ${gamification.currentStreakOverall}`} />
          <Stat label="Mejor racha" value={`${gamification.bestStreakOverall}`} />
          <Stat label="Logros" value={`${unlocked.size}/${ACHIEVEMENTS.length}`} />
        </View>
      </View>

      <Text className="mb-3 mt-6 text-lg font-bold text-base-text">Insignias</Text>
      <View className="flex-row flex-wrap justify-between">
        {ACHIEVEMENTS.map((achievement) => {
          const isUnlocked = unlocked.has(achievement.id);
          return (
            <View
              key={achievement.id}
              className={
                isUnlocked
                  ? "mb-3 w-[48%] rounded-2xl border border-habit-amber/60 bg-base-card p-4"
                  : "mb-3 w-[48%] rounded-2xl border border-base-border bg-base-card p-4 opacity-40"
              }
            >
              <Text className="mb-1.5 text-3xl">{isUnlocked ? achievement.icon : "🔒"}</Text>
              <Text className="text-sm font-semibold text-base-text" numberOfLines={1}>
                {achievement.name}
              </Text>
              <Text className="mt-0.5 text-xs text-base-muted">{achievement.description}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="items-center">
      <Text className="text-sm font-bold text-base-text">{value}</Text>
      <Text className="mt-0.5 text-[10px] text-base-muted">{label}</Text>
    </View>
  );
}
