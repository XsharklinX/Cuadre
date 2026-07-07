import { create } from "zustand";

import { todayLogicalDate } from "@/dates/logicalDate";
import type { Habit, HabitCompletion, HabitDraft, LogicalDate } from "@/domain/types";
import { createExpoNotificationScheduler, type NotificationScheduler } from "@/native/notificationScheduler";
import { createMmkvStorage } from "@/persistence/mmkvStorage";
import type { HabitRepository } from "@/repositories/habitRepository";
import { LocalHabitRepository } from "@/repositories/localHabitRepository";
import { completeHabitForDate } from "@/use-cases/completeHabitForDate";
import { getDailyHabits, type DailyHabitView } from "@/use-cases/getDailyHabits";
import { archiveHabit, createHabit, updateHabit } from "@/use-cases/saveHabit";
import { undoHabitCompletion } from "@/use-cases/undoHabitCompletion";
import { logDevelopmentError } from "@/utils/logger";

interface HabitStoreDependencies {
  repository: HabitRepository;
  notificationScheduler: NotificationScheduler;
}

interface HabitStoreState {
  habits: Habit[];
  completions: HabitCompletion[];
  dailyHabits: DailyHabitView[];
  selectedDate: LogicalDate;
  isHydrated: boolean;
  errorMessage?: string | undefined;
  hydrate: (timeZone: string) => Promise<void>;
  selectDate: (date: LogicalDate) => Promise<void>;
  createHabit: (draft: HabitDraft) => Promise<Habit | undefined>;
  updateHabit: (habit: Habit) => Promise<Habit | undefined>;
  archiveHabit: (habitId: string) => Promise<Habit | undefined>;
  completeHabit: (habitId: string, timeZone: string) => Promise<void>;
  undoCompletion: (habitId: string) => Promise<void>;
  requestNotificationPermission: () => Promise<boolean>;
  clearError: () => void;
}

let dependencies: HabitStoreDependencies | undefined;

export function configureHabitStore(nextDependencies: HabitStoreDependencies): void {
  dependencies = nextDependencies;
}

function getDependencies(): HabitStoreDependencies {
  if (!dependencies) {
    dependencies = {
      repository: new LocalHabitRepository(createMmkvStorage()),
      notificationScheduler: createExpoNotificationScheduler(),
    };
  }
  return dependencies;
}

function getRepository(): HabitRepository {
  return getDependencies().repository;
}

function syncReminders(habit: Habit): void {
  getDependencies()
    .notificationScheduler.syncHabitReminders(habit)
    .catch(logDevelopmentError);
}

function cancelReminders(habitId: string): void {
  getDependencies()
    .notificationScheduler.cancelHabitReminders(habitId)
    .catch(logDevelopmentError);
}

export const useHabitStore = create<HabitStoreState>((set, get) => ({
  habits: [],
  completions: [],
  dailyHabits: [],
  selectedDate: "1970-01-01",
  isHydrated: false,

  hydrate: async (timeZone) => {
    try {
      await refreshState(set, todayLogicalDate(timeZone), true);
    } catch (error) {
      logDevelopmentError(error);
      set({ errorMessage: "No se pudo cargar el almacenamiento local.", isHydrated: true });
    }
  },

  selectDate: async (date) => {
    try {
      await refreshState(set, date);
    } catch (error) {
      logDevelopmentError(error);
      set({ errorMessage: "No se pudo cambiar la fecha." });
    }
  },

  createHabit: async (draft) => {
    try {
      const habit = await createHabit(getRepository(), draft, new Date().toISOString());
      syncReminders(habit);
      await refreshState(set, get().selectedDate);
      return habit;
    } catch (error) {
      logDevelopmentError(error);
      set({ errorMessage: "No se pudo crear el hábito." });
      return undefined;
    }
  },

  updateHabit: async (habit) => {
    try {
      const updated = await updateHabit(getRepository(), habit);
      syncReminders(updated);
      await refreshState(set, get().selectedDate);
      return updated;
    } catch (error) {
      logDevelopmentError(error);
      set({ errorMessage: "No se pudo actualizar el hábito." });
      return undefined;
    }
  },

  archiveHabit: async (habitId) => {
    try {
      const archived = await archiveHabit(getRepository(), habitId, new Date().toISOString());
      cancelReminders(habitId);
      await refreshState(set, get().selectedDate);
      return archived;
    } catch (error) {
      logDevelopmentError(error);
      set({ errorMessage: "No se pudo archivar el hábito." });
      return undefined;
    }
  },

  completeHabit: async (habitId, timeZone) => {
    try {
      await completeHabitForDate(getRepository(), {
        habitId,
        logicalDate: get().selectedDate,
        completedAtUtc: new Date().toISOString(),
        timeZone,
        source: "app",
      });
      await refreshState(set, get().selectedDate);
    } catch (error) {
      logDevelopmentError(error);
      set({ errorMessage: "No se pudo completar el hábito." });
    }
  },

  undoCompletion: async (habitId) => {
    try {
      await undoHabitCompletion(getRepository(), habitId, get().selectedDate);
      await refreshState(set, get().selectedDate);
    } catch (error) {
      logDevelopmentError(error);
      set({ errorMessage: "No se pudo deshacer el hábito." });
    }
  },

  requestNotificationPermission: async () => {
    try {
      return await getDependencies().notificationScheduler.ensurePermission();
    } catch (error) {
      logDevelopmentError(error);
      return false;
    }
  },

  clearError: () => set({ errorMessage: undefined }),
}));

async function refreshState(
  set: (partial: Partial<HabitStoreState>) => void,
  selectedDate: LogicalDate,
  isHydrated = true,
) {
  const repository = getRepository();
  const [habits, completions, dailyHabits] = await Promise.all([
    repository.listHabits(),
    repository.listCompletions(),
    getDailyHabits(repository, selectedDate),
  ]);
  set({ habits, completions, dailyHabits, selectedDate, isHydrated, errorMessage: undefined });
}
