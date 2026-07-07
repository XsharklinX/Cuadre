import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { Habit, HabitReminder, Weekday } from "@/domain/types";
import { isoWeekdayToExpoWeekday } from "@/native/weekdayMapping";

const ANDROID_CHANNEL_ID = "habitos-reminders";
const HABIT_ID_DATA_KEY = "habitId";

export interface NotificationScheduler {
  ensurePermission(): Promise<boolean>;
  syncHabitReminders(habit: Habit): Promise<void>;
  cancelHabitReminders(habitId: string): Promise<void>;
}

let channelReady = false;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android" || channelReady) {
    return;
  }
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Recordatorios de hábitos",
    importance: Notifications.AndroidImportance.HIGH,
  });
  channelReady = true;
}

async function cancelScheduledForHabit(habitId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter(
    (notification) => notification.content.data?.[HABIT_ID_DATA_KEY] === habitId,
  );
  await Promise.all(
    toCancel.map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)),
  );
}

async function scheduleReminder(habit: Habit, reminder: HabitReminder): Promise<void> {
  const weekdays = reminder.weekdays ?? habitFrequencyWeekdays(habit);
  const content = {
    title: `${habit.icon} ${habit.name}`,
    body: "Es hora de tu hábito. ¡No rompas la racha!",
    data: { [HABIT_ID_DATA_KEY]: habit.id, reminderId: reminder.id },
  };

  if (!weekdays) {
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: reminder.hour,
        minute: reminder.minute,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
    return;
  }

  await Promise.all(
    weekdays.map((weekday) =>
      Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: isoWeekdayToExpoWeekday(weekday),
          hour: reminder.hour,
          minute: reminder.minute,
          channelId: ANDROID_CHANNEL_ID,
        },
      }),
    ),
  );
}

function habitFrequencyWeekdays(habit: Habit): Weekday[] | undefined {
  return habit.goal.frequency.type === "specific_weekdays" ? habit.goal.frequency.weekdays : undefined;
}

export function createExpoNotificationScheduler(): NotificationScheduler {
  return {
    async ensurePermission() {
      const current = await Notifications.getPermissionsAsync();
      if (current.granted) {
        return true;
      }
      const requested = await Notifications.requestPermissionsAsync();
      return requested.granted;
    },

    async syncHabitReminders(habit) {
      await ensureAndroidChannel();
      await cancelScheduledForHabit(habit.id);

      if (habit.status === "archived") {
        return;
      }

      for (const reminder of habit.reminders) {
        if (reminder.enabled) {
          await scheduleReminder(habit, reminder);
        }
      }
    },

    async cancelHabitReminders(habitId) {
      await cancelScheduledForHabit(habitId);
    },
  };
}
