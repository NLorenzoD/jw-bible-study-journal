'use client';

import { motion } from 'framer-motion';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useLiveQuery } from 'dexie-react-hooks';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input, Select, Textarea } from '@/components/shared/inputs';
import { TagInput } from '@/components/shared/tag-input';
import { getBookIndex } from '@/lib/constants/bible';
import { getFirebaseDb } from '@/lib/firebase/client';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { db } from '@/lib/store/db';
import { addProject, addQuestion, createId, updateJournalEntry } from '@/lib/store/repository';
import { getBibleProgress, getFamilyDashboard, getStats, getStreaks } from '@/lib/store/selectors';
import { JournalEntry, QuestionStatus } from '@/lib/types';

const milestones = [7, 14, 30, 100];

type DashboardView = 'personal' | 'family';
type ProgressBooksView = 'all' | 'reading';
type JournalTimeFilter = 'last_7_days' | 'by_month' | 'last_year' | 'all';

interface ConvertDialogState {
  entryId: string;
  projectTitle: string;
  projectDescription: string;
  questionText: string;
  questionStatus: QuestionStatus;
}

const PROJECT_TAG = 'Project';

function monthInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

function isProjectTag(tag: string) {
  return tag.trim().toLowerCase() === PROJECT_TAG.toLowerCase();
}

function ensureProjectTag(tags: string[]) {
  if (tags.some((tag) => isProjectTag(tag))) {
    return tags;
  }
  return [...tags, PROJECT_TAG];
}

function suggestProjectTitle(body: string, entryDate: string) {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(entryDate));
    return `Project from ${day}`;
  }

  const firstSentence = normalized.split(/[.!?]/)[0]?.trim() ?? normalized;
  const candidate = firstSentence || normalized;
  return candidate.length > 80 ? `${candidate.slice(0, 80).trim()}...` : candidate;
}

function sessionCoversBook(session: { book: string; end_book?: string }, bookName: string) {
  const start = getBookIndex(session.book);
  const end = getBookIndex(session.end_book ?? session.book);
  const target = getBookIndex(bookName);
  if (start < 0 || end < 0 || target < 0) {
    return false;
  }
  return target >= start && target <= end;
}

