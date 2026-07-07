import "../global.css";

import { Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";

import { useDeviceTimeZone } from "@/presentation/hooks/useDeviceTimeZone";
import { UI } from "@/presentation/theme/colors";
import { useHabitStore } from "@/state/habitStore";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const timeZone = useDeviceTimeZone();
  const hydrate = useHabitStore((state) => state.hydrate);
  const isHydrated = useHabitStore((state) => state.isHydrated);

  useEffect(() => {
    void hydrate(timeZone);
  }, [hydrate, timeZone]);

  useEffect(() => {
    if (isHydrated) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isHydrated]);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: UI.bg },
        }}
      />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
