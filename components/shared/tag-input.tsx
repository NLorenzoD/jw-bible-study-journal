'use client';

import { X } from 'lucide-react';
import { KeyboardEvent, useMemo, useState } from 'react';

import { cn } from '@/lib/utils/cn';

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  onTagClick?: (tag: string) => void;
  allowCreate?: boolean;
  allowRemove?: boolean;
}

function normalizeTag(value: string) {
  return value.trim().replace(/^#+/, '');
}

function includesTag(tags: string[], candidate: string) {
  return tags.some((tag) => tag.toLowerCase() === candidate.toLowerCase());
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Add tags',
  className,
  onTagClick,
  allowCreate = true,
  allowRemove = true
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0);

  const filteredSuggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    const candidates = suggestions.filter((suggestion) => {
      if (!suggestion.trim()) {
        return false;
      }
      if (includesTag(value, suggestion)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return suggestion.toLowerCase().includes(query);
    });
    return candidates.slice(0, 8);
  }, [draft, suggestions, value]);

  function addTag(rawTag: string) {
    const next = normalizeTag(rawTag);
    if (!next || includesTag(value, next)) {
      return false;
    }
    onChange([...value, next]);
    setDraft('');
    setHighlightedSuggestionIndex(0);
    return true;
  }

  function removeTag(tag: string) {
    onChange(value.filter((entry) => entry.toLowerCase() !== tag.toLowerCase()));
  }

  function commitDraft() {
    const preferredSuggestion = filteredSuggestions[highlightedSuggestionIndex];
    if (preferredSuggestion && draft.trim()) {
      return addTag(preferredSuggestion);
    }
    return addTag(draft);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !draft.trim() && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }

    if (event.key === 'ArrowDown') {
      if (!filteredSuggestions.length) {
        return;
      }
      event.preventDefault();
      setHighlightedSuggestionIndex((current) => (current + 1) % filteredSuggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      if (!filteredSuggestions.length) {
        return;
      }
      event.preventDefault();
      setHighlightedSuggestionIndex((current) =>
        current === 0 ? filteredSuggestions.length - 1 : current - 1
      );
      return;
    }

    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      if (!draft.trim()) {
        return;
      }
      event.preventDefault();
      commitDraft();
      return;
    }

    if (event.key === 'Escape') {
      setHighlightedSuggestionIndex(0);
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border border-muted/20 bg-surface px-2 py-1.5 text-sm text-ink outline-none ring-accent transition',
          isFocused && 'ring-2'
        )}
      >
        {value.map((tag) => (
          <span
            key={tag.toLowerCase()}
            className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-ink"
          >
            {onTagClick ? (
              <button type="button" onClick={() => onTagClick(tag)} className="transition hover:text-ink">
                {tag}
              </button>
            ) : (
              <span>{tag}</span>
            )}
            {allowRemove && (
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted transition hover:bg-accent/15 hover:text-ink"
                aria-label={`Remove ${tag} tag`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {allowCreate && (
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setHighlightedSuggestionIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              if (draft.trim()) {
                addTag(draft);
              }
            }}
            placeholder={value.length === 0 ? placeholder : 'Add another tag'}
            className="min-w-[7rem] flex-1 bg-transparent px-1 py-1 text-sm text-ink outline-none placeholder:text-muted"
          />
        )}
      </div>

      {allowCreate && isFocused && filteredSuggestions.length > 0 && (
        <div className="rounded-xl border border-muted/20 bg-card p-1">
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={suggestion.toLowerCase()}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                addTag(suggestion);
              }}
              className={cn(
                'w-full rounded-lg px-2 py-1.5 text-left text-sm transition',
                index === highlightedSuggestionIndex ? 'bg-accent/10 text-ink' : 'text-muted hover:bg-surface hover:text-ink'
              )}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
