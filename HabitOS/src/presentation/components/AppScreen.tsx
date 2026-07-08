import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { gradients } from "@/presentation/theme/colors";

interface AppScreenProps {
  children: ReactNode;
}

export function AppScreen({ children }: AppScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={gradients.screenBg}
      style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {children}
    </LinearGradient>
  );
}
