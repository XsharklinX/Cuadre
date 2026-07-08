import { router, usePathname } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { Icon, type IconName } from "@/presentation/components/Icon";
import { UI, shadows } from "@/presentation/theme/colors";

const TABS: Array<{ path: "/" | "/journal" | "/analytics" | "/achievements"; label: string; icon: IconName }> = [
  { path: "/", label: "Hoy", icon: "sun" },
  { path: "/journal", label: "Diario", icon: "calendar-blank" },
  { path: "/analytics", label: "Analíticas", icon: "chart-bar" },
  { path: "/achievements", label: "Logros", icon: "trophy" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <View
      className="flex-row border-t border-base-borderSoft bg-base-card"
      style={shadows.floating}
    >
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
            <Icon name={tab.icon} size={22} weight={isActive ? "fill" : "regular"} color={isActive ? UI.accent : UI.muted} />
            <Text className={isActive ? "text-habit-green text-xs font-semibold mt-1" : "text-base-muted text-xs mt-1"}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
