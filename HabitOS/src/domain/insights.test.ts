import { describe, expect, it } from "vitest";

import {
  buildMonthlyTrend,
  buildYearHeatmap,
  compareHabits,
  rankWeekdaysByCompletion,
} from "@/domain/insights";
import { makeCompletion, makeHabit } from "@/tests/factories";

describe("buildYearHeatmap", () => {
  it("marks non-due days as zero and due days by completion", () => {
    const habit = makeHabit({
      createdAt: "2026-01-01T12:00:00.000Z",
      goal: { type: "single", frequency: { type: "specific_weekdays", weekdays: [1] } },
    });
    const completions = [makeCompletion("2026-01-05")]; // Monday

    const heatmap = buildYearHeatmap([habit], completions, "2026-01-06", 6);

    const monday = heatmap.find((day) => day.date === "2026-01-05");
    const tuesday = heatmap.find((day) => day.date === "2026-01-06");
    expect(monday).toEqual({ date: "2026-01-05", dueCount: 1, completedCount: 1, rate: 1 });
    expect(tuesday).toEqual({ date: "2026-01-06", dueCount: 0, completedCount: 0, rate: 0 });
  });

  it("still counts due days for a habit archived after that date", () => {
    const habit = makeHabit({
      createdAt: "2026-01-01T12:00:00.000Z",
      status: "archived",
      archivedAt: "2026-01-10T12:00:00.000Z",
    });
    const completions = [makeCompletion("2026-01-03")];

    const heatmap = buildYearHeatmap([habit], completions, "2026-01-10", 10);
    const day = heatmap.find((entry) => entry.date === "2026-01-03");

    expect(day).toEqual({ date: "2026-01-03", dueCount: 1, completedCount: 1, rate: 1 });
  });

  it("excludes days after the habit was archived", () => {
    const habit = makeHabit({
      createdAt: "2026-01-01T12:00:00.000Z",
      status: "archived",
      archivedAt: "2026-01-05T12:00:00.000Z",
    });

    const heatmap = buildYearHeatmap([habit], [], "2026-01-10", 10);
    const dayAfterArchive = heatmap.find((entry) => entry.date === "2026-01-06");

    expect(dayAfterArchive?.dueCount).toBe(0);
  });
});

describe("rankWeekdaysByCompletion", () => {
  it("ranks weekdays by completion rate, best first", () => {
    const habit = makeHabit({ createdAt: "2026-01-01T12:00:00.000Z" });
    // Monday 2026-01-05 completed, Tuesday 2026-01-06 not completed
    const completions = [makeCompletion("2026-01-05")];

    const ranking = rankWeekdaysByCompletion([habit], completions, "2026-01-05", "2026-01-06");

    expect(ranking[0]).toMatchObject({ weekday: 1, rate: 1 });
    const tuesday = ranking.find((entry) => entry.weekday === 2);
    expect(tuesday).toMatchObject({ rate: 0 });
  });
});

describe("buildMonthlyTrend", () => {
  it("returns one point per month in chronological order", () => {
    const habit = makeHabit({ createdAt: "2025-11-01T12:00:00.000Z" });
    const completions = [makeCompletion("2026-01-01"), makeCompletion("2026-01-02")];

    const trend = buildMonthlyTrend([habit], completions, "2026-01-02", 3);

    expect(trend).toHaveLength(3);
    expect(trend.map((point) => point.monthStart)).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
    ]);
    expect(trend[2]?.completedCount).toBe(2);
    expect(trend[2]?.rate).toBe(1);
  });
});

describe("compareHabits", () => {
  it("ranks active habits by recent completion rate", () => {
    const strong = makeHabit({ id: "strong", createdAt: "2026-01-01T12:00:00.000Z" });
    const weak = makeHabit({ id: "weak", createdAt: "2026-01-01T12:00:00.000Z" });
    const completions = [
      makeCompletion("2026-01-01", { habitId: "strong" }),
      makeCompletion("2026-01-02", { habitId: "strong" }),
    ];

    const comparison = compareHabits([strong, weak], completions, "2026-01-02", 2);

    expect(comparison[0]?.habit.id).toBe("strong");
    expect(comparison[0]?.windowRate).toBe(1);
    expect(comparison[1]?.habit.id).toBe("weak");
    expect(comparison[1]?.windowRate).toBe(0);
  });

  it("excludes archived habits", () => {
    const archived = makeHabit({ status: "archived", archivedAt: "2026-01-02T12:00:00.000Z" });

    const comparison = compareHabits([archived], [], "2026-01-05");

    expect(comparison).toEqual([]);
  });
});
