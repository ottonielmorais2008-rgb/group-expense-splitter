-- Group expense splitter schema, RLS, and demo-friendly auth trigger.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 200),
  amount_cents integer not null check (amount_cents > 0),
  paid_by uuid not null references public.group_members (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.expense_participants (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  member_id uuid not null references public.group_members (id) on delete restrict,
  primary key (expense_id, member_id)
);

create index groups_created_by_idx on public.groups (created_by);
create index group_members_group_id_idx on public.group_members (group_id);
create index expenses_group_id_idx on public.expenses (group_id);
create index expense_participants_member_id_idx on public.expense_participants (member_id);

create or replace function private.is_group_owner(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = gid
      and g.created_by = auth.uid()
  );
$$;

create or replace function private.is_expense_owner(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.expenses e
    join public.groups g on g.id = e.group_id
    where e.id = eid
      and g.created_by = auth.uid()
  );
$$;

create or replace function private.member_in_group(mid uuid, gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members m
    where m.id = mid
      and m.group_id = gid
  );
$$;

revoke all on function private.is_group_owner(uuid) from public;
revoke all on function private.is_expense_owner(uuid) from public;
revoke all on function private.member_in_group(uuid, uuid) from public;
grant execute on function private.is_group_owner(uuid) to authenticated;
grant execute on function private.is_expense_owner(uuid) to authenticated;
grant execute on function private.member_in_group(uuid, uuid) to authenticated;

create or replace function private.enforce_expense_payer_in_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.member_in_group(new.paid_by, new.group_id) then
    raise exception 'payer must belong to the expense group';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_participant_in_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense_group uuid;
begin
  select e.group_id into expense_group
  from public.expenses e
  where e.id = new.expense_id;

  if expense_group is null or not private.member_in_group(new.member_id, expense_group) then
    raise exception 'participant must belong to the expense group';
  end if;
  return new;
end;
$$;

create trigger expenses_payer_in_group
  before insert or update on public.expenses
  for each row
  execute function private.enforce_expense_payer_in_group();

create trigger expense_participants_in_group
  before insert or update on public.expense_participants
  for each row
  execute function private.enforce_participant_in_group();

-- Hosted projects confirm emails by default, and this demo has no custom SMTP.
-- Auto-confirm new users so sign-up works without an inbox. The app still
-- uses email + password; treat this as a public demo, not a verified-identity
-- production setup.
create or replace function private.auto_confirm_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now())
  where id = new.id
    and email_confirmed_at is null;
  return new;
end;
$$;

create trigger auto_confirm_user
  after insert on auth.users
  for each row
  execute function private.auto_confirm_user();

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;

create policy "owners can select groups"
  on public.groups for select to authenticated
  using (created_by = auth.uid());

create policy "owners can insert groups"
  on public.groups for insert to authenticated
  with check (created_by = auth.uid());

create policy "owners can update groups"
  on public.groups for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "owners can delete groups"
  on public.groups for delete to authenticated
  using (created_by = auth.uid());

create policy "owners can select members"
  on public.group_members for select to authenticated
  using (private.is_group_owner(group_id));

create policy "owners can insert members"
  on public.group_members for insert to authenticated
  with check (private.is_group_owner(group_id));

create policy "owners can update members"
  on public.group_members for update to authenticated
  using (private.is_group_owner(group_id))
  with check (private.is_group_owner(group_id));

create policy "owners can delete members"
  on public.group_members for delete to authenticated
  using (private.is_group_owner(group_id));

create policy "owners can select expenses"
  on public.expenses for select to authenticated
  using (private.is_group_owner(group_id));

create policy "owners can insert expenses"
  on public.expenses for insert to authenticated
  with check (
    private.is_group_owner(group_id)
    and private.member_in_group(paid_by, group_id)
  );

create policy "owners can update expenses"
  on public.expenses for update to authenticated
  using (private.is_group_owner(group_id))
  with check (
    private.is_group_owner(group_id)
    and private.member_in_group(paid_by, group_id)
  );

create policy "owners can delete expenses"
  on public.expenses for delete to authenticated
  using (private.is_group_owner(group_id));

create policy "owners can select participants"
  on public.expense_participants for select to authenticated
  using (private.is_expense_owner(expense_id));

create policy "owners can insert participants"
  on public.expense_participants for insert to authenticated
  with check (private.is_expense_owner(expense_id));

create policy "owners can update participants"
  on public.expense_participants for update to authenticated
  using (private.is_expense_owner(expense_id))
  with check (private.is_expense_owner(expense_id));

create policy "owners can delete participants"
  on public.expense_participants for delete to authenticated
  using (private.is_expense_owner(expense_id));
