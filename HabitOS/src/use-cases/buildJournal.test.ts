import { describe, expect, it } from "vitest";

import { buildJournalFromData } from "@/use-cases/buildJournal";
import { makeCompletion, makeHabit } from "@/tests/factories";

describe("buildJournalFromData", () => {
  it("builds a monthly calendar with completion rates", () => {
    const habit = makeHabit({ createdAt: "2026-01-01T12:00:00.000Z" });
    const journal = buildJournalFromData(
      [habit],
      [makeCompletion("2026-01-01"), makeCompletion("2026-01-03")],
      "2026-01-15",
      "2026-01-15",
    );

    expect(journal.monthStart).toBe("2026-01-01");
    expect(journal.monthEnd).toBe("2026-01-31");
    expect(journal.days).toHaveLength(31);
    expect(journal.weeklyCompletion[0]).toMatchObject({ label: "01", completed: 2, required: 7 });
    expect(journal.days[0]).toMatchObject({ date: "2026-01-01", dueCount: 1, completedCount: 1 });
    expect(journal.days[1]).toMatchObject({ date: "2026-01-02", dueCount: 1, completedCount: 0 });
  });

  it("sorts history newest first and keeps archived habit history visible", () => {
    const active = makeHabit({ id: "active", name: "Active" });
    const archived = makeHabit({ id: "archived", name: "Archived", status: "archived" });
    const journal = buildJournalFromData(
      [active, archived],
      [
        makeCompletion("2026-01-02", {
          id: "old",
          habitId: "archived",
          completedAtUtc: "2026-01-02T10:00:00.000Z",
        }),
        makeCompletion("2026-01-03", {
          id: "new",
          habitId: "active",
          completedAtUtc: "2026-01-03T10:00:00.000Z",
        }),
      ],
      "2026-01-15",
      "2026-01-15",
    );

    expect(journal.history.map((item) => item.completion.id)).toEqual(["new", "old"]);
    expect(journal.history[1]?.habit.name).toBe("Archived");
  });

  it("includes habit analytics and weekly consistency", () => {
    const habit = makeHabit({ createdAt: "2026-01-01T12:00:00.000Z" });
    const journal = buildJournalFromData(
      [habit],
      [
        makeCompletion("2026-01-01"),
        makeCompletion("2026-01-02"),
        makeCompletion("2026-01-03"),
        makeCompletion("2026-01-04"),
      ],
      "2026-01-15",
      "2026-01-15",
    );

    expect(journal.habitAnalytics[0]?.analytics.period.requiredCount).toBe(31);
    expect(journal.habitAnalytics[0]?.analytics.period.completedCount).toBe(4);
    expect(journal.habitAnalytics[0]?.weeklyConsistency).toBeGreaterThan(0);
  });
});
