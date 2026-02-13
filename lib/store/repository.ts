import { db } from '@/lib/store/db';
import {
  Highlight,
  JournalEntry,
  LinkReference,
  QuestionStatus,
  ReadingSession,
  ReminderSetting,
  StudyProject,
  StudyQuestion,
  SyncMutation,
  UUID
} from '@/lib/types';

function nowIso() {
  return new Date().toISOString();
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function withLocalMeta<T extends object>(payload: T): T & { created_at: string; updated_at: string; sync_status: 'pending' } {
  const timestamp = nowIso();
  return {
    ...payload,
    created_at: timestamp,
    updated_at: timestamp,
    sync_status: 'pending'
  };
}

async function enqueueMutation(mutation: Omit<SyncMutation, 'id' | 'attempts'>) {
  await db.syncMutations.add({
    ...mutation,
    attempts: 0
  });
}

async function upsertUserTags(userId: UUID, tags: string[], timestamp: string) {
  for (const rawTag of tags) {
    const tag = normalizeTag(rawTag);
    if (!tag) {
      continue;
    }

    const id = `${userId}_${tag}`;
    const existing = await db.userTags.get(id);
    if (existing) {
      await db.userTags.put({
        ...existing,
        last_used_at: timestamp
      });
      continue;
    }

    await db.userTags.put({
      id,
      user_id: userId,
      tag,
      created_at: timestamp,
      last_used_at: timestamp
    });
  }
}

async function alignTagsToUserCatalog(userId: UUID, tags: string[]) {
  const catalog = await db.userTags.where('user_id').equals(userId).toArray();
  const byNormalized = new Map<string, string>();

  for (const entry of catalog) {
    const normalized = normalizeTag(entry.tag);
    if (normalized) {
      byNormalized.set(normalized, entry.tag);
    }
  }

  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of tags) {
    const normalized = normalizeTag(rawTag);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    resolved.push(byNormalized.get(normalized) ?? normalized);
  }

  return resolved;
}

export async function syncUserTagsFromHighlights(userId: UUID) {
  const highlights = await db.highlights.where('user_id').equals(userId).toArray();
  for (const highlight of highlights) {
    await upsertUserTags(userId, highlight.tags, highlight.updated_at ?? highlight.created_at ?? nowIso());
  }
}

export async function addReadingSession(
  payload: Omit<ReadingSession, 'created_at' | 'updated_at' | 'sync_status'>
) {
  const record = withLocalMeta(payload);
  await db.readingSessions.put(record);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'readingSessions',
    operation: 'upsert',
    record_id: record.id,
    payload: record,
    updated_at: record.updated_at
  });
  return record;
}

export async function addJournalEntry(
  payload: Omit<JournalEntry, 'created_at' | 'updated_at' | 'sync_status'>
) {
  const record = withLocalMeta(payload);
  const alignedTags = await alignTagsToUserCatalog(record.user_id, record.tags);
  const normalizedRecord: JournalEntry = {
    ...record,
    tags: alignedTags
  };

  await upsertUserTags(normalizedRecord.user_id, normalizedRecord.tags, normalizedRecord.updated_at);
  await db.journalEntries.put(normalizedRecord);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'journalEntries',
    operation: 'upsert',
    record_id: normalizedRecord.id,
    payload: normalizedRecord,
    updated_at: normalizedRecord.updated_at
  });
  return normalizedRecord;
}

export async function updateJournalEntry(
  journalEntryId: UUID,
  patch: Partial<Pick<JournalEntry, 'body' | 'entry_date' | 'tags'>>
) {
  const existing = await db.journalEntries.get(journalEntryId);
  if (!existing) {
    return null;
  }

  const timestamp = nowIso();
  const alignedTags =
    patch.tags === undefined ? existing.tags : await alignTagsToUserCatalog(existing.user_id, patch.tags);

  const updated: JournalEntry = {
    ...existing,
    ...patch,
    tags: alignedTags,
    updated_at: timestamp,
    sync_status: 'pending'
  };

  await upsertUserTags(updated.user_id, updated.tags, timestamp);
  await db.journalEntries.put(updated);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'journalEntries',
    operation: 'upsert',
    record_id: updated.id,
    payload: updated,
    updated_at: updated.updated_at
  });

  return updated;
}

export async function addProject(payload: Omit<StudyProject, 'created_at' | 'updated_at' | 'sync_status'>) {
  const record = withLocalMeta(payload);
  await db.projects.put(record);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'projects',
    operation: 'upsert',
    record_id: record.id,
    payload: record,
    updated_at: record.updated_at
  });
  return record;
}

export async function addQuestion(
  payload: Omit<StudyQuestion, 'created_at' | 'updated_at' | 'sync_status'>
) {
  const record = withLocalMeta(payload);
  await db.questions.put(record);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'questions',
    operation: 'upsert',
    record_id: record.id,
    payload: record,
    updated_at: record.updated_at
  });
  return record;
}

export async function updateQuestion(
  questionId: UUID,
  patch: Partial<Pick<StudyQuestion, 'status' | 'notes' | 'conclusion' | 'shareable_insight'>>
) {
  const existing = await db.questions.get(questionId);
  if (!existing) {
    return null;
  }

  const updated: StudyQuestion = {
    ...existing,
    ...patch,
    updated_at: nowIso(),
    sync_status: 'pending'
  };

  await db.questions.put(updated);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'questions',
    operation: 'upsert',
    record_id: updated.id,
    payload: updated,
    updated_at: updated.updated_at
  });

  return updated;
}

