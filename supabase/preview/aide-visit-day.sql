-- aide visit day — NOT APPLIED
-- Do not run this against the live database until Mo reviews it.
-- This file is not under supabase/migrations, so supabase db push will not apply it.
-- It does not alter timesheets, timesheet days, or any PDF column.
--
-- What already exists and is used by the page without this file:
--   clients.id, clients.name, clients.address
--   aides.id, aides.profile_id, aides.org_id
--   assignments.aide_id, assignments.client_id, assignments.is_active
--   office phone (216) 377-5991 already on the page
--
-- What this file adds, and the page needs before those parts are live:
--   clients.care_note
--       the client's care note on the visit card
--   public.client_visit_tasks
--       the task list (Tick all / Untick all). Office inserts rows. Aides only read
--       tasks for clients they are assigned to.
--   public.aide_visits
--       one open visit per aide. clock_in_at and clock_out_at are set to
--       clock_timestamp() by the guard trigger. The phone cannot supply either time.
--   public.aide_today_shift()
--       today's client, address, care note, booked-until end, and tasks
--   public.aide_clock_in(p_client_id)
--   public.aide_clock_out(p_visit_id, p_task_ids, p_office_note, p_aide_sig, p_client_sig)
--       office_note is stored only on aide_visits. It is not copied onto timesheets.
--
-- Schedule end time is read only when these relations already exist:
--   public.schedule_slot_patterns (client_id, usual_aide_id, weekday, start_local, end_local)
--   public.schedule_slot_day_marks (client_id, on_date, mark, cover_aide_id) optional
-- weekday is ISO: 1 = Monday … 7 = Sunday, America/New_York.
-- If the live table or column names differ, aide_today_shift still returns the
-- assigned clients and leaves start_local / end_local blank. Rename the lookup
-- in private.aide_shift_window to match the live columns. Do not guess a second write.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

alter table public.clients
  add column if not exists care_note text;

comment on column public.clients.care_note is
  'Aide-visible care note. Office writes it. Not a timesheet comment.';

create table if not exists public.client_visit_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  client_id uuid not null references public.clients (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint client_visit_tasks_label_len check (char_length(btrim(label)) between 1 and 200)
);

create index if not exists client_visit_tasks_client_active_idx
  on public.client_visit_tasks (client_id, sort_order)
  where is_active;

create table if not exists public.aide_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  aide_id uuid not null references public.aides (id),
  client_id uuid not null references public.clients (id),
  clock_in_at timestamptz not null default clock_timestamp(),
  clock_out_at timestamptz,
  task_ids uuid[] not null default '{}',
  office_note text,
  aide_sig text,
  client_sig text,
  created_at timestamptz not null default now(),
  constraint aide_visits_office_note_len check (office_note is null or char_length(office_note) <= 2000),
  constraint aide_visits_clock_order check (clock_out_at is null or clock_out_at >= clock_in_at),
  constraint aide_visits_sig_images check (
    (clock_out_at is null and aide_sig is null and client_sig is null)
    or (
      clock_out_at is not null
      and aide_sig like 'data:image/%'
      and client_sig like 'data:image/%'
      and cardinality(task_ids) >= 1
    )
  )
);

create unique index if not exists aide_visits_one_open_idx
  on public.aide_visits (aide_id)
  where clock_out_at is null;

create index if not exists aide_visits_aide_idx
  on public.aide_visits (aide_id, clock_in_at desc);

alter table public.client_visit_tasks enable row level security;
alter table public.aide_visits enable row level security;
alter table public.client_visit_tasks force row level security;
alter table public.aide_visits force row level security;

revoke all on public.client_visit_tasks from public, anon;
revoke all on public.aide_visits from public, anon;
grant select on public.client_visit_tasks to authenticated;
grant select, insert, update on public.aide_visits to authenticated;

