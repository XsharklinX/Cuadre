/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        base: {
          bg: "#0f172a",
          card: "#1e293b",
          border: "#334155",
          text: "#f1f5f9",
          muted: "#94a3b8",
        },
        habit: {
          green: "#22c55e",
          cyan: "#06b6d4",
          amber: "#f59e0b",
          rose: "#f43f5e",
          violet: "#8b5cf6",
          blue: "#3b82f6",
          lime: "#84cc16",
          orange: "#f97316",
        },
      },
    },
  },
  plugins: [],
};
