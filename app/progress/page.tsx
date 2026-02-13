'use client';

import { motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';

import { Card } from '@/components/shared/card';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { db } from '@/lib/store/db';
import { getBibleProgress, getStats, getStreaks } from '@/lib/store/selectors';

const milestones = [7, 14, 30, 100];

export default function ProgressPage() {
  const { userId } = useUserContext();
  const streaks = useLiveQuery(() => getStreaks(userId), [userId]);
  const progressByBook = useLiveQuery(() => getBibleProgress(userId), [userId], []);
  const stats = useLiveQuery(() => getStats(userId), [userId]);

  const [selectedBook, setSelectedBook] = useState<string>('');

  const bookSessions = useLiveQuery(async () => {
    if (!selectedBook) {
      return [];
    }

    return db.readingSessions.where('user_id').equals(userId).and((entry) => entry.book === selectedBook).reverse().sortBy('session_at');
  }, [selectedBook, userId]);

  const achievedMilestones = useMemo(
    () => milestones.filter((target) => (streaks?.consistencyStreak ?? 0) >= target),
    [streaks?.consistencyStreak]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Consistency</p>
          <p className="font-display text-4xl">{streaks?.consistencyStreak ?? 0}</p>
          <p className="text-xs text-muted">Current streak days</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Reading</p>
          <p className="font-display text-4xl">{streaks?.readingStreak ?? 0}</p>
          <p className="text-xs text-muted">Current streak days</p>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Milestones</h2>
        <div className="grid grid-cols-4 gap-2">
          {milestones.map((target) => {
            const achieved = achievedMilestones.includes(target);
            return (
              <motion.div
                key={target}
                initial={{ opacity: 0.7, scale: 0.96 }}
                animate={{ opacity: achieved ? 1 : 0.55, scale: achieved ? 1 : 0.96 }}
                className={`rounded-xl border p-2 text-center text-xs ${
                  achieved ? 'border-success/50 bg-success/10' : 'border-muted/20 bg-surface'
                }`}
              >
                <p className="font-semibold">{target}d</p>
              </motion.div>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Bible Progress</h2>
        <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
          {progressByBook.map((book) => (
            <button
              key={book.name}
              onClick={() => setSelectedBook(book.name)}
              className="w-full rounded-xl border border-muted/20 bg-surface p-3 text-left transition hover:border-accent/50"
            >
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{book.name}</span>
                <span className="text-muted">
                  {book.completed}/{book.chapters}
                </span>
              </div>
              <div className="h-2 rounded-full bg-card">
                <div
                  className="h-2 rounded-full bg-accent transition-all"
                  style={{ width: `${book.percentage}%` }}
                  aria-hidden
                />
              </div>
            </button>
          ))}
        </div>
      </Card>

      {selectedBook && (
        <Card className="space-y-3">
          <h3 className="font-display text-xl">{selectedBook} session history</h3>
          <div className="space-y-2 text-sm">
            {(bookSessions ?? []).slice(0, 12).map((session) => (
              <div key={session.id} className="rounded-xl bg-surface p-3">
                <p>
                  Chapter {session.chapter_start}
                  {session.chapter_start !== session.chapter_end ? `-${session.chapter_end}` : ''}
                </p>
                {session.note && <p className="mt-1 text-muted">{session.note}</p>}
              </div>
            ))}
            {!bookSessions?.length && <p className="text-muted">No sessions logged for this book yet.</p>}
          </div>
        </Card>
      )}

      <Card className="space-y-2">
        <h2 className="font-display text-2xl">Stats</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Chapters / week</p>
            <p className="font-semibold">{stats ? stats.chaptersPerWeek.toFixed(1) : '0.0'}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Chapters / month</p>
            <p className="font-semibold">{stats ? stats.chaptersPerMonth.toFixed(1) : '0.0'}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Journal / week</p>
            <p className="font-semibold">{stats ? stats.journalsPerWeek.toFixed(1) : '0.0'}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Highlights / week</p>
            <p className="font-semibold">{stats ? stats.highlightsPerWeek.toFixed(1) : '0.0'}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
