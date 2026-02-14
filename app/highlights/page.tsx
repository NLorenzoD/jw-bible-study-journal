'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input, Select, Textarea } from '@/components/shared/inputs';
import { TagInput } from '@/components/shared/tag-input';
import { fetchLinkMetadata } from '@/lib/firebase/link-metadata';
import { useEntitlement } from '@/lib/hooks/useEntitlement';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { db } from '@/lib/store/db';
import {
  addHighlight,
  addLinkReference,
  createId,
  deleteHighlight,
  deleteLinkReference,
  setHighlightShared,
  syncUserTagsFromHighlights,
  updateHighlightContent,
  updateHighlightTags
} from '@/lib/store/repository';
import { Highlight, LinkReference } from '@/lib/types';

type SortOrder = 'recent' | 'oldest' | 'last7';
type HighlightComposerType = 'clmm' | 'personal';

interface HighlightEditDraft {
  reference: string;
  shortAnswer: string;
  longAnswer: string;
  explanation: string;
  linksRaw: string;
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

function toTimestamp(iso?: string) {
  if (!iso) {
    return 0;
  }
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getYear(iso?: string) {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}`;
}

function getIsoWeekParts(value: Date) {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear, week };
}

function buildClmmWorkbookUrl(value = new Date()) {
  const { isoYear, week } = getIsoWeekParts(value);
  return `https://wol.jw.org/en/wol/meetings/r1/lp-e/${isoYear}/${week}`;
}

function mergeTags(tags: string[], requiredTags: string[]) {
  const existing = [...tags];
  const seen = new Set(existing.map((tag) => tag.toLowerCase()));

  for (const required of requiredTags) {
    if (seen.has(required.toLowerCase())) {
      continue;
    }
    existing.push(required);
    seen.add(required.toLowerCase());
  }

  return existing;
}

function mergeLinks(raw: string, url: string) {
  const existing = raw
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const normalized = existing.map((entry) => entry.toLowerCase());
  if (!normalized.includes(url.toLowerCase())) {
    existing.unshift(url);
  }
  return existing.join(' ');
}

function removeTags(tags: string[], tagsToRemove: string[]) {
  const blocked = new Set(tagsToRemove.map((tag) => tag.toLowerCase()));
  return tags.filter((tag) => tag && !blocked.has(tag.toLowerCase()));
}

function removeLink(raw: string, url: string) {
  return raw
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry && entry.toLowerCase() !== url.toLowerCase())
    .join(' ');
}

