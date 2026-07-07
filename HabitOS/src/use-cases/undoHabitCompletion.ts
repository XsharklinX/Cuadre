import type { LogicalDate } from "@/domain/types";
import type { HabitRepository } from "@/repositories/habitRepository";

export async function undoHabitCompletion(
  repository: HabitRepository,
  habitId: string,
  logicalDate: LogicalDate,
): Promise<boolean> {
  return repository.undoCompletion(habitId, logicalDate);
}
