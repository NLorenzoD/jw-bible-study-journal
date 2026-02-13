'use client';

import {
  Firestore,
  QuerySnapshot,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where
} from 'firebase/firestore';

import { db } from '@/lib/store/db';
import { createId } from '@/lib/store/repository';
import { SyncMutation } from '@/lib/types';

const ENTITY_COLLECTION_MAP: Record<string, string> = {
  readingSessions: 'readingSessions',
  journalEntries: 'journalEntries',
  projects: 'studyProjects',
  questions: 'studyQuestions',
  highlights: 'highlights',
  linkReferences: 'linkReferences',
  reminders: 'reminderSettings'
};

type LocalTableName = keyof Pick<
  typeof db,
  'readingSessions' | 'journalEntries' | 'projects' | 'questions' | 'highlights' | 'linkReferences' | 'reminders'
>;

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }

  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested !== undefined) {
        next[key] = stripUndefined(nested);
      }
    }
    return next;
  }

  return value;
}

function cleanPayload(payload: Record<string, unknown>) {
  const { sync_status, synced_at, ...rest } = payload;
  return stripUndefined(rest) as Record<string, unknown>;
}

function getLocalTable(entity: string) {
  switch (entity) {
    case 'readingSessions':
      return db.readingSessions;
    case 'journalEntries':
      return db.journalEntries;
    case 'projects':
      return db.projects;
    case 'questions':
      return db.questions;
    case 'highlights':
      return db.highlights;
    case 'linkReferences':
      return db.linkReferences;
    case 'reminders':
      return db.reminders;
    default:
      return null;
  }
}

function normalizeTimestamp(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in (value as Record<string, unknown>) &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeTimestamp(entry));
  }

  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      next[key] = normalizeTimestamp(nested);
    }
    return next;
  }

  return value;
}

function getDocsData(snapshot: QuerySnapshot) {
  return snapshot.docs.map((entry) => {
    const data = normalizeTimestamp(entry.data()) as Record<string, unknown>;
    return {
      ...data,
      id: data.id ?? entry.id
    };
  });
}

async function markLocalSynced(entity: string, recordId: string, syncedAt: string) {
  const table = getLocalTable(entity);
  if (!table) {
    return;
  }
  const current = await table.get(recordId);
  if (!current) {
    return;
  }

  await table.put({
    ...current,
    sync_status: 'synced',
    synced_at: syncedAt
  });
}

async function storeRemoteRecords(entity: LocalTableName, records: Array<Record<string, unknown>>) {
  const table = getLocalTable(entity) as any;
  if (!table || !records.length) {
    return;
  }

  for (const record of records) {
    const recordId = record.id as string;
    const remoteUpdatedAt = record.updated_at as string | undefined;

    if (!recordId || !remoteUpdatedAt) {
      continue;
    }

    const current = await table.get(recordId);

    if (current?.sync_status === 'pending') {
      const localUpdatedAt = current.updated_at ?? '';
      if (localUpdatedAt >= remoteUpdatedAt) {
        continue;
      }
    }

    await table.put({
      ...(record as Record<string, unknown>),
      sync_status: 'synced',
      synced_at: new Date().toISOString()
    } as any);
  }
}

async function createConflictCopyIfNeeded(firestore: Firestore, mutation: SyncMutation) {
  if (!['journalEntries', 'questions'].includes(mutation.entity) || mutation.operation !== 'upsert') {
    return;
  }

  const collectionName = ENTITY_COLLECTION_MAP[mutation.entity];
  const existingSnapshot = await getDoc(doc(firestore, collectionName, mutation.record_id));

  if (!existingSnapshot.exists()) {
    return;
  }

  const existing = normalizeTimestamp(existingSnapshot.data()) as Record<string, unknown>;
  const localUpdated = mutation.payload.updated_at as string | undefined;
  const remoteUpdated = existing.updated_at as string | undefined;

  if (!localUpdated || !remoteUpdated || localUpdated !== remoteUpdated) {
    return;
  }

  const localBody = (mutation.payload.body ?? mutation.payload.notes ?? '') as string;
  const remoteBody = (existing.body ?? existing.notes ?? '') as string;

  if (!localBody || localBody === remoteBody) {
    return;
  }

  const conflictId = createId();
  const conflictPayload = {
    ...cleanPayload(mutation.payload),
    id: conflictId,
    conflict_of: mutation.record_id,
    is_conflict_copy: true,
    updated_at: new Date().toISOString()
  };

  await setDoc(doc(firestore, collectionName, conflictId), conflictPayload, { merge: true });
}

async function processMutation(firestore: Firestore, mutation: SyncMutation) {
  const collectionName = ENTITY_COLLECTION_MAP[mutation.entity];
  if (!collectionName) {
    throw new Error(`No collection map for entity ${mutation.entity}`);
  }

  await createConflictCopyIfNeeded(firestore, mutation);

  if (mutation.operation === 'delete') {
    await deleteDoc(doc(firestore, collectionName, mutation.record_id));
    return;
  }

  await setDoc(doc(firestore, collectionName, mutation.record_id), cleanPayload(mutation.payload), { merge: true });
}