export default function ProgressPage() {
  const { userId, householdId } = useUserContext();
  const firestore = getFirebaseDb();

  const [view, setView] = useState<DashboardView>('personal');
  const [progressBooksView, setProgressBooksView] = useState<ProgressBooksView>('reading');
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [journalFilter, setJournalFilter] = useState('');
  const [journalTimeFilter, setJournalTimeFilter] = useState<JournalTimeFilter>('all');
  const [journalMonthFilter, setJournalMonthFilter] = useState(monthInputValue());
  const [editingTagsEntryId, setEditingTagsEntryId] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [isSavingTagsForEntryId, setIsSavingTagsForEntryId] = useState<string | null>(null);
  const [convertDialog, setConvertDialog] = useState<ConvertDialogState | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [journalActionNotice, setJournalActionNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  const streaks = useLiveQuery(() => getStreaks(userId), [userId]);
  const progressByBook = useLiveQuery(() => getBibleProgress(userId), [userId], []);
  const stats = useLiveQuery(() => getStats(userId), [userId]);
  const familyDashboard = useLiveQuery(() => getFamilyDashboard(householdId), [householdId]);
  const journalEntries = useLiveQuery(async () => {
    const entries = await db.journalEntries.where('user_id').equals(userId).toArray();
    return entries.sort((left, right) => right.entry_date.localeCompare(left.entry_date));
  }, [userId], []);
  const userTags = useLiveQuery(
    () => db.userTags.where('user_id').equals(userId).reverse().sortBy('last_used_at'),
    [userId],
    []
  );

  const bookSessions = useLiveQuery(async () => {
    if (!selectedBook) {
      return [];
    }

    const sessions = await db.readingSessions.where('user_id').equals(userId).toArray();
    return sessions
      .filter((entry) => sessionCoversBook(entry, selectedBook))
      .sort((left, right) => right.session_at.localeCompare(left.session_at));
  }, [selectedBook, userId]);

  useEffect(() => {
    let active = true;

    async function loadMemberNames() {
      if (!firestore || !householdId) {
        setMemberNames({});
        return;
      }

      try {
        const snapshot = await getDocs(
          query(collection(firestore, 'householdMembers'), where('household_id', '==', householdId))
        );

        const next: Record<string, string> = {};
        snapshot.forEach((entry) => {
          const data = entry.data() as { user_id?: string; display_name?: string };
          if (!data.user_id) {
            return;
          }
          const displayName = data.display_name?.trim();
          if (displayName) {
            next[data.user_id] = displayName;
          }
        });

        if (active) {
          setMemberNames(next);
        }
      } catch {
        if (active) {
          setMemberNames({});
        }
      }
    }

    loadMemberNames();

    return () => {
      active = false;
    };
  }, [firestore, householdId]);

  const achievedMilestones = useMemo(
    () => milestones.filter((target) => (streaks?.consistencyStreak ?? 0) >= target),
    [streaks?.consistencyStreak]
  );

  const visibleProgressBooks = useMemo(() => {
    if (progressBooksView === 'all') {
      return progressByBook;
    }

    const visibleNames = new Set(progressByBook.filter((book) => book.completed > 0).map((book) => book.name));
    if (visibleNames.size < 5) {
      for (const book of progressByBook) {
        visibleNames.add(book.name);
        if (visibleNames.size >= 5) {
          break;
        }
      }
    }

    return progressByBook.filter((book) => visibleNames.has(book.name));
  }, [progressBooksView, progressByBook]);

  useEffect(() => {
    if (!selectedBook) {
      return;
    }
    if (!visibleProgressBooks.some((book) => book.name === selectedBook)) {
      setSelectedBook('');
    }
  }, [selectedBook, visibleProgressBooks]);

  const sessionDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    []
  );

  const dayDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium'
      }),
    []
  );

  const topMemberChapters = familyDashboard?.members[0]?.chaptersThisWeek ?? 0;
  const selectedMonthDate = useMemo(() => {
    const parsed = new Date(`${journalMonthFilter}-01T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [journalMonthFilter]);
  const filteredJournalEntries = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const query = journalFilter.trim().toLowerCase();

    return journalEntries.filter((entry) => {
      const entryDate = new Date(entry.entry_date);
      if (Number.isNaN(entryDate.getTime())) {
        return false;
      }

      const matchesQuery = !query
        ? true
        : entry.body.toLowerCase().includes(query) ||
          entry.tags.some((tag) => tag.toLowerCase().includes(query));

      if (!matchesQuery) {
        return false;
      }

      if (journalTimeFilter === 'last_7_days') {
        return entryDate >= sevenDaysAgo;
      }

      if (journalTimeFilter === 'last_year') {
        return entryDate >= oneYearAgo;
      }

      if (journalTimeFilter === 'by_month') {
        if (!selectedMonthDate) {
          return false;
        }
        return (
          entryDate.getFullYear() === selectedMonthDate.getFullYear() &&
          entryDate.getMonth() === selectedMonthDate.getMonth()
        );
      }

      return true;
    });
  }, [journalEntries, journalFilter, journalTimeFilter, selectedMonthDate]);
  const journalTagSuggestions = useMemo(() => {
    const unique = new Map<string, string>();

    for (const entry of userTags) {
      const tag = entry.tag.trim();
      if (!tag) {
        continue;
      }
      const key = tag.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, tag);
      }
    }

    for (const entry of journalEntries) {
      for (const tag of entry.tags) {
        const normalized = tag.trim();
        if (!normalized) {
          continue;
        }
        const key = normalized.toLowerCase();
        if (!unique.has(key)) {
          unique.set(key, normalized);
        }
      }
    }

    return [...unique.values()].sort((left, right) => left.localeCompare(right));
  }, [journalEntries, userTags]);
  const convertingEntry = useMemo(
    () => journalEntries.find((entry) => entry.id === convertDialog?.entryId) ?? null,
    [convertDialog?.entryId, journalEntries]
  );

  function getMemberLabel(memberUserId: string) {
    const displayName = memberNames[memberUserId];
    if (memberUserId === userId) {
      return displayName ? `${displayName} (You)` : 'You';
    }
    if (displayName) {
      return displayName;
    }
    return `Member ${memberUserId.slice(0, 6)}`;
  }

  function openConvertDialog(entry: JournalEntry) {
    setConvertError(null);
    setJournalActionNotice(null);
    setConvertDialog({
      entryId: entry.id,
      projectTitle: suggestProjectTitle(entry.body, entry.entry_date),
      projectDescription: '',
      questionText: entry.body,
      questionStatus: 'open'
    });
  }

  function closeConvertDialog() {
    if (isConverting) {
      return;
    }
    setConvertError(null);
    setConvertDialog(null);
  }

  async function submitConvertToProject(event: FormEvent) {
    event.preventDefault();
    if (!convertDialog || !convertingEntry) {
      return;
    }

    const nextProjectTitle = convertDialog.projectTitle.trim();
    const nextQuestionText = convertDialog.questionText.trim();

    if (!nextProjectTitle || !nextQuestionText) {
      setConvertError('Project title and question/comment are required.');
      return;
    }

    setIsConverting(true);
    setConvertError(null);

    try {
      const project = await addProject({
        id: createId(),
        user_id: userId,
        household_id: householdId,
        title: nextProjectTitle,
        description: convertDialog.projectDescription.trim(),
        archived: false
      });

      await addQuestion({
        id: createId(),
        user_id: userId,
        household_id: householdId,
        project_id: project.id,
        question: nextQuestionText,
        status: convertDialog.questionStatus,
        notes: '',
        conclusion: '',
        shareable_insight: '',
        conflict_of: null,
        is_conflict_copy: false
      });

      await updateJournalEntry(convertingEntry.id, {
        tags: ensureProjectTag(convertingEntry.tags)
      });

      setConvertDialog(null);
      setJournalActionNotice({ tone: 'success', message: 'Journal entry converted to a project.' });
    } catch {
      setConvertError('Unable to convert this entry right now.');
    } finally {
      setIsConverting(false);
    }
  }

  function startEditingTags(entry: JournalEntry) {
    setJournalActionNotice(null);
    setEditingTagsEntryId(entry.id);
    setEditingTags(entry.tags);
  }

  function cancelEditingTags() {
    setEditingTagsEntryId(null);
    setEditingTags([]);
  }

  async function saveEntryTags(entryId: string) {
    setIsSavingTagsForEntryId(entryId);
    setJournalActionNotice(null);

    try {
      await updateJournalEntry(entryId, { tags: editingTags });
      setEditingTagsEntryId(null);
      setEditingTags([]);
      setJournalActionNotice({ tone: 'success', message: 'Tags updated.' });
    } catch {
      setJournalActionNotice({ tone: 'error', message: 'Unable to update tags.' });
    } finally {
      setIsSavingTagsForEntryId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-1">
          <button
            type="button"
            onClick={() => setView('personal')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              view === 'personal' ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            Personal
          </button>
          <button
            type="button"
            onClick={() => setView('family')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              view === 'family' ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            Family dashboard
          </button>
        </div>
        <p className="text-xs text-muted">
          {view === 'personal'
            ? 'Your own reading, streaks, and study momentum.'
            : 'Combined family activity across everyone in your shared group.'}
        </p>
      </Card>

      {view === 'personal' ? (
        <>
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
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-1">
              <button
                type="button"
                onClick={() => setProgressBooksView('all')}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  progressBooksView === 'all' ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                Show all
              </button>
              <button
                type="button"
                onClick={() => setProgressBooksView('reading')}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  progressBooksView === 'reading' ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                Show reading progress
              </button>
            </div>
            <p className="text-xs text-muted">
              {progressBooksView === 'all'
                ? 'All Bible books in chronological order from Genesis to Revelation.'
                : 'Books with your reading activity, plus additional books to keep at least five visible.'}
            </p>
            <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
              {visibleProgressBooks.map((book) => (
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
                    <p className="text-xs text-muted">{sessionDateFormatter.format(new Date(session.session_at))}</p>
                    <p>
                      {(session.end_book ?? session.book) !== session.book
                        ? `${session.book} ${session.chapter_start}:${session.verse_start ?? 1} - ${session.end_book ?? session.book} ${session.chapter_end}:${
                            session.verse_end ?? session.verse_start ?? 1
                          }`
                        : `Ch ${session.chapter_start}:${session.verse_start ?? 1}${
                            session.chapter_start !== session.chapter_end ||
                            (session.verse_end ?? session.verse_start ?? 1) !== (session.verse_start ?? 1)
                              ? ` - ${session.chapter_end}:${session.verse_end ?? session.verse_start ?? 1}`
                              : ''
                          }`}
                    </p>
                    {session.duration_minutes ? <p className="mt-1 text-xs text-muted">{session.duration_minutes} min</p> : null}
                    {session.note && <p className="mt-1 text-muted">{session.note}</p>}
                  </div>
                ))}
                {!bookSessions?.length && <p className="text-muted">No sessions logged for this book yet.</p>}
              </div>
            </Card>
          )}

          <Card className="space-y-3">
            <h2 className="font-display text-2xl">Journal History</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={journalFilter}
                onChange={(event) => setJournalFilter(event.target.value)}
                placeholder="Search journal text or tag"
              />
              <Select
                value={journalTimeFilter}
                onChange={(event) => setJournalTimeFilter(event.target.value as JournalTimeFilter)}
              >
                <option value="last_7_days">Last 7 days</option>
                <option value="by_month">By month</option>
                <option value="last_year">Last year</option>
                <option value="all">All journal entries</option>
              </Select>
            </div>
            {journalTimeFilter === 'by_month' && (
              <Input
                type="month"
                value={journalMonthFilter}
                onChange={(event) => setJournalMonthFilter(event.target.value || monthInputValue())}
              />
            )}
            {journalActionNotice && (
              <p
                className={
                  journalActionNotice.tone === 'error'
                    ? 'rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted'
                    : 'rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-xs text-muted'
                }
              >
                {journalActionNotice.message}
              </p>
            )}
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {filteredJournalEntries.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-muted/20 bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted">{sessionDateFormatter.format(new Date(entry.entry_date))}</p>
                    <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => openConvertDialog(entry)}>
                      {entry.tags.some((tag) => isProjectTag(tag)) ? 'Convert again' : 'Convert to project'}
                    </Button>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink">{entry.body}</p>
                  <div className="mt-2 space-y-2">
                    {editingTagsEntryId === entry.id ? (
                      <>
                        <TagInput
                          value={editingTags}
                          onChange={setEditingTags}
                          suggestions={journalTagSuggestions}
                          placeholder="Add tags to this entry"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            className="px-3 py-1 text-xs"
                            disabled={isSavingTagsForEntryId === entry.id}
                            onClick={() => saveEntryTags(entry.id)}
                          >
                            {isSavingTagsForEntryId === entry.id ? 'Saving...' : 'Save tags'}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-3 py-1 text-xs"
                            onClick={cancelEditingTags}
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        {entry.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {entry.tags.map((tag) => {
                              const normalized = tag.trim().toLowerCase();
                              const isProject = isProjectTag(normalized);
                              return (
                                <span
                                  key={`${entry.id}-${normalized}`}
                                  className={
                                    isProject
                                      ? 'rounded-full border border-red-300 bg-red-600 px-2 py-1 text-xs font-semibold text-white'
                                      : 'rounded-full bg-card px-2 py-1 text-xs text-muted'
                                  }
                                >
                                  #{isProject ? PROJECT_TAG : tag}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted">No tags</p>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          onClick={() => startEditingTags(entry)}
                        >
                          Edit tags
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!filteredJournalEntries.length && (
                <p className="rounded-xl bg-surface p-3 text-sm text-muted">
                  No journal entries match this search and filter yet.
                </p>
              )}
            </div>
          </Card>
        </>
      ) : (
        <>
          <Card className="space-y-3">
            <h2 className="font-display text-2xl">Family Snapshot</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface p-3">
                <p className="text-xs uppercase tracking-wide text-muted">Family reading streak</p>
                <p className="font-display text-4xl">{familyDashboard?.familyReadingStreak ?? 0}</p>
                <p className="text-xs text-muted">Days with at least one reading session</p>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <p className="text-xs uppercase tracking-wide text-muted">Active this week</p>
                <p className="font-display text-4xl">{familyDashboard?.activeMembersThisWeek ?? 0}</p>
                <p className="text-xs text-muted">Family members with sessions in 7 days</p>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <p className="text-xs uppercase tracking-wide text-muted">Chapters this week</p>
                <p className="font-display text-4xl">{familyDashboard?.chaptersThisWeek ?? 0}</p>
                <p className="text-xs text-muted">{familyDashboard?.sessionsThisWeek ?? 0} reading sessions</p>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <p className="text-xs uppercase tracking-wide text-muted">Shared highlights</p>
                <p className="font-display text-4xl">{familyDashboard?.sharedHighlightsThisWeek ?? 0}</p>
                <p className="text-xs text-muted">Shared to family in 7 days</p>
              </div>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-display text-2xl">Member Momentum</h2>
            <div className="space-y-2">
              {(familyDashboard?.members ?? []).map((member) => {
                const contribution =
                  topMemberChapters > 0 ? Math.max(6, Math.round((member.chaptersThisWeek / topMemberChapters) * 100)) : 0;

                return (
                  <div key={member.userId} className="rounded-xl border border-muted/20 bg-surface p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{getMemberLabel(member.userId)}</p>
                      <p className="text-xs text-muted">
                        {member.lastSessionAt ? `Last read ${dayDateFormatter.format(new Date(member.lastSessionAt))}` : 'No reading yet'}
                      </p>
                    </div>
                    <div className="h-2 rounded-full bg-card">
                      <div
                        className="h-2 rounded-full bg-accent transition-all"
                        style={{ width: `${contribution}%` }}
                        aria-hidden
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>{member.chaptersThisWeek} chapters this week</span>
                      <span>{member.sessionsThisWeek} sessions this week</span>
                      <span>{member.readingStreak} day streak</span>
                    </div>
                  </div>
                );
              })}

              {!familyDashboard?.members.length && (
                <p className="rounded-xl bg-surface p-3 text-sm text-muted">No family reading activity yet.</p>
              )}
            </div>
          </Card>
        </>
      )}
      {convertDialog && (
        <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/35 px-4 py-6 sm:items-center">
          <form className="w-full max-w-lg space-y-3 rounded-2xl border border-muted/25 bg-card p-4 shadow-xl" onSubmit={submitConvertToProject}>
            <div>
              <p className="font-display text-2xl">Convert to Project</p>
              <p className="text-xs text-muted">
                The journal entry stays in history and gets a highlighted {PROJECT_TAG} tag.
              </p>
            </div>
            <Input
              value={convertDialog.projectTitle}
              onChange={(event) =>
                setConvertDialog((current) =>
                  current
                    ? {
                        ...current,
                        projectTitle: event.target.value
                      }
                    : current
                )
              }
              placeholder="Project title"
            />
            <Textarea
              rows={2}
              value={convertDialog.projectDescription}
              onChange={(event) =>
                setConvertDialog((current) =>
                  current
                    ? {
                        ...current,
                        projectDescription: event.target.value
                      }
                    : current
                )
              }
              placeholder="What are you investigating?"
            />
            <Textarea
              rows={4}
              value={convertDialog.questionText}
              onChange={(event) =>
                setConvertDialog((current) =>
                  current
                    ? {
                        ...current,
                        questionText: event.target.value
                      }
                    : current
                )
              }
              placeholder="Primary question or comment for this project"
            />
            <Select
              value={convertDialog.questionStatus}
              onChange={(event) =>
                setConvertDialog((current) =>
                  current
                    ? {
                        ...current,
                        questionStatus: event.target.value as QuestionStatus
                      }
                    : current
                )
              }
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="answered">Answered</option>
            </Select>
            {convertError && <p className="text-xs text-warning">{convertError}</p>}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={isConverting}>
                {isConverting ? 'Converting...' : 'Convert entry'}
              </Button>
              <Button type="button" variant="secondary" className="flex-1" onClick={closeConvertDialog} disabled={isConverting}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
