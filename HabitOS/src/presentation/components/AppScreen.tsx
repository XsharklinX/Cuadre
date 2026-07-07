import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface AppScreenProps {
  children: ReactNode;
}

export function AppScreen({ children }: AppScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-base-bg"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {children}
    </View>
  );
}
