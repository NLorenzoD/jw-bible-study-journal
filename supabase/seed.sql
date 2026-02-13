-- Optional SQL seed (requires replacing user UUIDs with real auth user IDs)
-- Replace these values before executing:
--   :user_one_id
--   :user_two_id

insert into public.households (id, name, created_by)
values ('11111111-1111-1111-1111-111111111111', 'Demo Household', ':user_one_id');

insert into public.household_members (household_id, user_id, role)
values
('11111111-1111-1111-1111-111111111111', ':user_one_id', 'owner'),
('11111111-1111-1111-1111-111111111111', ':user_two_id', 'member');
