'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input, Select } from '@/components/shared/inputs';
import { TagInput } from '@/components/shared/tag-input';
import { useEntitlement } from '@/lib/hooks/useEntitlement';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { db } from '@/lib/store/db';
import { deleteHighlight, setHighlightShared, syncUserTagsFromHighlights, updateHighlightTags } from '@/lib/store/repository';

type SortOrder = 'recent' | 'oldest' | 'last7';

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

      const searchMatch = normalizedSearch
        ? `${highlight.reference} ${highlight.summary} ${highlight.tags.join(' ')} ${linkText}`
            .toLowerCase()
            .includes(normalizedSearch)
        : true;

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

  async function removeHighlight(highlightId: string) {
    const confirmed = window.confirm(
      'Delete this highlight permanently? This action cannot be undone and the note will be gone forever.'
    );

    if (!confirmed) {
      return;
    }

    const deleted = await deleteHighlight(highlightId);
    setStatusMessage(deleted ? 'Highlight deleted permanently.' : 'Could not delete highlight.');
  }

  function clearFilters() {
    setSearchTerm('');
    setProjectFilter('');
    setTagFilter('');
    setYearFilter('');
    setSortOrder('recent');
  }

  async function saveHighlightTags(highlightId: string, tags: string[]) {
    const updated = await updateHighlightTags(highlightId, tags);
    if (!updated) {
      setStatusMessage('Could not update tags for this highlight.');
      return;
    }

    setStatusMessage('');
  }

  return (
    <div className="space-y-4">
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

          return (
            <Card key={highlight.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{highlight.reference}</p>
                  <p className="text-xs text-muted">
                    {ranked}
                    {timestamp ? ` • ${timestampFormatter.format(new Date(timestamp))}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-muted">{highlight.summary}</p>
                </div>
                {highlight.user_id === userId ? (
                  <div className="flex flex-col gap-2">
                    <Button
                      variant={highlight.shared_to_household ? 'primary' : 'secondary'}
                      className="px-3 py-1 text-xs"
                      onClick={() => setHighlightShared(highlight.id, !highlight.shared_to_household)}
                    >
                      {highlight.shared_to_household ? 'Shared' : 'Share'}
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1 text-xs text-warning ring-warning/20"
                      onClick={() => void removeHighlight(highlight.id)}
                    >
                      Delete
                    </Button>
                  </div>
                ) : (
                  <span className="rounded-full bg-surface px-2 py-1 text-xs text-muted">Family shared</span>
                )}
              </div>

              {highlight.user_id === userId ? (
                <TagInput
                  value={highlight.tags}
                  onChange={(nextTags) => void saveHighlightTags(highlight.id, nextTags)}
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
