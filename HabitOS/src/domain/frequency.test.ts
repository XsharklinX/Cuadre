import { describe, expect, it } from "vitest";

import { todayLogicalDate } from "@/dates/logicalDate";
import { isHabitDueOnDate } from "@/domain/frequency";
import { makeHabit } from "@/tests/factories";

describe("isHabitDueOnDate", () => {
  it("is due on its creation day even late in the evening in a negative-UTC-offset zone", () => {
    // 22:30 local time in America/Santo_Domingo (UTC-4) is already 02:30 UTC
    // the *next* calendar day. A habit created at that instant must still be
    // due "today" in local terms, not hidden because its raw UTC date looks
    // like tomorrow.
    const timeZone = "America/Santo_Domingo";
    const createdAtUtc = "2026-07-09T02:30:00.000Z";
    const localToday = todayLogicalDate(timeZone, new Date(createdAtUtc));

    const habit = makeHabit({ createdAt: createdAtUtc, referenceTimeZone: timeZone });

    expect(isHabitDueOnDate(habit, localToday)).toBe(true);
  });

  it("is not due before its local creation day", () => {
    const habit = makeHabit({ createdAt: "2026-01-05T12:00:00.000Z", referenceTimeZone: "America/Santo_Domingo" });

    expect(isHabitDueOnDate(habit, "2026-01-04")).toBe(false);
    expect(isHabitDueOnDate(habit, "2026-01-05")).toBe(true);
  });

  it("is never due once archived", () => {
    const habit = makeHabit({ status: "archived" });

    expect(isHabitDueOnDate(habit, "2026-01-05")).toBe(false);
  });
});
