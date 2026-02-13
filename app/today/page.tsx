'use client';

import { motion } from 'framer-motion';
import { CalendarDays, Clock3, Sparkles } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { CylindricalWheelPicker } from '@/components/shared/cylindrical-wheel-picker';
import { Input, Select, Textarea } from '@/components/shared/inputs';
import {
  BIBLE_BOOKS,
  compareReferences,
  getBookIndex,
  getBookStructure,
  getChapterVerseCount,
  getNextReference
} from '@/lib/constants/bible';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { fetchLinkMetadata } from '@/lib/firebase/link-metadata';
import { db } from '@/lib/store/db';
import {
  addHighlight,
  addJournalEntry,
  addLinkReference,
  addProject,
  addQuestion,
  addReadingSession,
  createId
} from '@/lib/store/repository';
import { getStreaks, getTodayActivity, getWeeklySnapshot } from '@/lib/store/selectors';
import { cn } from '@/lib/utils/cn';

const cardAnimation = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 }
};

const MAX_READING_BACKDATE_DAYS = 5;

function getReadingSessionBounds(now = new Date()) {
  const latest = new Date(now);
  const earliest = new Date(now.getTime() - MAX_READING_BACKDATE_DAYS * 24 * 60 * 60 * 1000);
  return { earliest, latest };
}

