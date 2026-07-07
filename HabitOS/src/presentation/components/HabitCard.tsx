import { Pressable, Text, View } from "react-native";

import type { Habit } from "@/domain/types";
import { frequencyLabel } from "@/presentation/labels";

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
      className="mb-3 flex-row items-center rounded-2xl border border-base-border bg-base-card p-4 active:opacity-80"
      onPress={onToggle}
      onLongPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${habit.name}, ${isCompleted ? "completado" : "pendiente"}`}
    >
      <View
        className="mr-3 h-12 w-12 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${habit.color}33` }}
      >
        <Text className="text-2xl">{habit.icon}</Text>
      </View>

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
            <Text className="text-xs font-semibold text-habit-amber">🔥 {currentStreak}</Text>
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
        {isCompleted ? <Text className="text-sm font-bold text-white">✓</Text> : null}
      </View>
    </Pressable>
  );
}
