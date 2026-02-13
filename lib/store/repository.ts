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
  await db.journalEntries.put(record);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'journalEntries',
    operation: 'upsert',
    record_id: record.id,
    payload: record,
    updated_at: record.updated_at
  });
  return record;
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
  await db.highlights.put(record);
  await enqueueMutation({
    mutation_id: createId(),
    entity: 'highlights',
    operation: 'upsert',
    record_id: record.id,
    payload: record,
    updated_at: record.updated_at
  });
  return record;
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
