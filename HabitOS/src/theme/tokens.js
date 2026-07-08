// Single source of truth for color/shadow/gradient values, consumed both by
// tailwind.config.js (plain Node require, no TS loader available there) and by
// the app's TS code via the sibling tokens.d.ts declaration file.
const base = {
  bg: "#0f172a",
  card: "#1e293b",
  border: "#334155",
  borderSoft: "#33415580",
  text: "#f1f5f9",
  muted: "#94a3b8",
};

const habit = {
  green: "#22c55e",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  rose: "#f43f5e",
  amber: "#f59e0b",
  orange: "#f97316",
  lime: "#84cc16",
};

const colors = { base, habit };

const shadows = {
  resting: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  pressed: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
  floating: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 10,
  },
};

const gradients = {
  fab: [habit.green, "#16a34a"],
  screenBg: [base.bg, "#0b1120"],
  dailyProgress: [habit.green, habit.cyan],
  xpBar: [habit.violet, "#a78bfa"],
};

function iconSwatchGradient(hex) {
  return [`${hex}45`, `${hex}12`];
}

module.exports = { colors, shadows, gradients, iconSwatchGradient };
