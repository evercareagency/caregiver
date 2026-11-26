-- aide exempt week — NOT APPLIED
-- Do not run this against the live database until it is reviewed.
-- This file is not under supabase/migrations, so supabase db push will not apply it.
-- It does not alter timesheets, timesheet days, or any PDF column.
-- There is no holiday-pay column, rate, toggle, or multiplier.
-- A Thanksgiving (or any other) label stays a schedule mark only and is not stored here.
--
-- The caregiver row in this portal is public.aides (there is no caregivers table).
-- time_entry_mode is clock_in or exempt_manual.
-- exemption_reason and exempt_effective_from say why and from when.
-- Weekly hours and the three report answers live on aide_manual_days and
-- aide_manual_week_submits. The phone does not write the timesheet.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

alter table public.aides
  add column if not exists time_entry_mode text not null default 'clock_in',
  add column if not exists exemption_reason text,
  add column if not exists exempt_effective_from date;

alter table public.aides
  drop constraint if exists aides_time_entry_mode_chk;
alter table public.aides
  add constraint aides_time_entry_mode_chk
  check (time_entry_mode in ('clock_in', 'exempt_manual'));

comment on column public.aides.time_entry_mode is
  'clock_in or exempt_manual. Exempt aides enter a Mon–Sun week by hand.';
comment on column public.aides.exemption_reason is
  'Office reason this aide does not clock in. Not a pay rate.';
comment on column public.aides.exempt_effective_from is
  'First date manual weekly entry applies.';

create table if not exists public.aide_manual_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  aide_id uuid not null references public.aides (id),
  client_id uuid not null references public.clients (id),
  week_start date not null,
  day_date date not null,
  start_local time,
  end_local time,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aide_manual_days_note_len check (note is null or char_length(note) <= 2000),
  constraint aide_manual_days_week check (week_start = day_date - ((extract(isodow from day_date)::int + 6) % 7)),
  constraint aide_manual_days_span check (
    start_local is null or end_local is null or end_local > start_local
  ),
  constraint aide_manual_days_unique unique (aide_id, client_id, day_date)
);

create index if not exists aide_manual_days_aide_week_idx
  on public.aide_manual_days (aide_id, week_start);

create table if not exists public.aide_manual_week_submits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  aide_id uuid not null references public.aides (id),
  client_id uuid not null references public.clients (id),
  week_start date not null,
  hospital text,
  hospital_note text,
  fall text,
  fall_note text,
  change_answer text,
  change_note text,
  submitted_at timestamptz not null default clock_timestamp(),
  constraint aide_manual_week_answers check (
    hospital in ('yes', 'no')
    and fall in ('yes', 'no')
    and change_answer in ('yes', 'no')
    and (hospital = 'no' or nullif(btrim(hospital_note), '') is not null)
    and (fall = 'no' or nullif(btrim(fall_note), '') is not null)
    and (change_answer = 'no' or nullif(btrim(change_note), '') is not null)
  ),
  constraint aide_manual_week_unique unique (aide_id, client_id, week_start)
);

comment on table public.aide_manual_week_submits is
  'Office-only weekly answers. Not copied onto timesheets.';

alter table public.aide_manual_days enable row level security;
alter table public.aide_manual_week_submits enable row level security;
alter table public.aide_manual_days force row level security;
alter table public.aide_manual_week_submits force row level security;

revoke all on public.aide_manual_days from public, anon;
revoke all on public.aide_manual_week_submits from public, anon;
grant select, insert, update on public.aide_manual_days to authenticated;
grant select, insert on public.aide_manual_week_submits to authenticated;

drop policy if exists aide_manual_days_own on public.aide_manual_days;
create policy aide_manual_days_own
  on public.aide_manual_days
  for all
  to authenticated
  using (
    aide_id = (
      select a.id from public.aides a
      where a.profile_id = (select auth.uid())
        and coalesce(a.is_active, true)
        and a.time_entry_mode = 'exempt_manual'
      limit 1
    )
  )
  with check (
    aide_id = (
      select a.id from public.aides a
      where a.profile_id = (select auth.uid())
        and coalesce(a.is_active, true)
        and a.time_entry_mode = 'exempt_manual'
      limit 1
    )
  );

drop policy if exists aide_manual_week_submits_own on public.aide_manual_week_submits;
create policy aide_manual_week_submits_own
  on public.aide_manual_week_submits
  for select
  to authenticated
  using (
    aide_id = (
      select a.id from public.aides a
      where a.profile_id = (select auth.uid())
        and coalesce(a.is_active, true)
      limit 1
    )
  );

-- submitted_at is the database clock. The phone does not send it.
create or replace function private.aide_manual_week_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  org uuid;
  mode text;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in';
  end if;
  select a.id, a.org_id, a.time_entry_mode
    into me, org, mode
  from public.aides a
  where a.profile_id = (select auth.uid())
    and coalesce(a.is_active, true)
  limit 1;
  if me is null or mode is distinct from 'exempt_manual' then
    raise exception 'not an exempt aide';
  end if;
  if tg_op = 'INSERT' then
    new.aide_id := me;
    new.org_id := org;
    new.submitted_at := clock_timestamp();
    return new;
  end if;
  raise exception 'this week is already in';
end;
$$;

revoke all on function private.aide_manual_week_guard() from public, anon, authenticated;

drop trigger if exists aide_manual_week_guard on public.aide_manual_week_submits;
create trigger aide_manual_week_guard
  before insert or update on public.aide_manual_week_submits
  for each row
  execute function private.aide_manual_week_guard();

create or replace function public.aide_submit_exempt_week(
  p_client_id uuid,
  p_week_start date,
  p_hospital text,
  p_hospital_note text,
  p_fall text,
  p_fall_note text,
  p_change text,
  p_change_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  row public.aide_manual_week_submits;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in';
  end if;
  insert into public.aide_manual_week_submits (
    aide_id, client_id, week_start,
    hospital, hospital_note, fall, fall_note, change_answer, change_note
  )
  select a.id, p_client_id, p_week_start,
         p_hospital, p_hospital_note, p_fall, p_fall_note, p_change, p_change_note
  from public.aides a
  where a.profile_id = (select auth.uid())
    and coalesce(a.is_active, true)
    and a.time_entry_mode = 'exempt_manual'
  returning * into row;
  if row.id is null then
    raise exception 'not an exempt aide';
  end if;
  return jsonb_build_object(
    'id', row.id,
    'week_start', row.week_start,
    'submitted_at', row.submitted_at
  );
end;
$$;

revoke all on function public.aide_submit_exempt_week(uuid, date, text, text, text, text, text, text) from public, anon;
grant execute on function public.aide_submit_exempt_week(uuid, date, text, text, text, text, text, text) to authenticated;

comment on function public.aide_submit_exempt_week(uuid, date, text, text, text, text, text, text) is
  'Stores the three weekly answers. Does not write a timesheet. submitted_at is clock_timestamp().';
