import { router, usePathname } from "expo-router";
import { Pressable, Text, View } from "react-native";

const TABS = [
  { path: "/", label: "Hoy", icon: "☀️" },
  { path: "/journal", label: "Diario", icon: "📅" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <View className="flex-row border-t border-base-border bg-base-card">
      {TABS.map((tab) => {
        const isActive = pathname === tab.path;
        return (
          <Pressable
            key={tab.path}
            className="flex-1 items-center py-3"
            onPress={() => {
              if (!isActive) {
                router.replace(tab.path);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text className="text-lg">{tab.icon}</Text>
            <Text className={isActive ? "text-habit-green text-xs font-semibold" : "text-base-muted text-xs"}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