export async function addHighlight(payload: Omit<Highlight, 'created_at' | 'updated_at' | 'sync_status'>) {
  const record = withLocalMeta(payload);
  const alignedTags = await alignTagsToUserCatalog(record.user_id, record.tags);
  const normalizedRecord: Highlight = {
    ...record,
    tags: alignedTags
  };

  await upsertUserTags(normalizedRecord.user_id, normalizedRecord.tags, normalizedRecord.updated_at);
  await db.highlights.put(normalizedRecord);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'highlights',
    operation: 'upsert',
    record_id: normalizedRecord.id,
    payload: normalizedRecord,
    updated_at: normalizedRecord.updated_at
  });
  return normalizedRecord;
}

export async function updateHighlightTags(highlightId: UUID, nextTags: string[]) {
  const existing = await db.highlights.get(highlightId);
  if (!existing) {
    return null;
  }

  const timestamp = nowIso();
  const alignedTags = await alignTagsToUserCatalog(existing.user_id, nextTags);
  const updated: Highlight = {
    ...existing,
    tags: alignedTags,
    updated_at: timestamp,
    sync_status: 'pending'
  };

  await upsertUserTags(existing.user_id, alignedTags, timestamp);
  await db.highlights.put(updated);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'highlights',
    operation: 'upsert',
    record_id: updated.id,
    payload: updated,
    updated_at: updated.updated_at
  });

  return updated;
}

export async function deleteHighlight(highlightId: UUID) {
  const existing = await db.highlights.get(highlightId);
  if (!existing) {
    return false;
  }

  const relatedLinks = await db.linkReferences
    .where('parent_type')
    .equals('highlight')
    .and((entry) => entry.parent_id === highlightId)
    .toArray();

  for (const link of relatedLinks) {
    await deleteLinkReference(link.id);
  }

  await db.highlights.delete(highlightId);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'highlights',
    operation: 'delete',
    record_id: highlightId,
    payload: existing,
    updated_at: nowIso()
  });

  return true;
}

export async function setHighlightShared(highlightId: UUID, shared: boolean) {
  const existing = await db.highlights.get(highlightId);
  if (!existing) {
    return null;
  }

  const timestamp = nowIso();
  const updated: Highlight = {
    ...existing,
    shared_to_household: shared,
    updated_at: timestamp,
    sync_status: 'pending'
  };

  await db.highlights.put(updated);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'highlights',
    operation: 'upsert',
    record_id: updated.id,
    payload: updated,
    updated_at: updated.updated_at
  });

  const relatedLinks = await db.linkReferences
    .where('parent_type')
    .equals('highlight')
    .and((entry) => entry.parent_id === highlightId)
    .toArray();

  for (const link of relatedLinks) {
    const updatedLink: LinkReference = {
      ...link,
      shared_to_household: shared,
      updated_at: timestamp,
      sync_status: 'pending'
    };

    await db.linkReferences.put(updatedLink);
    await enqueueMutation({
      mutation_id: createId(),
      entity: 'linkReferences',
      operation: 'upsert',
      record_id: updatedLink.id,
      payload: updatedLink,
      updated_at: updatedLink.updated_at
    });
  }

  return updated;
}

export async function addLinkReference(
  payload: Omit<LinkReference, 'created_at' | 'updated_at' | 'sync_status'>
) {
  const record = withLocalMeta(payload);
  await db.linkReferences.put(record);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'linkReferences',
    operation: 'upsert',
    record_id: record.id,
    payload: record,
    updated_at: record.updated_at
  });
  return record;
}

export async function deleteLinkReference(linkId: UUID) {
  const existing = await db.linkReferences.get(linkId);
  if (!existing) {
    return false;
  }

  await db.linkReferences.delete(linkId);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'linkReferences',
    operation: 'delete',
    record_id: linkId,
    payload: existing,
    updated_at: nowIso()
  });

  return true;
}

export async function upsertReminder(
  payload: Omit<ReminderSetting, 'created_at' | 'updated_at' | 'sync_status'>
) {
  const existing = await db.reminders.where('user_id').equals(payload.user_id).first();
  const timestamp = nowIso();

  const record: ReminderSetting = existing
    ? {
        ...existing,
        ...payload,
        updated_at: timestamp,
        sync_status: 'pending'
      }
    : {
        ...payload,
        created_at: timestamp,
        updated_at: timestamp,
        sync_status: 'pending'
      };

  await db.reminders.put(record);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'reminders',
    operation: 'upsert',
    record_id: record.id,
    payload: record,
    updated_at: record.updated_at
  });

  return record;
}

export async function updateReminderLastShown(reminderId: UUID, timestamp: string) {
  const existing = await db.reminders.get(reminderId);
  if (!existing) {
    return null;
  }

  const updated: ReminderSetting = {
    ...existing,
    last_shown_at: timestamp,
    updated_at: timestamp,
    sync_status: 'pending'
  };

  await db.reminders.put(updated);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'reminders',
    operation: 'upsert',
    record_id: updated.id,
    payload: updated,
    updated_at: updated.updated_at
  });

  return updated;
}

export async function updateProjectQuestionStatus(questionId: UUID, status: QuestionStatus) {
  return updateQuestion(questionId, { status });
}

export async function clearMutation(mutationId: number) {
  await db.syncMutations.delete(mutationId);
}
