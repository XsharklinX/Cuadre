import { Text, View } from "react-native";

interface EmptyStateProps {
  title: string;
  subtitle: string;
}

export function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="mb-3 text-5xl">🌱</Text>
      <Text className="mb-1 text-center text-lg font-semibold text-base-text">{title}</Text>
      <Text className="text-center text-sm text-base-muted">{subtitle}</Text>
    </View>
  );
}
