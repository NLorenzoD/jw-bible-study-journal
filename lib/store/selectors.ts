import { db } from '@/lib/store/db';
import { BIBLE_BOOKS } from '@/lib/constants/bible';
import { toLocalDate } from '@/lib/utils/date';

function countBackwardStreak(days: Set<string>) {
  let cursor = new Date();
  let streak = 0;

  while (days.has(toLocalDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export async function getStreaks(userId: string) {
  const [reading, journals, questions, highlights] = await Promise.all([
    db.readingSessions.where('user_id').equals(userId).toArray(),
    db.journalEntries.where('user_id').equals(userId).toArray(),
    db.questions.where('user_id').equals(userId).toArray(),
    db.highlights.where('user_id').equals(userId).toArray()
  ]);

  const readingDays = new Set(reading.map((entry) => toLocalDate(entry.session_at)));
  const consistencyDays = new Set<string>([
    ...reading.map((entry) => toLocalDate(entry.session_at)),
    ...journals.map((entry) => toLocalDate(entry.entry_date)),
    ...questions.map((entry) => toLocalDate(entry.updated_at)),
    ...highlights.map((entry) => toLocalDate(entry.updated_at))
  ]);

  return {
    readingStreak: countBackwardStreak(readingDays),
    consistencyStreak: countBackwardStreak(consistencyDays),
    totalReadingDays: readingDays.size,
    totalConsistencyDays: consistencyDays.size
  };
}

export async function getWeeklySnapshot(userId: string) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 6);

  const [reading, journals, highlights] = await Promise.all([
    db.readingSessions.where('user_id').equals(userId).toArray(),
    db.journalEntries.where('user_id').equals(userId).toArray(),
    db.highlights.where('user_id').equals(userId).toArray()
  ]);

  const inRange = (isoDate: string) => {
    const date = new Date(isoDate);
    return date >= start && date <= now;
  };

  return {
    chapters: reading.filter((entry) => inRange(entry.session_at)).reduce((sum, entry) => sum + (entry.chapter_end - entry.chapter_start + 1), 0),
    journals: journals.filter((entry) => inRange(entry.entry_date)).length,
    highlights: highlights.filter((entry) => inRange(entry.updated_at)).length
  };
}

export async function getBibleProgress(userId: string) {
  const sessions = await db.readingSessions.where('user_id').equals(userId).toArray();

  const completionMap = new Map<string, Set<number>>();

  for (const session of sessions) {
    const chapters = completionMap.get(session.book) ?? new Set<number>();
    for (let chapter = session.chapter_start; chapter <= session.chapter_end; chapter += 1) {
      chapters.add(chapter);
    }
    completionMap.set(session.book, chapters);
  }

  return BIBLE_BOOKS.map((book) => {
    const completed = completionMap.get(book.name)?.size ?? 0;
    return {
      ...book,
      completed,
      percentage: Math.round((completed / book.chapters) * 100)
    };
  });
}

export async function getTodayActivity(userId: string) {
  const today = toLocalDate(new Date());

  const [reading, journals, questions, highlights] = await Promise.all([
    db.readingSessions.where('user_id').equals(userId).toArray(),
    db.journalEntries.where('user_id').equals(userId).toArray(),
    db.questions.where('user_id').equals(userId).toArray(),
    db.highlights.where('user_id').equals(userId).toArray()
  ]);

  return {
    hasReading: reading.some((entry) => toLocalDate(entry.session_at) === today),
    hasConsistency:
      reading.some((entry) => toLocalDate(entry.session_at) === today) ||
      journals.some((entry) => toLocalDate(entry.entry_date) === today) ||
      questions.some((entry) => toLocalDate(entry.updated_at) === today) ||
      highlights.some((entry) => toLocalDate(entry.updated_at) === today)
  };
}

export async function getStats(userId: string) {
  const [reading, journals, highlights] = await Promise.all([
    db.readingSessions.where('user_id').equals(userId).toArray(),
    db.journalEntries.where('user_id').equals(userId).toArray(),
    db.highlights.where('user_id').equals(userId).toArray()
  ]);

  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  return {
    chaptersPerWeek:
      reading
        .filter((entry) => new Date(entry.session_at) >= weekAgo)
        .reduce((sum, entry) => sum + (entry.chapter_end - entry.chapter_start + 1), 0) / 7,
    chaptersPerMonth:
      reading
        .filter((entry) => new Date(entry.session_at) >= monthAgo)
        .reduce((sum, entry) => sum + (entry.chapter_end - entry.chapter_start + 1), 0) / 30,
    journalsPerWeek: journals.filter((entry) => new Date(entry.entry_date) >= weekAgo).length / 7,
    journalsPerMonth: journals.filter((entry) => new Date(entry.entry_date) >= monthAgo).length / 30,
    highlightsPerWeek: highlights.filter((entry) => new Date(entry.updated_at) >= weekAgo).length / 7,
    highlightsPerMonth: highlights.filter((entry) => new Date(entry.updated_at) >= monthAgo).length / 30
  };
}
