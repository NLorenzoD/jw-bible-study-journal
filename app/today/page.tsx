'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FormEvent, useMemo, useState } from 'react';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input, Select, Textarea } from '@/components/shared/inputs';
import { BIBLE_BOOKS } from '@/lib/constants/bible';
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

const cardAnimation = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 }
};

export default function TodayPage() {
  const { userId, householdId } = useUserContext();

  const projects = useLiveQuery(
    () => db.projects.where('user_id').equals(userId).reverse().sortBy('updated_at'),
    [userId],
    []
  );

  const streaks = useLiveQuery(() => getStreaks(userId), [userId]);
  const todayActivity = useLiveQuery(() => getTodayActivity(userId), [userId]);

  const [readingForm, setReadingForm] = useState({
    book: 'Genesis',
    chapterStart: 1,
    chapterEnd: 1,
    verseRange: '',
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

  const [statusText, setStatusText] = useState<string | null>(null);

  const currentBookChapters = useMemo(
    () => BIBLE_BOOKS.find((book) => book.name === readingForm.book)?.chapters ?? 1,
    [readingForm.book]
  );

  async function onSubmitReading(event: FormEvent) {
    event.preventDefault();

    await addReadingSession({
      id: createId(),
      user_id: userId,
      household_id: householdId,
      session_at: new Date().toISOString(),
      book: readingForm.book,
      chapter_start: Number(readingForm.chapterStart),
      chapter_end: Number(readingForm.chapterEnd),
      verse_range: readingForm.verseRange || undefined,
      note: readingForm.note || undefined
    });

    setReadingForm((prev) => ({ ...prev, verseRange: '', note: '' }));
    setStatusText('Reading session saved');
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
    setStatusText('Journal entry saved');
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
    setStatusText('Highlight saved (links captured with fallback)');
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
    setStatusText('Project question saved');
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

      <motion.div {...cardAnimation} transition={{ delay: 0.12 }}>
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Log Reading Session</h2>
          <form className="space-y-3" onSubmit={onSubmitReading}>
            <Select
              value={readingForm.book}
              onChange={(event) =>
                setReadingForm({
                  ...readingForm,
                  book: event.target.value,
                  chapterStart: 1,
                  chapterEnd: 1
                })
              }
            >
              {BIBLE_BOOKS.map((book) => (
                <option key={book.name} value={book.name}>
                  {book.name}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={1}
                max={currentBookChapters}
                value={readingForm.chapterStart}
                onChange={(event) =>
                  setReadingForm({
                    ...readingForm,
                    chapterStart: Number(event.target.value)
                  })
                }
                placeholder="Chapter start"
              />
              <Input
                type="number"
                min={Number(readingForm.chapterStart)}
                max={currentBookChapters}
                value={readingForm.chapterEnd}
                onChange={(event) =>
                  setReadingForm({
                    ...readingForm,
                    chapterEnd: Number(event.target.value)
                  })
                }
                placeholder="Chapter end"
              />
            </div>
            <Input
              value={readingForm.verseRange}
              onChange={(event) => setReadingForm({ ...readingForm, verseRange: event.target.value })}
              placeholder="Optional verse range (e.g. 3-12)"
            />
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

      {statusText && (
        <Card className="flex items-center gap-2 border-success/40 bg-success/10 text-sm text-ink">
          <Sparkles className="h-4 w-4 text-success" />
          {statusText}
        </Card>
      )}
    </div>
  );
}
