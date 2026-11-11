create index if not exists expenses_paid_by_idx on public.expenses (paid_by);

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
      and g.created_by = (select auth.uid())
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
      and g.created_by = (select auth.uid())
  );
$$;

drop policy "owners can select groups" on public.groups;
drop policy "owners can insert groups" on public.groups;
drop policy "owners can update groups" on public.groups;
drop policy "owners can delete groups" on public.groups;

create policy "owners can select groups"
  on public.groups for select to authenticated
  using (created_by = (select auth.uid()));

create policy "owners can insert groups"
  on public.groups for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "owners can update groups"
  on public.groups for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "owners can delete groups"
  on public.groups for delete to authenticated
  using (created_by = (select auth.uid()));
