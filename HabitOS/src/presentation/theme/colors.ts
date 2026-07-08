import { colors, gradients, iconSwatchGradient, shadows } from "@/theme/tokens";

export const UI = {
  bg: colors.base.bg,
  card: colors.base.card,
  border: colors.base.border,
  borderSoft: colors.base.borderSoft,
  text: colors.base.text,
  muted: colors.base.muted,
  accent: colors.habit.green,
};

export const HABIT_COLORS = Object.values(colors.habit);

export { gradients, iconSwatchGradient, shadows };

export function heatmapCellColor(dueCount: number, rate: number): string {
  if (dueCount === 0) {
    return colors.base.card;
  }
  if (rate === 0) {
    return "#33415588";
  }
  if (rate < 0.5) {
    return "#f59e0b55";
  }
  if (rate < 1) {
    return "#22c55e77";
  }
  return colors.habit.green;
}
