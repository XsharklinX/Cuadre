import type { Habit, HabitCompletion } from "@/domain/types";
import type { KeyValueStorage } from "@/persistence/keyValueStorage";
import {
  COMPLETIONS_KEY,
  CURRENT_SCHEMA_VERSION,
  HABITS_KEY,
  META_KEY,
  persistedStateSchema,
} from "@/persistence/schema";

interface PersistedMeta {
  schemaVersion: number;
}

export interface HydratedLocalState {
  habits: Habit[];
  completions: HabitCompletion[];
  schemaVersion: number;
}

export function hydrateLocalState(storage: KeyValueStorage): HydratedLocalState {
  const meta = readJson<PersistedMeta>(storage, META_KEY) ?? { schemaVersion: 0 };
  if (meta.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported local schema version ${meta.schemaVersion}`);
  }

  if (meta.schemaVersion === 0) {
    storage.setString(META_KEY, JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION }));
    storage.setString(HABITS_KEY, JSON.stringify([]));
    storage.setString(COMPLETIONS_KEY, JSON.stringify([]));
    return { habits: [], completions: [], schemaVersion: CURRENT_SCHEMA_VERSION };
  }

  const candidate = {
    schemaVersion: meta.schemaVersion,
    habits: readJson<unknown[]>(storage, HABITS_KEY) ?? [],
    completions: readJson<unknown[]>(storage, COMPLETIONS_KEY) ?? [],
  };

  const parsed = persistedStateSchema.parse(candidate);
  return parsed;
}

export function persistLocalState(storage: KeyValueStorage, state: HydratedLocalState): void {
  const parsed = persistedStateSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    habits: state.habits,
    completions: state.completions,
  });

  storage.setString(META_KEY, JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION }));
  storage.setString(HABITS_KEY, JSON.stringify(parsed.habits));
  storage.setString(COMPLETIONS_KEY, JSON.stringify(parsed.completions));
}

function readJson<T>(storage: KeyValueStorage, key: string): T | undefined {
  const raw = storage.getString(key);
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw) as T;
}
