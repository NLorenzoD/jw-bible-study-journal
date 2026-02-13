'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input, Select } from '@/components/shared/inputs';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { db } from '@/lib/store/db';
import { setHighlightShared } from '@/lib/store/repository';

export default function HighlightsPage() {
  const { userId, householdId } = useUserContext();

  const highlights = useLiveQuery(
    async () => {
      const records = await db.highlights.where('household_id').equals(householdId).reverse().sortBy('updated_at');
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

  const [bookFilter, setBookFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  const linksByParent = useMemo(() => {
    const map = new Map<string, typeof linkReferences>();
    for (const link of linkReferences) {
      const current = map.get(link.parent_id) ?? [];
      current.push(link);
      map.set(link.parent_id, current);
    }
    return map;
  }, [linkReferences]);

  const filteredHighlights = useMemo(
    () =>
      highlights.filter((highlight) => {
        const bookMatch = bookFilter
          ? highlight.reference.toLowerCase().startsWith(bookFilter.toLowerCase())
          : true;
        const projectMatch = projectFilter ? highlight.project_id === projectFilter : true;
        const tagMatch = tagFilter
          ? highlight.tags.some((tag) => tag.toLowerCase().includes(tagFilter.toLowerCase()))
          : true;
        return bookMatch && projectMatch && tagMatch;
      }),
    [bookFilter, highlights, projectFilter, tagFilter]
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Filter highlights</h2>
        <Input value={bookFilter} onChange={(event) => setBookFilter(event.target.value)} placeholder="Book (e.g. Psalms)" />
        <Select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </Select>
        <Input value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} placeholder="Tag" />
      </Card>

      <div className="space-y-3">
        {filteredHighlights.map((highlight) => (
          <Card key={highlight.id} className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{highlight.reference}</p>
                <p className="text-sm text-muted">{highlight.summary}</p>
              </div>
              <Button
                variant={highlight.shared_to_household ? 'primary' : 'secondary'}
                className="px-3 py-1 text-xs"
                onClick={() => setHighlightShared(highlight.id, !highlight.shared_to_household)}
              >
                {highlight.shared_to_household ? 'Shared' : 'Share'}
              </Button>
            </div>

            {highlight.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {highlight.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-surface px-2 py-1 text-xs text-muted">
                    #{tag}
                  </span>
                ))}
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
        ))}

        {!filteredHighlights.length && (
          <Card>
            <p className="text-sm text-muted">No highlights match your filters.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
