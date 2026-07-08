import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";

import type { Habit } from "@/domain/types";
import { Icon, type IconName } from "@/presentation/components/Icon";
import { frequencyLabel } from "@/presentation/labels";
import { iconSwatchGradient, shadows } from "@/presentation/theme/colors";

interface HabitCardProps {
  habit: Habit;
  isCompleted: boolean;
  currentStreak: number;
  onToggle: () => void;
  onOpen: () => void;
}

export function HabitCard({ habit, isCompleted, currentStreak, onToggle, onOpen }: HabitCardProps) {
  return (
    <Pressable
      className="mb-3 flex-row items-center rounded-2xl border border-base-borderSoft bg-base-card p-4"
      style={({ pressed }) => [pressed ? shadows.pressed : shadows.resting]}
      onPress={onToggle}
      onLongPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${habit.name}, ${isCompleted ? "completado" : "pendiente"}`}
    >
      <LinearGradient
        colors={iconSwatchGradient(habit.color)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          marginRight: 12,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={habit.icon as IconName} size={24} color={habit.color} weight="fill" />
      </LinearGradient>

      <View className="flex-1">
        <Text
          className={
            isCompleted
              ? "text-base font-semibold text-base-muted line-through"
              : "text-base font-semibold text-base-text"
          }
          numberOfLines={1}
        >
          {habit.name}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          <Text className="text-xs text-base-muted">{frequencyLabel(habit.goal.frequency)}</Text>
          {currentStreak > 0 ? (
            <View className="flex-row items-center gap-0.5">
              <Icon name="fire" size={12} weight="fill" color="#f59e0b" />
              <Text className="text-xs font-semibold text-habit-amber">{currentStreak}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View
        className="h-8 w-8 items-center justify-center rounded-full border-2"
        style={
          isCompleted
            ? { backgroundColor: habit.color, borderColor: habit.color }
            : { borderColor: habit.color }
        }
      >
        {isCompleted ? <Icon name="check" size={16} weight="bold" color="#ffffff" /> : null}
      </View>
    </Pressable>
  );
}
