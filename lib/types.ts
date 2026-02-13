export type UUID = string;

export type StreakInput = 'reading' | 'journal' | 'project' | 'highlight';

export type Role = 'owner' | 'member';

export type QuestionStatus = 'open' | 'in_progress' | 'answered';

export interface LocalEntity {
  id: UUID;
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
  sync_status: 'pending' | 'synced' | 'failed';
}

export interface ReadingSession extends LocalEntity {
  user_id: UUID;
  household_id: UUID;
  session_at: string;
  book: string;
  chapter_start: number;
  chapter_end: number;
  verse_range?: string;
  note?: string;
}

export interface JournalEntry extends LocalEntity {
  user_id: UUID;
  household_id: UUID;
  entry_date: string;
  body: string;
  tags: string[];
  is_conflict_copy?: boolean;
  conflict_of?: UUID | null;
}

export interface StudyProject extends LocalEntity {
  user_id: UUID;
  household_id: UUID;
  title: string;
  description?: string;
  archived: boolean;
}

export interface StudyQuestion extends LocalEntity {
  user_id: UUID;
  household_id: UUID;
  project_id: UUID;
  question: string;
  status: QuestionStatus;
  notes?: string;
  conclusion?: string;
  shareable_insight?: string;
  is_conflict_copy?: boolean;
  conflict_of?: UUID | null;
}

export interface Highlight extends LocalEntity {
  user_id: UUID;
  household_id: UUID;
  reference: string;
  summary: string;
  tags: string[];
  project_id?: UUID | null;
  shared_to_household: boolean;
}

export interface LinkReference extends LocalEntity {
  user_id: UUID;
  household_id: UUID;
  parent_type: 'highlight' | 'question';
  parent_id: UUID;
  shared_to_household: boolean;
  url: string;
  title?: string;
  publication_name?: string;
  section_heading?: string;
}

export interface ReminderSetting extends LocalEntity {
  user_id: UUID;
  household_id: UUID;
  enabled: boolean;
  reminder_time: string;
  timezone: string;
  last_shown_at?: string | null;
}

export interface HouseholdContext {
  householdId: UUID;
  role: Role;
}

export interface SyncMutation {
  id?: number;
  mutation_id: UUID;
  entity: string;
  operation: 'upsert' | 'delete';
  record_id: UUID;
  payload: Record<string, unknown>;
  updated_at: string;
  attempts: number;
  last_error?: string;
}
