import { db } from '@/lib/store/db';
import { BIBLE_BOOKS, BIBLE_STRUCTURE, countChaptersInRange, getBookIndex } from '@/lib/constants/bible';
import { toLocalDate } from '@/lib/utils/date';

function countBackwardStreak(days: Set<string>) {
  const cursor = new Date();
  let streak = 0;

  while (days.has(toLocalDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getSessionChapterCount(entry: {
  book: string;
  end_book?: string;
  chapter_start: number;
  chapter_end: number;
  verse_start?: number;
  verse_end?: number;
}) {
  const start = {
    book: entry.book,
    chapter: entry.chapter_start,
    verse: entry.verse_start ?? 1
  };
  const end = {
    book: entry.end_book ?? entry.book,
    chapter: entry.chapter_end,
    verse: entry.verse_end ?? 1
  };
  return countChaptersInRange(start, end);
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
    chapters: reading.filter((entry) => inRange(entry.session_at)).reduce((sum, entry) => sum + getSessionChapterCount(entry), 0),
    journals: journals.filter((entry) => inRange(entry.entry_date)).length,
    highlights: highlights.filter((entry) => inRange(entry.updated_at)).length
  };
}

export async function getBibleProgress(userId: string) {
  const sessions = await db.readingSessions.where('user_id').equals(userId).toArray();

  const completionMap = new Map<string, Set<number>>();

  for (const session of sessions) {
    const startBookIndex = getBookIndex(session.book);
    const endBookName = session.end_book ?? session.book;
    const endBookIndex = getBookIndex(endBookName);

    if (startBookIndex < 0 || endBookIndex < 0 || endBookIndex < startBookIndex) {
      continue;
    }

    for (let bookIndex = startBookIndex; bookIndex <= endBookIndex; bookIndex += 1) {
      const book = BIBLE_STRUCTURE[bookIndex];
      if (!book) {
        continue;
      }

      const chapterStart = bookIndex === startBookIndex ? session.chapter_start : 1;
      const chapterEnd = bookIndex === endBookIndex ? session.chapter_end : book.chapters.length;
      const chapters = completionMap.get(book.book) ?? new Set<number>();

      for (let chapter = chapterStart; chapter <= chapterEnd; chapter += 1) {
        chapters.add(chapter);
      }

      completionMap.set(book.book, chapters);
    }
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
        .reduce((sum, entry) => sum + getSessionChapterCount(entry), 0) / 7,
    chaptersPerMonth:
      reading
        .filter((entry) => new Date(entry.session_at) >= monthAgo)
        .reduce((sum, entry) => sum + getSessionChapterCount(entry), 0) / 30,
    journalsPerWeek: journals.filter((entry) => new Date(entry.entry_date) >= weekAgo).length / 7,
    journalsPerMonth: journals.filter((entry) => new Date(entry.entry_date) >= monthAgo).length / 30,
    highlightsPerWeek: highlights.filter((entry) => new Date(entry.updated_at) >= weekAgo).length / 7,
    highlightsPerMonth: highlights.filter((entry) => new Date(entry.updated_at) >= monthAgo).length / 30
  };
}
