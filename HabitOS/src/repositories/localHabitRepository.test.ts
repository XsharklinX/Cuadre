import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemoryKeyValueStorage } from "@/persistence/keyValueStorage";
import { hydrateLocalState } from "@/persistence/migrations";
import { LocalHabitRepository } from "@/repositories/localHabitRepository";

vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "fixed-id"),
}));

describe("LocalHabitRepository", () => {
  let storage: InMemoryKeyValueStorage;
  let repository: LocalHabitRepository;

  beforeEach(() => {
    storage = new InMemoryKeyValueStorage();
    repository = new LocalHabitRepository(storage);
  });

  it("hydrates and migrates empty storage to schema v1", () => {
    const state = hydrateLocalState(storage);

    expect(state.schemaVersion).toBe(1);
    expect(state.habits).toEqual([]);
    expect(state.completions).toEqual([]);
  });

  it("prevents duplicate completions for the same habit and logical date", async () => {
    await repository.createHabit({
      name: "Read",
      icon: "book",
      color: "#22c55e",
      referenceTimeZone: "America/Santo_Domingo",
      goal: { type: "single", frequency: { type: "daily" } },
      displayOrder: 0,
    }, "2026-01-01T12:00:00.000Z");

    const first = await repository.completeHabit({
      habitId: "fixed-id",
      logicalDate: "2026-01-01",
      completedAtUtc: "2026-01-01T12:00:00.000Z",
      timeZone: "America/Santo_Domingo",
      source: "app",
    });
    const second = await repository.completeHabit({
      habitId: "fixed-id",
      logicalDate: "2026-01-01",
      completedAtUtc: "2026-01-01T13:00:00.000Z",
      timeZone: "America/Santo_Domingo",
      source: "widget",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    await expect(repository.listCompletions()).resolves.toHaveLength(1);
  });

  it("rejects completions for archived habits", async () => {
    await repository.createHabit({
      name: "Read",
      icon: "book",
      color: "#22c55e",
      referenceTimeZone: "America/Santo_Domingo",
      goal: { type: "single", frequency: { type: "daily" } },
      displayOrder: 0,
    }, "2026-01-01T12:00:00.000Z");
    await repository.archiveHabit("fixed-id", "2026-01-02T12:00:00.000Z");

    await expect(repository.completeHabit({
      habitId: "fixed-id",
      logicalDate: "2026-01-02",
      completedAtUtc: "2026-01-02T12:00:00.000Z",
      timeZone: "America/Santo_Domingo",
      source: "app",
    })).rejects.toThrow("Archived habits cannot be completed");
  });
});