function rangeOptions(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function pad2(value: number) {
  return `${value}`.padStart(2, '0');
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getRelativeDayLabel(target: Date, now = new Date()) {
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffMs = startOfNow.getTime() - startOfTarget.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(target);
}

function formatDurationLabel(totalMinutes: number) {
  if (totalMinutes <= 0) {
    return 'Optional minutes';
  }

  if (totalMinutes <= 120) {
    return `${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'}`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} minutes`;
}

function buildDurationOptions() {
  const options: Array<{ value: string; label: string }> = [];

  for (let minute = 1; minute <= 120; minute += 1) {
    options.push({
      value: `${minute}`,
      label: `${minute} ${minute === 1 ? 'minute' : 'minutes'}`
    });
  }

  for (let minute = 130; minute <= 360; minute += 10) {
    options.push({
      value: `${minute}`,
      label: formatDurationLabel(minute)
    });
  }

  return options;
}

export default function TodayPage() {
  const { userId, householdId } = useUserContext();
  const now = new Date();

  const projects = useLiveQuery(
    () => db.projects.where('user_id').equals(userId).reverse().sortBy('updated_at'),
    [userId],
    []
  );

  const streaks = useLiveQuery(() => getStreaks(userId), [userId]);
  const todayActivity = useLiveQuery(() => getTodayActivity(userId), [userId]);
  const latestReadingSession = useLiveQuery(async () => {
    const sessions = await db.readingSessions.where('user_id').equals(userId).toArray();
    const sorted = sessions.sort((left, right) => right.session_at.localeCompare(left.session_at));
    return sorted[0] ?? null;
  }, [userId], null);

  const [readingForm, setReadingForm] = useState({
    endBook: 'Genesis',
    endChapter: 1,
    endVerse: 1,
    sessionDate: toDateInputValue(now),
    sessionHour: now.getHours(),
    sessionMinute: now.getMinutes(),
    durationMinutes: '',
    note: ''
  });

  const [journalBody, setJournalBody] = useState('');
  const [journalTags, setJournalTags] = useState('');

  const [highlightReference, setHighlightReference] = useState('');
  const [highlightSummary, setHighlightSummary] = useState('');
  const [highlightTags, setHighlightTags] = useState('');
  const [highlightLinks, setHighlightLinks] = useState('');

  const [selectedProjectId, setSelectedProjectId] = useState('__new__');
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [questionText, setQuestionText] = useState('');

  const [showSnapshot, setShowSnapshot] = useState(false);
  const weeklySnapshot = useLiveQuery(() => (showSnapshot ? getWeeklySnapshot(userId) : Promise.resolve(null)), [showSnapshot, userId]);

  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [isDurationPickerOpen, setIsDurationPickerOpen] = useState(false);
  const dateTimePickerRef = useRef<HTMLDivElement | null>(null);
  const durationPickerRef = useRef<HTMLDivElement | null>(null);
  const lastAppliedStartRef = useRef<string | null>(null);

  const startReference = useMemo(() => {
    if (!latestReadingSession) {
      return { book: 'Genesis', chapter: 1, verse: 1 };
    }

    const lastEnd = {
      book: latestReadingSession.end_book ?? latestReadingSession.book,
      chapter: latestReadingSession.chapter_end,
      verse: latestReadingSession.verse_end ?? latestReadingSession.verse_start ?? 1
    };
    return getNextReference(lastEnd);
  }, [latestReadingSession]);

  useEffect(() => {
    const key = `${startReference.book}:${startReference.chapter}:${startReference.verse}`;
    if (lastAppliedStartRef.current === key) {
      return;
    }
    lastAppliedStartRef.current = key;

    setReadingForm((prev) => ({
      ...prev,
      endBook: startReference.book,
      endChapter: startReference.chapter,
      endVerse: startReference.verse,
      sessionDate: toDateInputValue(new Date()),
      sessionHour: new Date().getHours(),
      sessionMinute: new Date().getMinutes(),
      durationMinutes: '',
      note: ''
    }));
  }, [startReference]);

  useEffect(() => {
    if (!isTimePickerOpen && !isDurationPickerOpen) {
      return;
    }

    function onWindowClick(event: MouseEvent) {
      const target = event.target as Node;
      const inDatePicker = dateTimePickerRef.current?.contains(target);
      const inDurationPicker = durationPickerRef.current?.contains(target);
      if (inDatePicker || inDurationPicker) {
        return;
      }
      setIsTimePickerOpen(false);
      setIsDurationPickerOpen(false);
    }

    window.addEventListener('click', onWindowClick);
    return () => window.removeEventListener('click', onWindowClick);
  }, [isDurationPickerOpen, isTimePickerOpen]);

  const startBookStructure = useMemo(() => getBookStructure(startReference.book), [startReference.book]);
  const startBookIndex = getBookIndex(startReference.book);
  const endBookOptions = useMemo(
    () =>
      BIBLE_BOOKS.slice(startBookIndex < 0 ? 0 : startBookIndex).map((book) => ({
        value: book.name,
        label: book.name
      })),
    [startBookIndex]
  );

  const endBookStructure = useMemo(() => getBookStructure(readingForm.endBook), [readingForm.endBook]);
  const endChapterMin = readingForm.endBook === startReference.book ? startReference.chapter : 1;
  const endChapterMax = endBookStructure?.chapters.length ?? 1;
  const endChapterOptions = useMemo(
    () =>
      rangeOptions(endChapterMin, endChapterMax).map((chapter) => ({
        value: chapter.toString(),
        label: `Ch ${chapter}`
      })),
    [endChapterMin, endChapterMax]
  );

  const endVerseMin =
    readingForm.endBook === startReference.book && readingForm.endChapter === startReference.chapter ? startReference.verse : 1;
  const endVerseMax = getChapterVerseCount(readingForm.endBook, readingForm.endChapter);
  const endVerseOptions = useMemo(
    () =>
      rangeOptions(endVerseMin, endVerseMax).map((verse) => ({
        value: verse.toString(),
        label: `V ${verse}`
      })),
    [endVerseMin, endVerseMax]
  );

  const startBookOptions = useMemo(
    () => BIBLE_BOOKS.map((book) => ({ value: book.name, label: book.name })),
    []
  );
  const startChapterOptions = useMemo(
    () =>
      rangeOptions(1, startBookStructure?.chapters.length ?? 1).map((chapter) => ({
        value: chapter.toString(),
        label: `Ch ${chapter}`
      })),
    [startBookStructure?.chapters.length]
  );
  const startVerseOptions = useMemo(
    () =>
      rangeOptions(1, getChapterVerseCount(startReference.book, startReference.chapter)).map((verse) => ({
        value: verse.toString(),
        label: `V ${verse}`
      })),
    [startReference.book, startReference.chapter]
  );

  const hourOptions = useMemo(
    () => rangeOptions(0, 23).map((hour) => ({ value: `${hour}`, label: pad2(hour) })),
    []
  );
  const minuteOptions = useMemo(
    () => rangeOptions(0, 59).map((minute) => ({ value: `${minute}`, label: pad2(minute) })),
    []
  );
  const durationOptions = useMemo(() => buildDurationOptions(), []);
  const dayOptions = useMemo(
    () =>
      rangeOptions(0, MAX_READING_BACKDATE_DAYS).map((offset) => {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        const dateValue = toDateInputValue(date);
        return {
          value: dateValue,
          label: getRelativeDayLabel(date)
        };
      }),
    []
  );
  const sessionDateDisplay = useMemo(() => {
    if (!readingForm.sessionDate) {
      return 'Today';
    }
    const [year, month, day] = readingForm.sessionDate.split('-').map(Number);
    const selected = new Date(year, (month ?? 1) - 1, day ?? 1);
    if (Number.isNaN(selected.getTime())) {
      return 'Today';
    }
    return getRelativeDayLabel(selected);
  }, [readingForm.sessionDate]);
  const sessionTimeDisplay = `${pad2(readingForm.sessionHour)}:${pad2(readingForm.sessionMinute)}`;
  const durationDisplay = readingForm.durationMinutes
    ? formatDurationLabel(Number(readingForm.durationMinutes))
    : 'Optional minutes';

  async function onSubmitReading(event: FormEvent) {
    event.preventDefault();

    const selectedSessionDate = new Date(
      `${readingForm.sessionDate}T${pad2(readingForm.sessionHour)}:${pad2(readingForm.sessionMinute)}:00`
    );
    if (Number.isNaN(selectedSessionDate.getTime())) {
      setStatus({ tone: 'error', message: 'Please choose a valid reading date and time.' });
      return;
    }

    const { earliest, latest } = getReadingSessionBounds();
    if (selectedSessionDate < earliest) {
      setStatus({
        tone: 'error',
        message: `Backdating is limited to the last ${MAX_READING_BACKDATE_DAYS} days.`
      });
      return;
    }

    if (selectedSessionDate > latest) {
      setStatus({ tone: 'error', message: 'Reading date/time cannot be in the future.' });
      return;
    }

    const endReference = {
      book: readingForm.endBook,
      chapter: Number(readingForm.endChapter),
      verse: Number(readingForm.endVerse)
    };

    if (compareReferences(endReference, startReference) < 0) {
      setStatus({ tone: 'error', message: 'End reference cannot be before the automatic start reference.' });
      return;
    }

    const maxEndVerse = getChapterVerseCount(endReference.book, endReference.chapter);
    if (endReference.verse < 1 || endReference.verse > maxEndVerse) {
      setStatus({ tone: 'error', message: 'Please choose a valid ending verse.' });
      return;
    }

    const rawDuration = readingForm.durationMinutes.trim();
    const parsedDuration = rawDuration === '' ? undefined : Number(rawDuration);
    if (parsedDuration !== undefined && (!Number.isInteger(parsedDuration) || parsedDuration <= 0)) {
      setStatus({ tone: 'error', message: 'Duration must be a whole number of minutes.' });
      return;
    }

    await addReadingSession({
      id: createId(),
      user_id: userId,
      household_id: householdId,
      session_at: selectedSessionDate.toISOString(),
      book: startReference.book,
      end_book: endReference.book,
      chapter_start: startReference.chapter,
      chapter_end: endReference.chapter,
      verse_start: startReference.verse,
      verse_end: endReference.verse,
      duration_minutes: parsedDuration,
      verse_range:
        startReference.book === endReference.book
          ? `${startReference.chapter}:${startReference.verse}-${endReference.chapter}:${endReference.verse}`
          : `${startReference.book} ${startReference.chapter}:${startReference.verse}-${endReference.book} ${endReference.chapter}:${endReference.verse}`,
      note: readingForm.note || undefined
    });

    setReadingForm((prev) => ({
      ...prev,
      sessionDate: toDateInputValue(new Date()),
      sessionHour: new Date().getHours(),
      sessionMinute: new Date().getMinutes(),
      durationMinutes: '',
      note: ''
    }));
    setStatus({ tone: 'success', message: 'Reading session saved' });
  }

  async function onSubmitJournal(event: FormEvent) {
    event.preventDefault();

    if (!journalBody.trim()) {
      return;
    }

    await addJournalEntry({
      id: createId(),
      user_id: userId,
      household_id: householdId,
      entry_date: new Date().toISOString(),
      body: journalBody.trim(),
      tags: journalTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      conflict_of: null,
      is_conflict_copy: false
    });

    setJournalBody('');
    setJournalTags('');
    setStatus({ tone: 'success', message: 'Journal entry saved' });
  }

  async function onSubmitHighlight(event: FormEvent) {
    event.preventDefault();

    if (!highlightReference.trim() || !highlightSummary.trim()) {
      return;
    }

    const highlightId = createId();

    await addHighlight({
      id: highlightId,
      user_id: userId,
      household_id: householdId,
      reference: highlightReference.trim(),
      summary: highlightSummary.trim(),
      tags: highlightTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      project_id: null,
      shared_to_household: false
    });

    const links = highlightLinks
      .split(/\s+/)
      .map((url) => url.trim())
      .filter(Boolean);

    const metadataTasks = links.map(async (url) => {
      const metadata = await fetchLinkMetadata(url);
      await addLinkReference({
        id: createId(),
        user_id: userId,
        household_id: householdId,
        parent_type: 'highlight',
        parent_id: highlightId,
        shared_to_household: false,
        url,
        title: metadata?.title,
        publication_name: metadata?.publication_name,
        section_heading: metadata?.section_heading
      });
    });

    await Promise.allSettled(metadataTasks);

    setHighlightReference('');
    setHighlightSummary('');
    setHighlightTags('');
    setHighlightLinks('');
    setStatus({ tone: 'success', message: 'Highlight saved (links captured with fallback)' });
  }

  async function onSubmitProjectQuestion(event: FormEvent) {
    event.preventDefault();

    if (!questionText.trim()) {
      return;
    }

    let projectId = selectedProjectId;

    if (selectedProjectId === '__new__') {
      if (!newProjectTitle.trim()) {
        return;
      }

      const project = await addProject({
        id: createId(),
        user_id: userId,
        household_id: householdId,
        title: newProjectTitle.trim(),
        description: '',
        archived: false
      });

      projectId = project.id;
      setNewProjectTitle('');
    }

    await addQuestion({
      id: createId(),
      user_id: userId,
      household_id: householdId,
      project_id: projectId,
      question: questionText.trim(),
      status: 'open',
      notes: '',
      conclusion: '',
      shareable_insight: '',
      conflict_of: null,
      is_conflict_copy: false
    });

    setQuestionText('');
    setStatus({ tone: 'success', message: 'Project question saved' });
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3">
        <motion.div {...cardAnimation} transition={{ delay: 0.04 }}>
          <Card className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted">Consistency streak</p>
            <p className="font-display text-4xl text-ink">{streaks?.consistencyStreak ?? 0}</p>
            <p className="text-xs text-muted">{todayActivity?.hasConsistency ? 'Completed today' : 'No activity yet today'}</p>
          </Card>
        </motion.div>
        <motion.div {...cardAnimation} transition={{ delay: 0.08 }}>
          <Card className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted">Reading streak</p>
            <p className="font-display text-4xl text-ink">{streaks?.readingStreak ?? 0}</p>
            <p className="text-xs text-muted">{todayActivity?.hasReading ? 'Reading logged today' : 'Log reading to keep it alive'}</p>
          </Card>
        </motion.div>
      </section>

      <motion.div {...cardAnimation} transition={{ delay: 0.12 }} className={cn(isTimePickerOpen && 'relative z-[120]')}>
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Log Reading Session</h2>
          <form className="space-y-3" onSubmit={onSubmitReading}>
            <p className="text-xs text-muted">Start is set from your last reading checkpoint. Scroll only the end wheels.</p>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Start (Auto)</p>
              <div className="grid grid-cols-3 gap-2">
                <CylindricalWheelPicker
                  disabled
                  options={startBookOptions}
                  value={startReference.book}
                  onChange={() => undefined}
                />
                <CylindricalWheelPicker
                  disabled
                  options={startChapterOptions}
                  value={startReference.chapter.toString()}
                  onChange={() => undefined}
                />
                <CylindricalWheelPicker
                  disabled
                  options={startVerseOptions}
                  value={startReference.verse.toString()}
                  onChange={() => undefined}
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">End (Scroll to Select)</p>
              <div className="grid grid-cols-3 gap-2">
                <CylindricalWheelPicker
                  options={endBookOptions}
                  value={readingForm.endBook}
                  onChange={(nextBook) => {
                    const nextMinChapter = nextBook === startReference.book ? startReference.chapter : 1;
                    const nextMaxChapter = getBookStructure(nextBook)?.chapters.length ?? 1;
                    const nextChapter = Math.min(Math.max(readingForm.endChapter, nextMinChapter), nextMaxChapter);
                    const nextMinVerse = nextBook === startReference.book && nextChapter === startReference.chapter ? startReference.verse : 1;
                    const nextMaxVerse = getChapterVerseCount(nextBook, nextChapter);
                    const nextVerse = Math.min(Math.max(readingForm.endVerse, nextMinVerse), nextMaxVerse);

                    setReadingForm({
                      ...readingForm,
                      endBook: nextBook,
                      endChapter: nextChapter,
                      endVerse: nextVerse
                    });
                  }}
                />
                <CylindricalWheelPicker
                  options={endChapterOptions}
                  value={readingForm.endChapter.toString()}
                  onChange={(nextChapterValue) => {
                    const nextChapter = Number(nextChapterValue);
                    const nextMinVerse =
                      readingForm.endBook === startReference.book && nextChapter === startReference.chapter ? startReference.verse : 1;
                    const nextMaxVerse = getChapterVerseCount(readingForm.endBook, nextChapter);
                    const nextVerse = Math.min(Math.max(readingForm.endVerse, nextMinVerse), nextMaxVerse);
                    setReadingForm({
                      ...readingForm,
                      endChapter: nextChapter,
                      endVerse: nextVerse
                    });
                  }}
                />
                <CylindricalWheelPicker
                  options={endVerseOptions}
                  value={readingForm.endVerse.toString()}
                  onChange={(nextVerseValue) => setReadingForm({ ...readingForm, endVerse: Number(nextVerseValue) })}
                />
              </div>
            </div>
            <div ref={dateTimePickerRef} className="relative grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDurationPickerOpen(false);
                  setIsTimePickerOpen((current) => !current);
                }}
                className="flex h-[42px] items-center justify-between rounded-xl border border-muted/20 bg-surface px-3 text-sm text-ink transition hover:border-accent/40"
              >
                <span>
                  {sessionDateDisplay}, {sessionTimeDisplay}
                </span>
                <CalendarDays className="h-4 w-4 text-muted" />
              </button>
              <div ref={durationPickerRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsTimePickerOpen(false);
                    setIsDurationPickerOpen((current) => !current);
                  }}
                  className="flex h-[42px] w-full items-center justify-between rounded-xl border border-muted/20 bg-surface px-3 text-sm text-ink transition hover:border-accent/40"
                >
                  <span className={readingForm.durationMinutes ? 'text-ink' : 'text-muted'}>{durationDisplay}</span>
                  <Clock3 className="h-4 w-4 text-muted" />
                </button>

                {isDurationPickerOpen && (
                  <div className="absolute bottom-[calc(100%+0.5rem)] right-0 z-[150] w-[min(20rem,80vw)] rounded-2xl border border-sky-500/35 bg-card/95 p-3 shadow-[0_16px_42px_rgba(30,64,175,0.28)] backdrop-blur">
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">Duration</p>
                      <CylindricalWheelPicker
                        tone="blue"
                        options={durationOptions}
                        value={readingForm.durationMinutes || '1'}
                        onChange={(value) => setReadingForm({ ...readingForm, durationMinutes: value })}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="flex-1"
                          onClick={() => setReadingForm({ ...readingForm, durationMinutes: '' })}
                        >
                          Clear
                        </Button>
                        <Button type="button" className="flex-1 bg-sky-600 hover:bg-sky-700" onClick={() => setIsDurationPickerOpen(false)}>
                          Done
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {isTimePickerOpen && (
                <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-[140] rounded-2xl border border-sky-500/35 bg-card/95 p-3 shadow-[0_16px_42px_rgba(30,64,175,0.28)] backdrop-blur">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted">Date</p>
                        <p className="text-[11px] text-muted">Backdate max 5 days</p>
                      </div>
                      <CylindricalWheelPicker
                        tone="blue"
                        options={dayOptions}
                        value={readingForm.sessionDate}
                        onChange={(value) => setReadingForm({ ...readingForm, sessionDate: value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">Time</p>
                      <div className="grid grid-cols-2 gap-2">
                        <CylindricalWheelPicker
                          tone="blue"
                          options={hourOptions}
                          value={`${readingForm.sessionHour}`}
                          onChange={(value) => setReadingForm({ ...readingForm, sessionHour: Number(value) })}
                        />
                        <CylindricalWheelPicker
                          tone="blue"
                          options={minuteOptions}
                          value={`${readingForm.sessionMinute}`}
                          onChange={(value) => setReadingForm({ ...readingForm, sessionMinute: Number(value) })}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          const current = new Date();
                          setReadingForm({
                            ...readingForm,
                            sessionDate: toDateInputValue(current),
                            sessionHour: current.getHours(),
                            sessionMinute: current.getMinutes()
                          });
                        }}
                      >
                        Use now
                      </Button>
                      <Button type="button" className="flex-1 bg-sky-600 hover:bg-sky-700" onClick={() => setIsTimePickerOpen(false)}>
                        Done
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-muted">You can backdate reading sessions by up to 5 days.</p>
            <Textarea
              value={readingForm.note}
              onChange={(event) => setReadingForm({ ...readingForm, note: event.target.value })}
              placeholder="Optional session note"
              rows={2}
            />
            <Button type="submit" className="w-full">
              Save reading
            </Button>
          </form>
        </Card>
      </motion.div>

      <motion.div {...cardAnimation} transition={{ delay: 0.16 }}>
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Quick Journal Entry</h2>
          <form className="space-y-3" onSubmit={onSubmitJournal}>
            <Textarea
              rows={4}
              value={journalBody}
              onChange={(event) => setJournalBody(event.target.value)}
              placeholder="Write private thoughts, prayers, or observations..."
            />
            <Input
              value={journalTags}
              onChange={(event) => setJournalTags(event.target.value)}
              placeholder="Optional tags (comma separated)"
            />
            <Button type="submit" className="w-full">
              Save journal
            </Button>
          </form>
        </Card>
      </motion.div>

      <motion.div {...cardAnimation} transition={{ delay: 0.2 }}>
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Add Highlight</h2>
          <form className="space-y-3" onSubmit={onSubmitHighlight}>
            <Input
              value={highlightReference}
              onChange={(event) => setHighlightReference(event.target.value)}
              placeholder="Reference (e.g. John 3:16)"
            />
            <Textarea
              rows={2}
              value={highlightSummary}
              onChange={(event) => setHighlightSummary(event.target.value)}
              placeholder="1-2 line summary"
            />
            <Input
              value={highlightLinks}
              onChange={(event) => setHighlightLinks(event.target.value)}
              placeholder="Optional jw.org / wol.jw.org links"
            />
            <Input
              value={highlightTags}
              onChange={(event) => setHighlightTags(event.target.value)}
              placeholder="Optional tags"
            />
            <Button type="submit" className="w-full">
              Save highlight
            </Button>
          </form>
        </Card>
      </motion.div>

      <motion.div {...cardAnimation} transition={{ delay: 0.24 }}>
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Add Project Question</h2>
          <form className="space-y-3" onSubmit={onSubmitProjectQuestion}>
            <Select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
              <option value="__new__">Create new project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </Select>
            {selectedProjectId === '__new__' && (
              <Input
                value={newProjectTitle}
                onChange={(event) => setNewProjectTitle(event.target.value)}
                placeholder="Project title"
              />
            )}
            <Textarea
              rows={2}
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
              placeholder="Question to investigate"
            />
            <Button type="submit" className="w-full">
              Save question
            </Button>
          </form>
        </Card>
      </motion.div>

      <Card className="space-y-3">
        <Button variant="secondary" className="w-full" onClick={() => setShowSnapshot((value) => !value)}>
          {showSnapshot ? 'Hide weekly snapshot' : 'View weekly snapshot'}
        </Button>

        {showSnapshot && weeklySnapshot && (
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-muted">Chapters</p>
              <p className="font-semibold">{weeklySnapshot.chapters}</p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-muted">Journals</p>
              <p className="font-semibold">{weeklySnapshot.journals}</p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-muted">Highlights</p>
              <p className="font-semibold">{weeklySnapshot.highlights}</p>
            </div>
          </div>
        )}
      </Card>

      {status && (
        <Card
          className={`flex items-center gap-2 text-sm text-ink ${
            status.tone === 'success' ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10'
          }`}
        >
          <Sparkles className={`h-4 w-4 ${status.tone === 'success' ? 'text-success' : 'text-warning'}`} />
          {status.message}
        </Card>
      )}
    </div>
  );
}
