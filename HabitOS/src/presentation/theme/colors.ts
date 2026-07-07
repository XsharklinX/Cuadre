export const UI = {
  bg: "#0f172a",
  card: "#1e293b",
  border: "#334155",
  text: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#22c55e",
};

export const HABIT_COLORS = [
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#f43f5e",
  "#f59e0b",
  "#f97316",
  "#84cc16",
];

export function heatmapCellColor(dueCount: number, rate: number): string {
  if (dueCount === 0) {
    return "#1e293b";
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
  return "#22c55e";
}

export const HABIT_ICONS = [
  "💧",
  "📖",
  "🏃",
  "🧘",
  "💪",
  "🛏️",
  "🥗",
  "✍️",
  "🎯",
  "🎸",
  "🚿",
  "🦷",
];
