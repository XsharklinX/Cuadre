import { describe, expect, it } from "vitest";

import { toLogicalDate } from "@/dates/logicalDate";
import { isHabitDueOnDate } from "@/domain/frequency";
import { calculateBestStreak, calculateCurrentStreak } from "@/domain/streaks";
import { makeCompletion, makeHabit } from "@/tests/factories";

describe("daily streaks", () => {
  it("calculates current and best daily streaks", () => {
    const habit = makeHabit();
    const completions = [
      makeCompletion("2026-01-01"),
      makeCompletion("2026-01-02"),
      makeCompletion("2026-01-04"),
      makeCompletion("2026-01-05"),
    ];

    expect(calculateCurrentStreak(habit, completions, "2026-01-05")).toBe(2);
    expect(calculateBestStreak(habit, completions, "2026-01-05")).toBe(2);
  });

  it("handles leap years and month/year boundaries", () => {
    const habit = makeHabit({ createdAt: "2024-02-28T10:00:00.000Z" });
    const completions = [
      makeCompletion("2024-02-28"),
      makeCompletion("2024-02-29"),
      makeCompletion("2024-03-01"),
      makeCompletion("2024-12-31"),
      makeCompletion("2025-01-01"),
    ];

    expect(calculateCurrentStreak(habit, completions, "2024-03-01")).toBe(3);
    expect(calculateCurrentStreak(habit, completions, "2025-01-01")).toBe(2);
  });

  it("uses logical local dates across daylight saving transitions", () => {
    const beforeDstJump = toLogicalDate("2026-03-08T06:30:00.000Z", "America/New_York");
    const afterDstJump = toLogicalDate("2026-03-08T08:30:00.000Z", "America/New_York");

    expect(beforeDstJump).toBe("2026-03-08");
    expect(afterDstJump).toBe("2026-03-08");
  });

  it("uses the target timezone when converting UTC timestamps", () => {
    expect(toLogicalDate("2026-01-01T02:30:00.000Z", "America/Santo_Domingo")).toBe("2025-12-31");
    expect(toLogicalDate("2026-01-01T02:30:00.000Z", "UTC")).toBe("2026-01-01");
  });
});

describe("weekly streaks", () => {
  it("calculates streaks for times-per-week habits", () => {
    const habit = makeHabit({
      createdAt: "2026-01-05T12:00:00.000Z",
      goal: {
        type: "single",
        frequency: { type: "times_per_week", targetCount: 2, weekStartsOn: 1 },
      },
    });
    const completions = [
      makeCompletion("2026-01-05"),
      makeCompletion("2026-01-07"),
      makeCompletion("2026-01-12"),
      makeCompletion("2026-01-15"),
    ];

    expect(calculateCurrentStreak(habit, completions, "2026-01-18")).toBe(2);
    expect(calculateBestStreak(habit, completions, "2026-01-18")).toBe(2);
  });

  it("does not break a weekly streak before the current week closes", () => {
    const habit = makeHabit({
      createdAt: "2026-01-05T12:00:00.000Z",
      goal: {
        type: "single",
        frequency: { type: "times_per_week", targetCount: 2, weekStartsOn: 1 },
      },
    });
    const completions = [
      makeCompletion("2026-01-05"),
      makeCompletion("2026-01-07"),
      makeCompletion("2026-01-12"),
      makeCompletion("2026-01-15"),
    ];

    expect(calculateCurrentStreak(habit, completions, "2026-01-19")).toBe(2);
  });

  it("prorates the first weekly period when the habit starts mid-week", () => {
    const habit = makeHabit({
      createdAt: "2026-01-10T12:00:00.000Z",
      goal: {
        type: "single",
        frequency: { type: "times_per_week", targetCount: 4, weekStartsOn: 1 },
      },
    });
    const completions = [makeCompletion("2026-01-10"), makeCompletion("2026-01-11")];

    expect(calculateBestStreak(habit, completions, "2026-01-11")).toBe(1);
  });

  it("handles habits created mid-week", () => {
    const habit = makeHabit({
      createdAt: "2026-01-07T12:00:00.000Z",
      goal: {
        type: "single",
        frequency: { type: "specific_weekdays", weekdays: [1, 3, 5] },
      },
    });

    expect(isHabitDueOnDate(habit, "2026-01-05")).toBe(false);
    expect(isHabitDueOnDate(habit, "2026-01-07")).toBe(true);
  });

  it("returns zero streak for archived habits", () => {
    const habit = makeHabit({ status: "archived", archivedAt: "2026-01-05T12:00:00.000Z" });

    expect(calculateCurrentStreak(habit, [makeCompletion("2026-01-05")], "2026-01-05")).toBe(0);
    expect(calculateBestStreak(habit, [makeCompletion("2026-01-05")], "2026-01-05")).toBe(0);
  });

  it("uses edited frequency rules from the current habit definition", () => {
    const habit = makeHabit({
      goal: {
        type: "single",
        frequency: { type: "specific_weekdays", weekdays: [1, 3] },
      },
    });

    expect(isHabitDueOnDate(habit, "2026-01-02")).toBe(false);
    expect(isHabitDueOnDate(habit, "2026-01-05")).toBe(true);
  });
});
