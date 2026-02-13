import Dexie, { Table } from 'dexie';

import {
  Highlight,
  JournalEntry,
  LinkReference,
  ReadingSession,
  ReminderSetting,
  StudyProject,
  StudyQuestion,
  SyncMutation
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
  }
}

export const db = new BibleJournalDB();