-- Aides read tasks only for an assigned client. No insert, update, or delete.
drop policy if exists client_visit_tasks_select_assigned on public.client_visit_tasks;
create policy client_visit_tasks_select_assigned
  on public.client_visit_tasks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assignments g
      join public.aides a on a.id = g.aide_id
      where g.client_id = client_visit_tasks.client_id
        and a.profile_id = (select auth.uid())
        and coalesce(a.is_active, true)
        and coalesce(g.is_active, true)
    )
  );

drop policy if exists aide_visits_select_own on public.aide_visits;
create policy aide_visits_select_own
  on public.aide_visits
  for select
  to authenticated
  using (
    aide_id = (
      select a.id
      from public.aides a
      where a.profile_id = (select auth.uid())
        and coalesce(a.is_active, true)
      limit 1
    )
  );

drop policy if exists aide_visits_insert_own on public.aide_visits;
create policy aide_visits_insert_own
  on public.aide_visits
  for insert
  to authenticated
  with check (
    aide_id = (
      select a.id
      from public.aides a
      where a.profile_id = (select auth.uid())
        and coalesce(a.is_active, true)
      limit 1
    )
    and clock_out_at is null
  );

drop policy if exists aide_visits_update_own_open on public.aide_visits;
create policy aide_visits_update_own_open
  on public.aide_visits
  for update
  to authenticated
  using (
    clock_out_at is null
    and aide_id = (
      select a.id
      from public.aides a
      where a.profile_id = (select auth.uid())
        and coalesce(a.is_active, true)
      limit 1
    )
  )
  with check (
    aide_id = (
      select a.id
      from public.aides a
      where a.profile_id = (select auth.uid())
        and coalesce(a.is_active, true)
      limit 1
    )
  );

-- No delete policy. Aides cannot delete a visit.

create or replace function private.aide_self()
returns table (aide_id uuid, org_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.org_id
  from public.aides a
  where a.profile_id = (select auth.uid())
    and coalesce(a.is_active, true)
  limit 1;
$$;

revoke all on function private.aide_self() from public, anon, authenticated;

-- Best-effort booked-until window. Returns no row when the schedule table is absent
-- or the column names do not match. Never raises to the aide.
create or replace function private.aide_shift_window(p_aide uuid, p_day date, p_dow integer)
returns table (client_id uuid, start_local text, end_local text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_pattern boolean;
  has_mark boolean;
begin
  if (select auth.uid()) is null or p_aide is null then
    return;
  end if;

  select
    to_regclass('public.schedule_slot_patterns') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'schedule_slot_patterns' and column_name = 'client_id'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'schedule_slot_patterns' and column_name = 'usual_aide_id'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'schedule_slot_patterns' and column_name = 'weekday'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'schedule_slot_patterns' and column_name = 'end_local'
    )
  into has_pattern;

  select
    to_regclass('public.schedule_slot_day_marks') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'schedule_slot_day_marks' and column_name = 'client_id'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'schedule_slot_day_marks' and column_name = 'on_date'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'schedule_slot_day_marks' and column_name = 'mark'
    )
  into has_mark;

  if not has_pattern then
    return;
  end if;

  begin
    if has_mark then
      return query execute $q$
        select p.client_id,
               coalesce(p.start_local::text, ''),
               coalesce(p.end_local::text, '')
        from public.schedule_slot_patterns p
        where p.weekday = $2
          and coalesce(p.end_local::text, '') <> ''
          and (
            (
              p.usual_aide_id = $1
              and not exists (
                select 1
                from public.schedule_slot_day_marks m
                where m.client_id = p.client_id
                  and m.on_date = $3
                  and m.mark in ('missed', 'on_hold')
              )
            )
            or exists (
              select 1
              from public.schedule_slot_day_marks m
              where m.client_id = p.client_id
                and m.on_date = $3
                and m.mark = 'cover'
                and m.cover_aide_id = $1
            )
          )
        order by p.start_local::text nulls last
      $q$ using p_aide, p_dow, p_day;
    else
      return query execute $q$
        select p.client_id,
               coalesce(p.start_local::text, ''),
               coalesce(p.end_local::text, '')
        from public.schedule_slot_patterns p
        where p.usual_aide_id = $1
          and p.weekday = $2
          and coalesce(p.end_local::text, '') <> ''
        order by p.start_local::text nulls last
      $q$ using p_aide, p_dow;
    end if;
  exception
    when undefined_table or undefined_column or datatype_mismatch then
      return;
  end;