export async function pullServerData(firestore: Firestore, userId: string, householdId: string) {
  const [
    readingSnapshot,
    journalsSnapshot,
    projectsSnapshot,
    questionsSnapshot,
    ownHighlightsSnapshot,
    sharedHighlightsSnapshot,
    ownLinksSnapshot,
    sharedLinksSnapshot,
    remindersSnapshot
  ] = await Promise.all([
      getDocs(query(collection(firestore, 'readingSessions'), where('household_id', '==', householdId))),
      getDocs(query(collection(firestore, 'journalEntries'), where('user_id', '==', userId))),
      getDocs(query(collection(firestore, 'studyProjects'), where('user_id', '==', userId))),
      getDocs(query(collection(firestore, 'studyQuestions'), where('user_id', '==', userId))),
      getDocs(query(collection(firestore, 'highlights'), where('user_id', '==', userId))),
      getDocs(
        query(
          collection(firestore, 'highlights'),
          where('household_id', '==', householdId),
          where('shared_to_household', '==', true)
        )
      ),
      getDocs(query(collection(firestore, 'linkReferences'), where('user_id', '==', userId))),
      getDocs(
        query(
          collection(firestore, 'linkReferences'),
          where('household_id', '==', householdId),
          where('shared_to_household', '==', true)
        )
      ),
      getDocs(query(collection(firestore, 'reminderSettings'), where('user_id', '==', userId)))
    ]);

  const reading = getDocsData(readingSnapshot);
  const journals = getDocsData(journalsSnapshot);
  const projects = getDocsData(projectsSnapshot);
  const questions = getDocsData(questionsSnapshot);

  const highlightMap = new Map<string, Record<string, unknown>>();
  for (const highlight of [...getDocsData(ownHighlightsSnapshot), ...getDocsData(sharedHighlightsSnapshot)]) {
    if (typeof highlight.id === 'string') {
      highlightMap.set(highlight.id, highlight);
    }
  }

  const linkMap = new Map<string, Record<string, unknown>>();
  for (const link of getDocsData(ownLinksSnapshot)) {
    if (typeof link.id === 'string') {
      linkMap.set(link.id, link);
    }
  }
  for (const link of getDocsData(sharedLinksSnapshot)) {
    if (typeof link.id === 'string') {
      linkMap.set(link.id, link);
    }
  }

  for (const [highlightId, highlight] of highlightMap.entries()) {
    const isShared = highlight.shared_to_household === true;
    const highlightOwner = typeof highlight.user_id === 'string' ? highlight.user_id : '';
    if (!isShared && highlightOwner !== userId) {
      highlightMap.delete(highlightId);
      for (const [linkId, link] of linkMap.entries()) {
        const linkParentId = typeof link.parent_id === 'string' ? link.parent_id : '';
        const linkOwner = typeof link.user_id === 'string' ? link.user_id : '';
        if (linkParentId === highlightId && linkOwner !== userId) {
          linkMap.delete(linkId);
        }
      }
    }
  }

  const links = [...linkMap.values()];
  const reminders = getDocsData(remindersSnapshot);

  await Promise.all([
    storeRemoteRecords('readingSessions', reading),
    storeRemoteRecords('journalEntries', journals),
    storeRemoteRecords('projects', projects),
    storeRemoteRecords('questions', questions),
    storeRemoteRecords('highlights', [...highlightMap.values()]),
    storeRemoteRecords('linkReferences', links),
    storeRemoteRecords('reminders', reminders)
  ]);

  await db.meta.put({
    key: 'last_pull_at',
    value: new Date().toISOString()
  });
}

export async function flushSyncQueue(firestore: Firestore) {
  const queued = await db.syncMutations.orderBy('updated_at').limit(150).toArray();
  if (!queued.length) {
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const mutation of queued) {
    try {
      await processMutation(firestore, mutation);
      await markLocalSynced(mutation.entity, mutation.record_id, new Date().toISOString());
      if (mutation.id !== undefined) {
        await db.syncMutations.delete(mutation.id);
      }
      synced += 1;
    } catch (error) {
      failed += 1;
      if (mutation.id !== undefined) {
        await db.syncMutations.update(mutation.id, {
          attempts: mutation.attempts + 1,
          last_error: error instanceof Error ? error.message : 'Unknown sync error'
        });
      }

      const localTable = getLocalTable(mutation.entity);
      if (localTable) {
        const current = await localTable.get(mutation.record_id);
        if (current) {
          await localTable.put({
            ...current,
            sync_status: 'failed'
          });
        }
      }
    }
  }

  return { synced, failed };
}