function normalizeWebUrl(raw: string) {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseLinksRaw(raw: string) {
  const entries = raw
    .split(/[\s\n\r]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const normalized = normalizeWebUrl(entry);
    if (!normalized) {
      invalid.push(entry);
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    valid.push(normalized);
  }

  return {
    valid,
    invalid
  };
}

function getHighlightShortAnswer(highlight: Highlight) {
  const shortAnswer = highlight.short_answer?.trim();
  if (shortAnswer) {
    return shortAnswer;
  }
  return '';
}

function getHighlightLongAnswer(highlight: Highlight) {
  const longAnswer = highlight.long_answer?.trim();
  if (longAnswer) {
    return longAnswer;
  }

  const hasShortAnswer = Boolean(highlight.short_answer?.trim());
  const summary = highlight.summary?.trim();
  if (!hasShortAnswer && summary) {
    return summary;
  }

  return '';
}

export default function HighlightsPage() {
  const { userId, householdId } = useUserContext();

  const highlights = useLiveQuery(
    async () => {
      const records = await db.highlights.where('household_id').equals(householdId).toArray();
      return records.filter((entry) => entry.user_id === userId || entry.shared_to_household);
    },
    [householdId, userId],
    []
  );
  const linkReferences = useLiveQuery(
    () => db.linkReferences.where('household_id').equals(householdId).toArray(),
    [householdId],
    []
  );
  const projects = useLiveQuery(() => db.projects.where('user_id').equals(userId).toArray(), [userId], []);
  const personalTags = useLiveQuery(() => db.userTags.where('user_id').equals(userId).toArray(), [userId], []);

  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [statusMessage, setStatusMessage] = useState('');

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [composerType, setComposerType] = useState<HighlightComposerType>('clmm');
  const [composerReference, setComposerReference] = useState('');
  const [composerShortAnswer, setComposerShortAnswer] = useState('');
  const [composerLongAnswer, setComposerLongAnswer] = useState('');
  const [composerExplanation, setComposerExplanation] = useState('');
  const [composerLinks, setComposerLinks] = useState('');
  const [composerTags, setComposerTags] = useState<string[]>([]);
  const [isSavingComposer, setIsSavingComposer] = useState(false);

  const [editingHighlightId, setEditingHighlightId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<HighlightEditDraft | null>(null);
  const [isSavingEditedHighlightId, setIsSavingEditedHighlightId] = useState<string | null>(null);

  const { hasPaidAccess: canUseAdvancedFilters } = useEntitlement();

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    projectFilter !== '' ||
    tagFilter !== '' ||
    yearFilter !== '' ||
    sortOrder !== 'recent';

  useEffect(() => {
    void syncUserTagsFromHighlights(userId);
  }, [highlights, userId]);

  const linksByParent = useMemo(() => {
    const map = new Map<string, typeof linkReferences>();
    for (const link of linkReferences) {
      const current = map.get(link.parent_id) ?? [];
      current.push(link);
      map.set(link.parent_id, current);
    }
    return map;
  }, [linkReferences]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();

    for (const tag of personalTags) {
      const normalized = normalizeTag(tag.tag);
      if (normalized) {
        set.add(normalized);
      }
    }

    for (const highlight of highlights) {
      if (highlight.user_id !== userId) {
        continue;
      }
      for (const tag of highlight.tags) {
        const normalized = normalizeTag(tag);
        if (normalized) {
          set.add(normalized);
        }
      }
    }

    return [...set].sort((left, right) => left.localeCompare(right));
  }, [highlights, personalTags, userId]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const highlight of highlights) {
      const year = getYear(highlight.updated_at || highlight.created_at);
      if (year) {
        set.add(year);
      }
    }

    return [...set].sort((left, right) => Number(right) - Number(left));
  }, [highlights]);

  const filteredHighlights = useMemo(() => {
    if (!canUseAdvancedFilters) {
      return [...highlights].sort(
        (left, right) => toTimestamp(right.updated_at || right.created_at) - toTimestamp(left.updated_at || left.created_at)
      );
    }

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const normalizedTag = normalizeTag(tagFilter);
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const filtered = highlights.filter((highlight) => {
      const projectMatch = projectFilter ? highlight.project_id === projectFilter : true;
      const tagMatch = normalizedTag
        ? highlight.tags.some((tag) => normalizeTag(tag) === normalizedTag)
        : true;
      const yearMatch = yearFilter
        ? getYear(highlight.updated_at || highlight.created_at) === yearFilter
        : true;
      const timestamp = toTimestamp(highlight.updated_at || highlight.created_at);
      const last7Match = sortOrder === 'last7' ? timestamp >= sevenDaysAgo : true;

      const linkText = (linksByParent.get(highlight.id) ?? [])
        .map((link) => `${link.title ?? ''} ${link.url}`)
        .join(' ')
        .toLowerCase();

      const searchText = [
        highlight.reference,
        highlight.summary,
        highlight.short_answer ?? '',
        highlight.long_answer ?? '',
        highlight.explanation ?? '',
        highlight.tags.join(' '),
        linkText
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = normalizedSearch ? searchText.includes(normalizedSearch) : true;

      return projectMatch && tagMatch && yearMatch && last7Match && searchMatch;
    });

    return filtered.sort((left, right) => {
      const leftTs = toTimestamp(left.updated_at || left.created_at);
      const rightTs = toTimestamp(right.updated_at || right.created_at);
      if (sortOrder === 'oldest') {
        return leftTs - rightTs;
      }
      return rightTs - leftTs;
    });
  }, [canUseAdvancedFilters, highlights, linksByParent, projectFilter, searchTerm, sortOrder, tagFilter, yearFilter]);

  const timestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    []
  );

  const currentClmmWorkbookUrl = useMemo(() => buildClmmWorkbookUrl(), []);
  const clmmWeekLabel = useMemo(() => {
    const { isoYear, week } = getIsoWeekParts(new Date());
    return `Week ${week}, ${isoYear}`;
  }, []);

  function clearFilters() {
    setSearchTerm('');
    setProjectFilter('');
    setTagFilter('');
    setYearFilter('');
    setSortOrder('recent');
  }

  function resetComposer() {
    setComposerType('clmm');
    setComposerReference('');
    setComposerShortAnswer('');
    setComposerLongAnswer('');
    setComposerExplanation('');
    setComposerLinks('');
    setComposerTags([]);
  }

  function activateClmmComposer() {
    setComposerType('clmm');
    setComposerTags((current) => mergeTags(current, ['gems', 'clmm']));
    setComposerLinks((current) => mergeLinks(current, currentClmmWorkbookUrl));
  }

  function activatePersonalComposer() {
    setComposerType('personal');
    setComposerTags((current) => removeTags(current, ['gems', 'clmm']));
    setComposerLinks((current) => removeLink(current, currentClmmWorkbookUrl));
  }

  async function submitNewHighlight(event: FormEvent) {
    event.preventDefault();
    if (isSavingComposer) {
      return;
    }

    const reference = composerReference.trim();
    const shortAnswer = composerShortAnswer.trim();
    const longAnswer = composerLongAnswer.trim();
    const explanation = composerExplanation.trim();

    if (!reference) {
      setStatusMessage('Reference is required.');
      return;
    }

    if (!shortAnswer && !longAnswer && !explanation) {
      setStatusMessage('Add at least one section: short answer, long answer, or explanation.');
      return;
    }

    setIsSavingComposer(true);
    setStatusMessage('');

    try {
      const highlightId = createId();
      const finalTags = composerType === 'clmm' ? mergeTags(composerTags, ['gems', 'clmm']) : composerTags;
      const summaryForCompatibility = shortAnswer || longAnswer || explanation;

      await addHighlight({
        id: highlightId,
        user_id: userId,
        household_id: householdId,
        reference,
        summary: summaryForCompatibility,
        short_answer: shortAnswer,
        long_answer: longAnswer,
        explanation,
        tags: finalTags.map((tag) => tag.trim()).filter(Boolean),
        project_id: null,
        shared_to_household: false
      });

      const links = (composerType === 'clmm' ? mergeLinks(composerLinks, currentClmmWorkbookUrl) : composerLinks)
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
      void Promise.allSettled(metadataTasks);

      resetComposer();
      setIsComposerOpen(false);
      setStatusMessage(links.length ? 'Highlight saved. Link details are syncing in the background.' : 'Highlight saved.');
    } catch {
      setStatusMessage('Could not save highlight. Please try again.');
    } finally {
      setIsSavingComposer(false);
    }
  }

  async function removeHighlightEntry(highlightId: string) {
    const confirmed = window.confirm(
      'Delete this highlight permanently? This action cannot be undone and the note will be gone forever.'
    );

    if (!confirmed) {
      return;
    }

    const deleted = await deleteHighlight(highlightId);
    if (deleted && editingHighlightId === highlightId) {
      setEditingHighlightId(null);
      setEditingDraft(null);
    }

    setStatusMessage(deleted ? 'Highlight deleted permanently.' : 'Could not delete highlight.');
  }

  async function saveHighlightTagsEntry(highlightId: string, tags: string[]) {
    const updated = await updateHighlightTags(highlightId, tags);
    if (!updated) {
      setStatusMessage('Could not update tags for this highlight.');
      return;
    }

    setStatusMessage('');
  }

  function startEditingHighlight(highlight: Highlight, links: LinkReference[]) {
    setEditingHighlightId(highlight.id);
    setEditingDraft({
      reference: highlight.reference,
      shortAnswer: getHighlightShortAnswer(highlight),
      longAnswer: getHighlightLongAnswer(highlight),
      explanation: highlight.explanation ?? '',
      linksRaw: links.map((link) => link.url).join('\n')
    });
    setStatusMessage('');
  }

  function cancelEditingHighlight() {
    setEditingHighlightId(null);
    setEditingDraft(null);
  }

  async function saveEditedHighlight(highlightId: string) {
    if (!editingDraft || editingHighlightId !== highlightId) {
      return;
    }

    const reference = editingDraft.reference.trim();
    const shortAnswer = editingDraft.shortAnswer.trim();
    const longAnswer = editingDraft.longAnswer.trim();
    const explanation = editingDraft.explanation.trim();
    const parsedLinks = parseLinksRaw(editingDraft.linksRaw);

    if (!reference) {
      setStatusMessage('Reference is required.');
      return;
    }

    if (!shortAnswer && !longAnswer && !explanation) {
      setStatusMessage('Add at least one section: short answer, long answer, or explanation.');
      return;
    }

    if (parsedLinks.invalid.length > 0) {
      setStatusMessage(`One or more links are invalid (e.g. ${parsedLinks.invalid[0]}).`);
      return;
    }

    setIsSavingEditedHighlightId(highlightId);
    setStatusMessage('');

    try {
      const updated = await updateHighlightContent(highlightId, {
        reference,
        summary: shortAnswer || longAnswer || explanation,
        short_answer: shortAnswer,
        long_answer: longAnswer,
        explanation
      });

      if (!updated) {
        setStatusMessage('Could not update this highlight.');
        return;
      }

      const existingLinks = linksByParent.get(highlightId) ?? [];
      const nextLinkSet = new Set(parsedLinks.valid.map((url) => url.toLowerCase()));
      const existingLinkSet = new Set(existingLinks.map((link) => link.url.toLowerCase()));

      const linksToDelete = existingLinks.filter((link) => !nextLinkSet.has(link.url.toLowerCase()));
      const linksToAdd = parsedLinks.valid.filter((url) => !existingLinkSet.has(url.toLowerCase()));

      await Promise.all(linksToDelete.map((link) => deleteLinkReference(link.id)));

      const addLinkTasks = linksToAdd.map(async (url) => {
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
      await Promise.allSettled(addLinkTasks);

      setEditingHighlightId(null);
      setEditingDraft(null);
      setStatusMessage('Highlight updated.');
    } catch {
      setStatusMessage('Could not update this highlight.');
    } finally {
      setIsSavingEditedHighlightId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="px-3 py-1"
          disabled={isFiltersOpen}
          onClick={() => {
            if (isComposerOpen) {
              setIsComposerOpen(false);
              return;
            }
            setStatusMessage('');
            setIsFiltersOpen(false);
            setIsComposerOpen(true);
          }}
        >
          {isComposerOpen ? 'Close add highlight' : 'Add new highlight'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1"
          disabled={isComposerOpen}
          onClick={() => {
            if (isFiltersOpen) {
              setIsFiltersOpen(false);
              return;
            }
            setIsComposerOpen(false);
            setIsFiltersOpen(true);
          }}
        >
          {isFiltersOpen ? 'Close filters' : 'Show filters'}
        </Button>
      </div>

      {isComposerOpen && (
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Add Bible Highlights</h2>
          <form className="space-y-3" onSubmit={submitNewHighlight}>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={activateClmmComposer}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  composerType === 'clmm'
                    ? 'border-accent bg-accent/10 text-ink shadow-glow'
                    : 'border-muted/20 bg-surface text-muted hover:border-accent/30'
                }`}
              >
                This Week&apos;s Spiritual Gems (CLMM)
              </button>
              <button
                type="button"
                onClick={activatePersonalComposer}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  composerType === 'personal'
                    ? 'border-accent bg-accent/10 text-ink shadow-glow'
                    : 'border-muted/20 bg-surface text-muted hover:border-accent/30'
                }`}
              >
                Personal Bible Highlights
              </button>
            </div>

            {composerType === 'clmm' && (
              <div className="rounded-xl border border-accent/25 bg-accent/10 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">This week workbook</p>
                <p className="mt-1 text-xs text-muted">{clmmWeekLabel}</p>
                <a
                  href={currentClmmWorkbookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex rounded-lg border border-accent/35 bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent/60"
                >
                  Open this week workbook
                </a>
              </div>
            )}

            <Input
              value={composerReference}
              onChange={(event) => setComposerReference(event.target.value)}
              placeholder="Reference (e.g. John 3:16)"
            />

            <Textarea
              rows={2}
              value={composerShortAnswer}
              onChange={(event) => setComposerShortAnswer(event.target.value)}
              placeholder="Short answer (1-2 lines)"
            />

            <Textarea
              rows={4}
              value={composerLongAnswer}
              onChange={(event) => setComposerLongAnswer(event.target.value)}
              placeholder="Long answer"
            />

            <Textarea
              rows={3}
              value={composerExplanation}
              onChange={(event) => setComposerExplanation(event.target.value)}
              placeholder="Explanation"
            />

            <Input
              value={composerLinks}
              onChange={(event) => setComposerLinks(event.target.value)}
              placeholder={
                composerType === 'clmm'
                  ? 'Workbook link is added automatically (you can add more links)'
                  : 'Optional jw.org / wol.jw.org links'
              }
            />

            <TagInput
              value={composerTags}
              onChange={setComposerTags}
              suggestions={availableTags}
              placeholder={composerType === 'clmm' ? 'Includes gems and clmm (add more tags)' : 'Add tags'}
            />

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={isSavingComposer}>
                {isSavingComposer ? 'Saving highlight...' : 'Save highlight'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  resetComposer();
                  setIsComposerOpen(false);
                }}
                disabled={isSavingComposer}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isFiltersOpen && (
        <Card className="space-y-3">
          {canUseAdvancedFilters ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-2xl">Filter highlights</h2>
                <Button variant="secondary" className="px-3 py-1 text-xs" onClick={clearFilters} disabled={!hasActiveFilters}>
                  Clear filters
                </Button>
              </div>
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search term (reference, note, link, or tag)"
              />
              <Select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
                <option value="">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </Select>
              <Select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                <option value="">All tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                  <option value="">All years</option>
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </Select>
                <Select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
                  <option value="recent">Most recent first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="last7">Last 7 days</option>
                </Select>
              </div>
            </>
          ) : (
            <>
              <h2 className="font-display text-2xl">Highlights</h2>
              <p className="text-sm text-muted">
                Free mode shows your full highlights timeline from newest to oldest.
              </p>
              <p className="text-xs text-muted">
                Upgrade to Plus to unlock fast filters (search, project, tag, year, and last 7 days).
              </p>
            </>
          )}
        </Card>
      )}

      <div className="space-y-3">
        {filteredHighlights.map((highlight, index) => {
          const timestamp = highlight.updated_at || highlight.created_at;
          const ranked =
            !canUseAdvancedFilters
              ? `#${index + 1} newest`
              : sortOrder === 'oldest'
                ? `#${index + 1} oldest`
                : sortOrder === 'last7'
                  ? `#${index + 1} in last 7 days`
                  : `#${index + 1} newest`;

          const isOwner = highlight.user_id === userId;
          const isEditing = editingHighlightId === highlight.id && Boolean(editingDraft);
          const shortAnswer = getHighlightShortAnswer(highlight);
          const longAnswer = getHighlightLongAnswer(highlight);
          const explanation = highlight.explanation?.trim() ?? '';

          return (
            <Card key={highlight.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{highlight.reference}</p>
                  <p className="text-xs text-muted">
                    {ranked}
                    {timestamp ? ` • ${timestampFormatter.format(new Date(timestamp))}` : ''}
                  </p>
                </div>
                {isOwner ? (
                  <div className="flex flex-col gap-2">
                    <Button
                      variant={highlight.shared_to_household ? 'primary' : 'secondary'}
                      className="px-3 py-1 text-xs"
                      onClick={() => setHighlightShared(highlight.id, !highlight.shared_to_household)}
                      disabled={isSavingEditedHighlightId === highlight.id}
                    >
                      {highlight.shared_to_household ? 'Shared' : 'Share'}
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1 text-xs"
                      onClick={() => {
                        if (isEditing) {
                          cancelEditingHighlight();
                          return;
                        }
                        startEditingHighlight(highlight, linksByParent.get(highlight.id) ?? []);
                      }}
                      disabled={isSavingEditedHighlightId === highlight.id}
                    >
                      {isEditing ? 'Cancel edit' : 'Edit'}
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1 text-xs text-warning ring-warning/20"
                      onClick={() => void removeHighlightEntry(highlight.id)}
                      disabled={isSavingEditedHighlightId === highlight.id}
                    >
                      Delete
                    </Button>
                  </div>
                ) : (
                  <span className="rounded-full bg-surface px-2 py-1 text-xs text-muted">Family shared</span>
                )}
              </div>

              {isOwner ? (
                <TagInput
                  value={highlight.tags}
                  onChange={(nextTags) => void saveHighlightTagsEntry(highlight.id, nextTags)}
                  suggestions={availableTags}
                  placeholder="Add tags (press Enter)"
                  onTagClick={canUseAdvancedFilters ? (tag) => setTagFilter(normalizeTag(tag)) : undefined}
                />
              ) : (
                highlight.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {highlight.tags.map((tag) => (
                      <button
                        key={`${highlight.id}_${tag}`}
                        type="button"
                        onClick={() => {
                          if (canUseAdvancedFilters) {
                            setTagFilter(normalizeTag(tag));
                          }
                        }}
                        className="rounded-full bg-surface px-2 py-1 text-xs text-muted transition hover:text-ink"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                )
              )}

              {isEditing && editingDraft ? (
                <div className="space-y-2">
                  <Input
                    value={editingDraft.reference}
                    onChange={(event) =>
                      setEditingDraft((current) =>
                        current
                          ? {
                              ...current,
                              reference: event.target.value
                            }
                          : current
                      )
                    }
                    placeholder="Reference"
                  />
                  <Textarea
                    rows={2}
                    value={editingDraft.shortAnswer}
                    onChange={(event) =>
                      setEditingDraft((current) =>
                        current
                          ? {
                              ...current,
                              shortAnswer: event.target.value
                            }
                          : current
                      )
                    }
                    placeholder="Short answer"
                  />
                  <Textarea
                    rows={4}
                    value={editingDraft.longAnswer}
                    onChange={(event) =>
                      setEditingDraft((current) =>
                        current
                          ? {
                              ...current,
                              longAnswer: event.target.value
                            }
                          : current
                      )
                    }
                    placeholder="Long answer"
                  />
                  <Textarea
                    rows={3}
                    value={editingDraft.explanation}
                    onChange={(event) =>
                      setEditingDraft((current) =>
                        current
                          ? {
                              ...current,
                              explanation: event.target.value
                            }
                          : current
                      )
                    }
                    placeholder="Explanation"
                  />
                  <Textarea
                    rows={3}
                    value={editingDraft.linksRaw}
                    onChange={(event) =>
                      setEditingDraft((current) =>
                        current
                          ? {
                              ...current,
                              linksRaw: event.target.value
                            }
                          : current
                      )
                    }
                    placeholder="Links (add one or many URLs, separated by spaces or new lines)"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => void saveEditedHighlight(highlight.id)}
                      disabled={isSavingEditedHighlightId === highlight.id}
                    >
                      {isSavingEditedHighlightId === highlight.id ? 'Saving...' : 'Save text'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      onClick={cancelEditingHighlight}
                      disabled={isSavingEditedHighlightId === highlight.id}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  {shortAnswer && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Short answer</p>
                      <p className="mt-1 whitespace-pre-line text-muted">{shortAnswer}</p>
                    </div>
                  )}
                  {longAnswer && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Long answer</p>
                      <p className="mt-1 whitespace-pre-line text-muted">{longAnswer}</p>
                    </div>
                  )}
                  {explanation && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">Explanation</p>
                      <p className="mt-1 whitespace-pre-line text-muted">{explanation}</p>
                    </div>
                  )}
                  {!shortAnswer && !longAnswer && !explanation && (
                    <p className="whitespace-pre-line text-sm text-muted">{highlight.summary}</p>
                  )}
                </div>
              )}

              {(linksByParent.get(highlight.id) ?? []).length > 0 && (
                <div className="space-y-2">
                  {(linksByParent.get(highlight.id) ?? []).map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl border border-muted/20 bg-surface p-2 text-xs text-muted transition hover:border-accent/40"
                    >
                      <p className="font-semibold text-ink">{link.title || 'Untitled source'}</p>
                      <p className="truncate">{link.url}</p>
                    </a>
                  ))}
                </div>
              )}
            </Card>
          );
        })}

        {!filteredHighlights.length && (
          <Card>
            <p className="text-sm text-muted">No highlights match your filters.</p>
          </Card>
        )}
      </div>

      {statusMessage && <p className="text-sm text-muted">{statusMessage}</p>}
    </div>
  );
}
