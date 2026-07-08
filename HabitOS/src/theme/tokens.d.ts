import type { ViewStyle } from "react-native";

export interface BaseColors {
  bg: string;
  card: string;
  border: string;
  borderSoft: string;
  text: string;
  muted: string;
}

export interface HabitColors {
  green: string;
  cyan: string;
  blue: string;
  violet: string;
  rose: string;
  amber: string;
  orange: string;
  lime: string;
}

export const colors: { base: BaseColors; habit: HabitColors };

export const shadows: {
  resting: ViewStyle;
  pressed: ViewStyle;
  floating: ViewStyle;
};

export const gradients: {
  fab: [string, string];
  screenBg: [string, string];
  dailyProgress: [string, string];
  xpBar: [string, string];
};

export function iconSwatchGradient(hex: string): [string, string];
