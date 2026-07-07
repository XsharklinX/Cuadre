export type HabitId = string;
export type CompletionId = string;
export type LogicalDate = `${number}-${number}-${number}`;
export type IsoUtcTimestamp = string;
export type IanaTimeZone = string;

export type HabitStatus = "active" | "archived";
export type CompletionSource = "app" | "widget" | "import" | "automation";

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type HabitFrequency =
  | {
      type: "daily";
    }
  | {
      type: "specific_weekdays";
      weekdays: Weekday[];
    }
  | {
      type: "times_per_week";
      targetCount: number;
      weekStartsOn: Weekday;
    };

export type HabitGoal =
  | {
      type: "single";
      frequency: HabitFrequency;
    };

export interface HabitReminder {
  id: string;
  enabled: boolean;
  hour: number;
  minute: number;
  weekdays?: Weekday[] | undefined;
}

export interface Habit {
  id: HabitId;
  name: string;
  description?: string | undefined;
  icon: string;
  color: string;
  createdAt: IsoUtcTimestamp;
  archivedAt?: IsoUtcTimestamp | undefined;
  status: HabitStatus;
  referenceTimeZone: IanaTimeZone;
  goal: HabitGoal;
  reminders: HabitReminder[];
  displayOrder: number;
  schemaVersion: 1;
}

export interface HabitCompletion {
  id: CompletionId;
  habitId: HabitId;
  logicalDate: LogicalDate;
  completedAtUtc: IsoUtcTimestamp;
  timeZone: IanaTimeZone;
  source: CompletionSource;
  createdAt: IsoUtcTimestamp;
  updatedAt: IsoUtcTimestamp;
  schemaVersion: 1;
}

export interface HabitDraft {
  name: string;
  description?: string | undefined;
  icon: string;
  color: string;
  referenceTimeZone: IanaTimeZone;
  goal: HabitGoal;
  reminders?: HabitReminder[] | undefined;
  displayOrder: number;
}

export interface HabitStats {
  currentStreak: number;
  bestStreak: number;
  completionRate: number;
}

export interface WidgetHabitSnapshot {
  habitId: HabitId;
  name: string;
  icon: string;
  color: string;
  isCompletedToday: boolean;
}

export interface WidgetSnapshot {
  logicalDate: LogicalDate;
  generatedAtUtc: IsoUtcTimestamp;
  habits: WidgetHabitSnapshot[];
}