end;
$$;

revoke all on function private.aide_shift_window(uuid, date, integer) from public, anon, authenticated;

create or replace function private.aide_today_shift()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid;
  today date;
  dow integer;
  shifts jsonb;
  open_row jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in';
  end if;

  select s.aide_id into me from private.aide_self() s;
  if me is null then
    return jsonb_build_object('shifts', '[]'::jsonb, 'open_visit', null);
  end if;

  today := (timezone('America/New_York', clock_timestamp()))::date;
  dow := extract(isodow from today)::int;

  select coalesce(jsonb_agg(item order by item->>'client_name'), '[]'::jsonb)
  into shifts
  from (
    select jsonb_build_object(
      'client_id', c.id,
      'client_name', coalesce(c.name, ''),
      'address', coalesce(c.address, ''),
      'care_note', coalesce(c.care_note, ''),
      'start_local', coalesce((
        select w.start_local
        from private.aide_shift_window(me, today, dow) w
        where w.client_id = c.id
          and w.end_local <> ''
        limit 1
      ), ''),
      'end_local', coalesce((
        select w.end_local
        from private.aide_shift_window(me, today, dow) w
        where w.client_id = c.id
          and w.end_local <> ''
        limit 1
      ), ''),
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label) order by t.sort_order, t.label)
        from public.client_visit_tasks t
        where t.client_id = c.id
          and t.is_active
      ), '[]'::jsonb)
    ) as item
    from public.assignments g
    join public.clients c on c.id = g.client_id
    where g.aide_id = me
      and coalesce(g.is_active, true)
      and coalesce(c.is_active, true)
  ) rows;

  select jsonb_build_object(
    'id', v.id,
    'client_id', v.client_id,
    'clock_in_at', v.clock_in_at
  )
  into open_row
  from public.aide_visits v
  where v.aide_id = me
    and v.clock_out_at is null
  order by v.clock_in_at desc
  limit 1;

  return jsonb_build_object('shifts', shifts, 'open_visit', open_row);
end;
$$;

revoke all on function private.aide_today_shift() from public, anon, authenticated;

create or replace function public.aide_today_shift()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select private.aide_today_shift();
$$;

revoke all on function public.aide_today_shift() from public, anon;
grant execute on function public.aide_today_shift() to authenticated;

-- Clock times are never arguments. The guard writes clock_timestamp().
create or replace function private.aide_visits_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in';
  end if;
  select s.aide_id, s.org_id into me, org from private.aide_self() s;
  if me is null then
    raise exception 'not an aide';
  end if;

  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from public.assignments g
      where g.aide_id = me
        and g.client_id = new.client_id
        and coalesce(g.is_active, true)
    ) then
      raise exception 'not assigned';
    end if;
    if exists (
      select 1 from public.aide_visits v
      where v.aide_id = me and v.clock_out_at is null
    ) then
      raise exception 'already clocked in';
    end if;
    new.aide_id := me;
    new.org_id := org;
    new.clock_in_at := clock_timestamp();
    new.clock_out_at := null;
    new.task_ids := '{}';
    new.office_note := null;
    new.aide_sig := null;
    new.client_sig := null;
    return new;
  end if;

  if old.aide_id is distinct from me then
    raise exception 'not your visit';
  end if;
  if old.clock_out_at is not null then
    raise exception 'already clocked out';
  end if;

  new.id := old.id;
  new.aide_id := old.aide_id;
  new.org_id := old.org_id;
  new.client_id := old.client_id;
  new.clock_in_at := old.clock_in_at;
  new.created_at := old.created_at;
  new.clock_out_at := clock_timestamp();
  if new.task_ids is null or cardinality(new.task_ids) < 1 then
    raise exception 'check at least one task';
  end if;
  if coalesce(new.aide_sig, '') not like 'data:image/%'
     or coalesce(new.client_sig, '') not like 'data:image/%' then
    raise exception 'signatures must be drawn images';
  end if;
  if new.office_note is not null then
    new.office_note := btrim(new.office_note);
    if new.office_note = '' then
      new.office_note := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.aide_visits_guard() from public, anon, authenticated;

