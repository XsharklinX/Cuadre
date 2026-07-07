import { describe, expect, it } from "vitest";

import { calculateHabitAnalytics, calculatePeriodStats } from "@/domain/statistics";
import { makeCompletion, makeHabit } from "@/tests/factories";

describe("period statistics", () => {
  it("calculates completion rate for daily habits", () => {
    const habit = makeHabit({ createdAt: "2026-01-01T12:00:00.000Z" });
    const stats = calculatePeriodStats(
      habit,
      [makeCompletion("2026-01-01"), makeCompletion("2026-01-03")],
      "2026-01-01",
      "2026-01-03",
    );

    expect(stats).toEqual({ requiredCount: 3, completedCount: 2, completionRate: 2 / 3 });
  });

  it("caps weekly target completions at the required count", () => {
    const habit = makeHabit({
      createdAt: "2026-01-01T12:00:00.000Z",
      goal: {
        type: "single",
        frequency: { type: "times_per_week", targetCount: 2, weekStartsOn: 1 },
      },
    });
    const stats = calculatePeriodStats(
      habit,
      [makeCompletion("2026-01-05"), makeCompletion("2026-01-06"), makeCompletion("2026-01-07")],
      "2026-01-05",
      "2026-01-11",
    );

    expect(stats).toEqual({ requiredCount: 2, completedCount: 2, completionRate: 1 });
  });

  it("compares the selected period with the previous period", () => {
    const habit = makeHabit({ createdAt: "2026-01-01T12:00:00.000Z" });
    const analytics = calculateHabitAnalytics(
      habit,
      [makeCompletion("2026-01-01"), makeCompletion("2026-01-03"), makeCompletion("2026-01-04")],
      "2026-01-03",
      "2026-01-04",
      "2026-01-04",
    );

    expect(analytics.period.completionRate).toBe(1);
    expect(analytics.previousPeriod.completionRate).toBe(0.5);
    expect(analytics.periodDelta).toBe(0.5);
  });
});
