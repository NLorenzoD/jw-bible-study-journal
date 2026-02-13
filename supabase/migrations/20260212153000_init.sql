create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Household',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reading_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  session_at timestamptz not null,
  book text not null,
  chapter_start int not null,
  chapter_end int not null,
  verse_range text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  entry_date timestamptz not null,
  body text not null,
  tags text[] not null default '{}',
  is_conflict_copy boolean not null default false,
  conflict_of uuid references public.journal_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  description text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_questions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  project_id uuid not null references public.study_projects(id) on delete cascade,
  question text not null,
  status text not null check (status in ('open', 'in_progress', 'answered')),
  notes text,
  conclusion text,
  shareable_insight text,
  is_conflict_copy boolean not null default false,
  conflict_of uuid references public.study_questions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.highlights (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  reference text not null,
  summary text not null,
  tags text[] not null default '{}',
  project_id uuid references public.study_projects(id) on delete set null,
  shared_to_household boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.link_references (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  parent_type text not null check (parent_type in ('highlight', 'question')),
  parent_id uuid not null,
  url text not null,
  title text,
  publication_name text,
  section_heading text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reminder_settings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade unique,
  household_id uuid not null references public.households(id) on delete cascade,
  enabled boolean not null default false,
  reminder_time text not null,
  timezone text not null,
  last_shown_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_household_members_user on public.household_members(user_id);
create index if not exists idx_reading_sessions_household on public.reading_sessions(household_id);
create index if not exists idx_reading_sessions_user_session on public.reading_sessions(user_id, session_at desc);
create index if not exists idx_journal_entries_user_date on public.journal_entries(user_id, entry_date desc);
create index if not exists idx_projects_user on public.study_projects(user_id);
create index if not exists idx_questions_project on public.study_questions(project_id);
create index if not exists idx_highlights_household_shared on public.highlights(household_id, shared_to_household);
create index if not exists idx_link_refs_parent on public.link_references(parent_type, parent_id);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_households_updated_at
before update on public.households
for each row execute function public.set_updated_at();

create trigger set_reading_sessions_updated_at
before update on public.reading_sessions
for each row execute function public.set_updated_at();

create trigger set_journal_entries_updated_at
before update on public.journal_entries
for each row execute function public.set_updated_at();

create trigger set_study_projects_updated_at
before update on public.study_projects
for each row execute function public.set_updated_at();

create trigger set_study_questions_updated_at
before update on public.study_questions
for each row execute function public.set_updated_at();

create trigger set_highlights_updated_at
before update on public.highlights
for each row execute function public.set_updated_at();

create trigger set_link_references_updated_at
before update on public.link_references
for each row execute function public.set_updated_at();

create trigger set_reminders_updated_at
before update on public.reminder_settings
for each row execute function public.set_updated_at();

create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household
      and hm.user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household
      and hm.user_id = auth.uid()
      and hm.role = 'owner'
  );
$$;

create or replace function public.bootstrap_household()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_household uuid;
  new_household uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.profiles(id, email, display_name)
  values (auth.uid(), (auth.jwt() ->> 'email'), null)
  on conflict (id) do nothing;

  select hm.household_id
  into current_household
  from public.household_members hm
  where hm.user_id = auth.uid()
  limit 1;

  if current_household is not null then
    return current_household;
  end if;

  insert into public.households(name, created_by)
  values ('Household', auth.uid())
  returning id into new_household;

  insert into public.household_members(household_id, user_id, role)
  values (new_household, auth.uid(), 'owner');

  return new_household;
end;
$$;

grant execute on function public.bootstrap_household() to authenticated;

create or replace function public.accept_household_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.household_invites;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into invite_row
  from public.household_invites hi
  where hi.token = invite_token
    and hi.used_at is null
    and hi.expires_at > now()
  limit 1;

  if invite_row.id is null then
    raise exception 'Invite is invalid or expired';
  end if;

  delete from public.household_members where user_id = auth.uid();

  insert into public.household_members(household_id, user_id, role)
  values (invite_row.household_id, auth.uid(), 'member');

  update public.household_invites
  set used_at = now()
  where id = invite_row.id;

  return invite_row.household_id;
end;
$$;

grant execute on function public.accept_household_invite(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.journal_entries enable row level security;
alter table public.study_projects enable row level security;
alter table public.study_questions enable row level security;
alter table public.highlights enable row level security;
alter table public.link_references enable row level security;
alter table public.reminder_settings enable row level security;

create policy "profiles_select_own"
on public.profiles for select
using (id = auth.uid());

create policy "profiles_upsert_own"
on public.profiles for all
using (id = auth.uid())
with check (id = auth.uid());

create policy "households_member_read"
on public.households for select
using (public.is_household_member(id));

create policy "household_members_member_read"
on public.household_members for select
using (public.is_household_member(household_id));

create policy "household_invites_owner_manage"
on public.household_invites for all
using (public.is_household_owner(household_id))
with check (public.is_household_owner(household_id));

create policy "reading_sessions_household_read"
on public.reading_sessions for select
using (public.is_household_member(household_id));

create policy "reading_sessions_owner_write"
on public.reading_sessions for all
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_household_member(household_id));

create policy "journal_entries_owner_only"
on public.journal_entries for all
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_household_member(household_id));

create policy "study_projects_owner_only"
on public.study_projects for all
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_household_member(household_id));

create policy "study_questions_owner_only"
on public.study_questions for all
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_household_member(household_id));

create policy "highlights_private_or_shared_read"
on public.highlights for select
using (
  user_id = auth.uid()
  or (shared_to_household = true and public.is_household_member(household_id))
);

create policy "highlights_owner_write"
on public.highlights for all
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_household_member(household_id));

create policy "link_references_owner_or_shared_highlights"
on public.link_references for select
using (
  user_id = auth.uid()
  or (
    parent_type = 'highlight'
    and exists (
      select 1
      from public.highlights h
      where h.id = parent_id
        and h.shared_to_household = true
        and public.is_household_member(h.household_id)
    )
  )
);

create policy "link_references_owner_write"
on public.link_references for all
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_household_member(household_id));

create policy "reminder_settings_owner_only"
on public.reminder_settings for all
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_household_member(household_id));
