import { Text, View } from "react-native";

import { Icon, type IconName } from "@/presentation/components/Icon";
import { UI } from "@/presentation/theme/colors";

interface EmptyStateProps {
  title: string;
  subtitle: string;
  icon?: IconName;
}

export function EmptyState({ title, subtitle, icon = "leaf" }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-base-card">
        <Icon name={icon} size={32} weight="duotone" color={UI.accent} />
      </View>
      <Text className="mb-1 text-center text-lg font-semibold text-base-text">{title}</Text>
      <Text className="text-center text-sm text-base-muted">{subtitle}</Text>
    </View>
  );
}
