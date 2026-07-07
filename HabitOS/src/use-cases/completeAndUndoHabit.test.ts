import { describe, expect, it, vi } from "vitest";

import { InMemoryKeyValueStorage } from "@/persistence/keyValueStorage";
import { LocalHabitRepository } from "@/repositories/localHabitRepository";
import { completeHabitForDate } from "@/use-cases/completeHabitForDate";
import { undoHabitCompletion } from "@/use-cases/undoHabitCompletion";

vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "fixed-id"),
}));

describe("completeHabitForDate and undoHabitCompletion", () => {
  it("persists a completion, then removes it on undo", async () => {
    const repository = new LocalHabitRepository(new InMemoryKeyValueStorage());

    await repository.createHabit({
      name: "Read",
      icon: "book",
      color: "#22c55e",
      referenceTimeZone: "America/Santo_Domingo",
      goal: { type: "single", frequency: { type: "daily" } },
      displayOrder: 0,
    }, "2026-01-01T12:00:00.000Z");

    await completeHabitForDate(repository, {
      habitId: "fixed-id",
      logicalDate: "2026-01-01",
      completedAtUtc: "2026-01-01T13:00:00.000Z",
      timeZone: "America/Santo_Domingo",
      source: "app",
    });

    expect(await repository.listCompletions()).toHaveLength(1);

    const removed = await undoHabitCompletion(repository, "fixed-id", "2026-01-01");

    expect(removed).toBe(true);
    expect(await repository.listCompletions()).toHaveLength(0);
  });

  it("rejects a completion whose UTC timestamp resolves to another logical date", async () => {
    const repository = new LocalHabitRepository(new InMemoryKeyValueStorage());

    await repository.createHabit({
      name: "Read",
      icon: "book",
      color: "#22c55e",
      referenceTimeZone: "America/Santo_Domingo",
      goal: { type: "single", frequency: { type: "daily" } },
      displayOrder: 0,
    }, "2026-01-01T12:00:00.000Z");

    await expect(completeHabitForDate(repository, {
      habitId: "fixed-id",
      logicalDate: "2026-01-02",
      completedAtUtc: "2026-01-01T13:00:00.000Z",
      timeZone: "America/Santo_Domingo",
      source: "app",
    })).rejects.toThrow("Completion date mismatch");
  });
});
