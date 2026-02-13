import Dexie, { Table } from 'dexie';

import {
  Highlight,
  JournalEntry,
  LinkReference,
  ReadingSession,
  ReminderSetting,
  StudyProject,
  StudyQuestion,
  SyncMutation,
  UserTag
} from '@/lib/types';

export interface MetaRecord {
  key: string;
  value: string;
}

class BibleJournalDB extends Dexie {
  readingSessions!: Table<ReadingSession, string>;
  journalEntries!: Table<JournalEntry, string>;
  projects!: Table<StudyProject, string>;
  questions!: Table<StudyQuestion, string>;
  highlights!: Table<Highlight, string>;
  linkReferences!: Table<LinkReference, string>;
  reminders!: Table<ReminderSetting, string>;
  userTags!: Table<UserTag, string>;
  syncMutations!: Table<SyncMutation, number>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super('bible-journal-db');

    this.version(1).stores({
      readingSessions: 'id,user_id,household_id,session_at,book,updated_at,sync_status',
      journalEntries: 'id,user_id,household_id,entry_date,updated_at,sync_status,is_conflict_copy',
      projects: 'id,user_id,household_id,archived,updated_at,sync_status',
      questions: 'id,user_id,household_id,project_id,status,updated_at,sync_status,is_conflict_copy',
      highlights: 'id,user_id,household_id,project_id,shared_to_household,updated_at,sync_status',
      linkReferences: 'id,user_id,household_id,parent_type,parent_id,updated_at,sync_status,url',
      reminders: 'id,user_id,household_id,enabled,updated_at,sync_status',
      syncMutations: '++id,mutation_id,entity,operation,record_id,updated_at,attempts',
      meta: 'key'
    });

    this.version(2)
      .stores({
        readingSessions: 'id,user_id,household_id,session_at,book,updated_at,sync_status',
        journalEntries: 'id,user_id,household_id,entry_date,updated_at,sync_status,is_conflict_copy',
        projects: 'id,user_id,household_id,archived,updated_at,sync_status',
        questions: 'id,user_id,household_id,project_id,status,updated_at,sync_status,is_conflict_copy',
        highlights: 'id,user_id,household_id,project_id,shared_to_household,updated_at,sync_status',
        linkReferences: 'id,user_id,household_id,parent_type,parent_id,updated_at,sync_status,url',
        reminders: 'id,user_id,household_id,enabled,updated_at,sync_status',
        userTags: 'id,user_id,tag,last_used_at',
        syncMutations: '++id,mutation_id,entity,operation,record_id,updated_at,attempts',
        meta: 'key'
      })
      .upgrade(async (tx) => {
        const highlights = await tx.table('highlights').toArray();
        const seen = new Set<string>();

        for (const raw of highlights) {
          const highlight = raw as {
            user_id?: string;
            tags?: unknown;
            updated_at?: string;
            created_at?: string;
          };

          const userId = highlight.user_id;
          if (!userId || !Array.isArray(highlight.tags)) {
            continue;
          }

          const timestamp = highlight.updated_at ?? highlight.created_at ?? new Date().toISOString();
          for (const entry of highlight.tags) {
            if (typeof entry !== 'string') {
              continue;
            }

            const normalized = entry.trim().toLowerCase();
            if (!normalized) {
              continue;
            }

            const key = `${userId}:${normalized}`;
            if (seen.has(key)) {
              continue;
            }
            seen.add(key);

            await tx.table('userTags').put({
              id: `${userId}_${normalized}`,
              user_id: userId,
              tag: normalized,
              created_at: timestamp,
              last_used_at: timestamp
            });
          }
        }
      });
  }
}

export const db = new BibleJournalDB();
