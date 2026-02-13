'use client';

import { useEffect } from 'react';

import { useLiveQuery } from 'dexie-react-hooks';

import { useAuth } from '@/lib/hooks/useAuth';
import { db } from '@/lib/store/db';
import { updateReminderLastShown } from '@/lib/store/repository';

function hasPassedToday(reminderTime: string) {
  const now = new Date();
  const [hours, minutes] = reminderTime.split(':').map(Number);
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  return now >= target;
}

export function useReminderEngine() {
  const { user } = useAuth();

  const reminder = useLiveQuery(async () => {
    if (!user) {
      return null;
    }
    return db.reminders.where('user_id').equals(user.uid).first();
  }, [user?.uid]);

  useEffect(() => {
    if (!reminder?.enabled || !reminder.reminder_time || !hasPassedToday(reminder.reminder_time)) {
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    const lastShown = reminder.last_shown_at ? new Date(reminder.last_shown_at) : null;
    const now = new Date();

    if (lastShown && lastShown.toDateString() === now.toDateString()) {
      return;
    }

    if (Notification.permission === 'default') {
      Notification.requestPermission();
      return;
    }

    if (Notification.permission === 'granted') {
      new Notification('Bible Study Reminder', {
        body: 'Log your reading and journal entry for today.',
        tag: 'daily-study-reminder'
      });
      updateReminderLastShown(reminder.id, now.toISOString());
    }
  }, [reminder]);
}
