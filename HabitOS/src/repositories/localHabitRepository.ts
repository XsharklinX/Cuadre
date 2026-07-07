import * as Crypto from "expo-crypto";

import type { Habit, HabitCompletion, HabitDraft } from "@/domain/types";
import type { KeyValueStorage } from "@/persistence/keyValueStorage";
import { hydrateLocalState, persistLocalState } from "@/persistence/migrations";
import type { CompleteHabitInput, HabitRepository } from "@/repositories/habitRepository";

export class LocalHabitRepository implements HabitRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  async listHabits(): Promise<Habit[]> {
    return hydrateLocalState(this.storage).habits.sort((left, right) => left.displayOrder - right.displayOrder);
  }

  async listCompletions(): Promise<HabitCompletion[]> {
    return hydrateLocalState(this.storage).completions;
  }

  async createHabit(draft: HabitDraft, nowUtc: string): Promise<Habit> {
    const state = hydrateLocalState(this.storage);
    const habit: Habit = {
      ...draft,
      id: Crypto.randomUUID(),
      createdAt: nowUtc,
      status: "active",
      reminders: draft.reminders ?? [],
      schemaVersion: 1,
    };

    persistLocalState(this.storage, {
      ...state,
      habits: [...state.habits, habit],
    });

    return habit;
  }

  async updateHabit(habit: Habit): Promise<Habit> {
    const state = hydrateLocalState(this.storage);
    const habits = state.habits.map((candidate) => (candidate.id === habit.id ? habit : candidate));
    persistLocalState(this.storage, { ...state, habits });
    return habit;
  }

  async archiveHabit(habitId: string, archivedAtUtc: string): Promise<Habit> {
    const state = hydrateLocalState(this.storage);
    const habit = state.habits.find((candidate) => candidate.id === habitId);
    if (!habit) {
      throw new Error(`Habit ${habitId} was not found`);
    }

    const archived: Habit = {
      ...habit,
      status: "archived",
      archivedAt: archivedAtUtc,
    };

    persistLocalState(this.storage, {
      ...state,
      habits: state.habits.map((candidate) => (candidate.id === habitId ? archived : candidate)),
    });

    return archived;
  }

  async completeHabit(input: CompleteHabitInput): Promise<{ completion: HabitCompletion; created: boolean }> {
    const state = hydrateLocalState(this.storage);
    const habit = state.habits.find((candidate) => candidate.id === input.habitId);
    if (!habit) {
      throw new Error(`Habit ${input.habitId} was not found`);
    }

    if (habit.status === "archived") {
      throw new Error("Archived habits cannot be completed");
    }

    const existing = state.completions.find(
      (completion) => completion.habitId === input.habitId && completion.logicalDate === input.logicalDate,
    );

    if (existing) {
      return { completion: existing, created: false };
    }

    const completion: HabitCompletion = {
      id: Crypto.randomUUID(),
      habitId: input.habitId,
      logicalDate: input.logicalDate,
      completedAtUtc: input.completedAtUtc,
      timeZone: input.timeZone,
      source: input.source,
      createdAt: input.completedAtUtc,
      updatedAt: input.completedAtUtc,
      schemaVersion: 1,
    };

    persistLocalState(this.storage, {
      ...state,
      completions: [...state.completions, completion],
    });

    return { completion, created: true };
  }

  async undoCompletion(habitId: string, logicalDate: string): Promise<boolean> {
    const state = hydrateLocalState(this.storage);
    const nextCompletions = state.completions.filter(
      (completion) => !(completion.habitId === habitId && completion.logicalDate === logicalDate),
    );

    if (nextCompletions.length === state.completions.length) {
      return false;
    }

    persistLocalState(this.storage, {
      ...state,
      completions: nextCompletions,
    });

    return true;
  }
}
