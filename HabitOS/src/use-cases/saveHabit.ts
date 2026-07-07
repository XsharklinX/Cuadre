import type { Habit, HabitDraft } from "@/domain/types";
import type { HabitRepository } from "@/repositories/habitRepository";

export async function createHabit(
  repository: HabitRepository,
  draft: HabitDraft,
  nowUtc: string,
): Promise<Habit> {
  return repository.createHabit(draft, nowUtc);
}

export async function updateHabit(repository: HabitRepository, habit: Habit): Promise<Habit> {
  return repository.updateHabit(habit);
}

export async function archiveHabit(
  repository: HabitRepository,
  habitId: string,
  archivedAtUtc: string,
): Promise<Habit> {
  return repository.archiveHabit(habitId, archivedAtUtc);
}
