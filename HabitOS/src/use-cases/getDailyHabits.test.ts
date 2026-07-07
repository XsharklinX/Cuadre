import { describe, expect, it } from "vitest";

import { selectDailyHabits } from "@/use-cases/getDailyHabits";
import { makeCompletion, makeHabit } from "@/tests/factories";

describe("selectDailyHabits", () => {
  it("returns only active habits due on the selected logical date", () => {
    const daily = makeHabit({ id: "daily", displayOrder: 2 });
    const mondayOnly = makeHabit({
      id: "monday",
      displayOrder: 1,
      goal: { type: "single", frequency: { type: "specific_weekdays", weekdays: [1] } },
    });
    const archived = makeHabit({ id: "archived", status: "archived", displayOrder: 0 });

    const result = selectDailyHabits(
      [daily, mondayOnly, archived],
      [makeCompletion("2026-01-05", { habitId: "monday" })],
      "2026-01-05",
    );

    expect(result.map((item) => item.habit.id)).toEqual(["monday", "daily"]);
    expect(result[0]?.isCompleted).toBe(true);
    expect(result[1]?.isCompleted).toBe(false);
  });
});
