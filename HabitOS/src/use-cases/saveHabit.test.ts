import { describe, expect, it, vi } from "vitest";

import { InMemoryKeyValueStorage } from "@/persistence/keyValueStorage";
import { LocalHabitRepository } from "@/repositories/localHabitRepository";
import { archiveHabit, createHabit, updateHabit } from "@/use-cases/saveHabit";

vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "fixed-id"),
}));

describe("saveHabit use cases", () => {
  it("creates, edits frequency, and archives a habit", async () => {
    const repository = new LocalHabitRepository(new InMemoryKeyValueStorage());

    const habit = await createHabit(
      repository,
      {
        name: "Read",
        icon: "B",
        color: "#22c55e",
        referenceTimeZone: "America/Santo_Domingo",
        goal: { type: "single", frequency: { type: "daily" } },
        reminders: [],
        displayOrder: 0,
      },
      "2026-01-01T12:00:00.000Z",
    );

    const edited = await updateHabit(repository, {
      ...habit,
      goal: {
        type: "single",
        frequency: { type: "specific_weekdays", weekdays: [1, 3, 5] },
      },
    });

    const archived = await archiveHabit(repository, edited.id, "2026-01-01T12:10:00.000Z");

    expect((await repository.listHabits())[0]?.goal.frequency).toEqual({
      type: "specific_weekdays",
      weekdays: [1, 3, 5],
    });
    expect(archived.status).toBe("archived");
  });
});