drop trigger if exists aide_visits_guard on public.aide_visits;
create trigger aide_visits_guard
  before insert or update on public.aide_visits
  for each row
  execute function private.aide_visits_guard();

create or replace function public.aide_clock_in(p_client_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  row public.aide_visits;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in';
  end if;
  if p_client_id is null then
    raise exception 'pick a client';
  end if;
  insert into public.aide_visits (aide_id, client_id)
  select s.aide_id, p_client_id
  from private.aide_self() s
  returning * into row;
  if row.id is null then
    raise exception 'not an aide';
  end if;
  return jsonb_build_object(
    'id', row.id,
    'client_id', row.client_id,
    'clock_in_at', row.clock_in_at
  );
end;
$$;

revoke all on function public.aide_clock_in(uuid) from public, anon;
grant execute on function public.aide_clock_in(uuid) to authenticated;

create or replace function public.aide_clock_out(
  p_visit_id uuid,
  p_task_ids uuid[],
  p_office_note text,
  p_aide_sig text,
  p_client_sig text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  row public.aide_visits;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in';
  end if;
  update public.aide_visits
  set task_ids = coalesce(p_task_ids, '{}'),
      office_note = p_office_note,
      aide_sig = p_aide_sig,
      client_sig = p_client_sig
  where id = p_visit_id
    and clock_out_at is null
  returning * into row;
  if row.id is null then
    raise exception 'no open visit';
  end if;
  return jsonb_build_object(
    'id', row.id,
    'clock_in_at', row.clock_in_at,
    'clock_out_at', row.clock_out_at
  );
end;
$$;

revoke all on function public.aide_clock_out(uuid, uuid[], text, text, text) from public, anon;
grant execute on function public.aide_clock_out(uuid, uuid[], text, text, text) to authenticated;

-- The clock-in insert selects private.aide_self(), so authenticated needs execute
-- on that one helper. It only returns the signed-in aide. The schedule reader stays revoked.
grant execute on function private.aide_self() to authenticated;

comment on function public.aide_clock_in(uuid) is
  'Opens one visit. clock_in_at is clock_timestamp(). No time argument.';
comment on function public.aide_clock_out(uuid, uuid[], text, text, text) is
  'Closes the visit. clock_out_at is clock_timestamp(). office_note stays on aide_visits.';

-- Office read and task setup, only when the live helper already exists.
-- Aides still cannot insert tasks. Until this policy exists, task rows are
-- inserted by the table owner (the role that runs this script).
do $$
begin
  if to_regprocedure('public.is_scheduler_office()') is null then
    raise notice 'is_scheduler_office() is not in this database. Office task setup stays with the table owner.';
    return;
  end if;
  execute 'drop policy if exists client_visit_tasks_office_all on public.client_visit_tasks';
  execute 'create policy client_visit_tasks_office_all on public.client_visit_tasks for all to authenticated using ((select public.is_scheduler_office())) with check ((select public.is_scheduler_office()))';
  execute 'drop policy if exists aide_visits_office_select on public.aide_visits';
  execute 'create policy aide_visits_office_select on public.aide_visits for select to authenticated using ((select public.is_scheduler_office()))';
end
$$;
