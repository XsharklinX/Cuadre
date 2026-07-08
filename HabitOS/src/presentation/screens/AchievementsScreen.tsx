import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

import { todayLogicalDate } from "@/dates/logicalDate";
import { ACHIEVEMENTS, calculateGamification } from "@/domain/gamification";
import { Icon, type IconName } from "@/presentation/components/Icon";
import { ProgressRing } from "@/presentation/components/ProgressRing";
import { useDeviceTimeZone } from "@/presentation/hooks/useDeviceTimeZone";
import { achievementIconName } from "@/presentation/theme/achievementIcons";
import { gradients, UI } from "@/presentation/theme/colors";
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

      <View className="rounded-2xl border border-base-borderSoft bg-base-card p-5">
        <View className="flex-row items-center gap-4">
          <ProgressRing size={88} strokeWidth={8} progress={levelProgress} gradientColors={gradients.xpBar}>
            <Text className="text-xs uppercase text-base-muted">Nivel</Text>
            <Text className="text-3xl font-bold text-base-text">{gamification.level}</Text>
          </ProgressRing>
          <View className="flex-1">
            <Text className="text-xs text-base-muted">XP total</Text>
            <Text className="text-lg font-bold text-habit-violet">{gamification.totalXp} XP</Text>
            <Text className="mt-1 text-xs text-base-muted">
              {gamification.xpIntoLevel}/{gamification.xpForNextLevel} XP para el nivel {gamification.level + 1}
            </Text>
          </View>
        </View>

        <View className="mt-4 flex-row justify-between">
          <Stat label="Completados" value={`${gamification.totalCompletions}`} />
          <Stat label="Racha actual" value={`${gamification.currentStreakOverall}`} icon="fire" />
          <Stat label="Mejor racha" value={`${gamification.bestStreakOverall}`} />
          <Stat label="Logros" value={`${unlocked.size}/${ACHIEVEMENTS.length}`} />
        </View>
      </View>

      <Text className="mb-3 mt-6 text-lg font-bold text-base-text">Insignias</Text>
      <View className="flex-row flex-wrap justify-between">
        {ACHIEVEMENTS.map((achievement) => {
          const isUnlocked = unlocked.has(achievement.id);
          const iconName = achievementIconName(achievement);
          return (
            <View
              key={achievement.id}
              className={
                isUnlocked
                  ? "mb-3 w-[48%] rounded-2xl border border-habit-amber/60 bg-base-card p-4"
                  : "mb-3 w-[48%] rounded-2xl border border-base-borderSoft bg-base-card p-4"
              }
            >
              <View className="mb-1.5 h-9 w-9 items-center justify-center">
                <Icon
                  name={iconName}
                  size={30}
                  weight={isUnlocked ? "duotone" : "regular"}
                  color={isUnlocked ? "#f59e0b" : UI.muted}
                />
                {!isUnlocked ? (
                  <View
                    className="absolute -bottom-0.5 -right-0.5 h-4 w-4 items-center justify-center rounded-full bg-base-card"
                    style={{ borderWidth: 1, borderColor: UI.border }}
                  >
                    <Icon name="lock" size={9} weight="fill" color={UI.muted} />
                  </View>
                ) : null}
              </View>
              <Text
                className={isUnlocked ? "text-sm font-semibold text-base-text" : "text-sm font-semibold text-base-muted"}
                numberOfLines={1}
              >
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

function Stat({ label, value, icon }: { label: string; value: string; icon?: IconName }) {
  return (
    <View className="items-center">
      <View className="flex-row items-center gap-1">
        {icon ? <Icon name={icon} size={12} weight="fill" color="#f59e0b" /> : null}
        <Text className="text-sm font-bold text-base-text">{value}</Text>
      </View>
      <Text className="mt-0.5 text-[10px] text-base-muted">{label}</Text>
    </View>
  );
}
