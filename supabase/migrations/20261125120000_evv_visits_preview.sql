-- EverCare Caregiver EVV clock — PREVIEW ONLY.
-- The owner applies this by hand in the Supabase SQL editor.
-- This change set does not run it, and the portal does not show the clock
-- unless the page URL contains ?evv=1.
--
-- Stores clock-in and clock-out on public.evv_visits for the signed-in aide.
-- Does not call an external EVV vendor, an aggregator, or a claims API.
-- Do not put a privileged database key in the caregiver page. The page uses
-- the aide session only.
--
-- Assumptions taken from the caregiver portal (index.html):
--   aides.id            = currentUser.sbAideId
--   aides.profile_id    = auth.uid() = currentUser.sbUserId
--   aides.org_id        = currentUser.sbOrgId
--   clients.id          = the timesheet client id
--   assignments.aide_id = aides.id or, if the office stored it that way, auth.uid()
--   assignments.client_id, assignments.is_active
-- Office read: a profile in the same org that is not an aide row.
-- If office staff are also stored in aides, replace evv_visits_office_read
-- with a policy that matches the real staff role column before relying on it.

begin;

create table public.evv_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  aide_id uuid not null,
  aide_user_id uuid not null,
  client_id uuid not null,
  aide_name text not null,
  client_name text not null,
  service_name text not null,
  status text not null default 'open',
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  in_lat numeric(7,4) not null,
  in_lng numeric(7,4) not null,
  out_lat numeric(7,4),
  out_lng numeric(7,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evv_visits_status_chk check (status in ('open', 'ready')),
  constraint evv_visits_service_chk check (service_name in ('Personal care', 'Homemaking', 'Companion', 'Respite')),
  constraint evv_visits_names_chk check (
    char_length(btrim(aide_name)) between 1 and 120
    and char_length(btrim(client_name)) between 1 and 120
  ),
  constraint evv_visits_in_lat_chk check (in_lat >= -90 and in_lat <= 90),
  constraint evv_visits_in_lng_chk check (in_lng >= -180 and in_lng <= 180),
  constraint evv_visits_out_lat_chk check (out_lat is null or (out_lat >= -90 and out_lat <= 90)),
  constraint evv_visits_out_lng_chk check (out_lng is null or (out_lng >= -180 and out_lng <= 180)),
  constraint evv_visits_open_shape_chk check (
    (status = 'open' and clock_out_at is null and out_lat is null and out_lng is null)
    or
    (status = 'ready' and clock_out_at is not null and out_lat is not null and out_lng is not null)
  )
);

comment on table public.evv_visits is
  'Caregiver clock preview. One open visit per aide. Ready means clocked out and not sent anywhere.';

create unique index evv_visits_one_open_per_aide
  on public.evv_visits (aide_user_id)
  where status = 'open';

create index evv_visits_aide_client_in
  on public.evv_visits (aide_user_id, client_id, clock_in_at desc);

create or replace function public.evv_visits_before_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  aide public.aides%rowtype;
  client_name_text text;
  assigned boolean;
begin
  if tg_op = 'INSERT' then
    select * into aide
    from public.aides
    where profile_id = auth.uid()
      and is_active is true
    limit 1;
    if aide.id is null then
      raise exception 'Not an aide account';
    end if;

    select c.name into client_name_text
    from public.clients c
    where c.id = new.client_id
      and c.is_active is true;
    if client_name_text is null or btrim(client_name_text) = '' then
      raise exception 'Pick one of your clients';
    end if;

    select exists (
      select 1
      from public.assignments g
      where g.client_id = new.client_id
        and g.is_active is not false
        and (g.aide_id = aide.id or g.aide_id = auth.uid())
    ) into assigned;
    if not assigned then
      raise exception 'Pick one of your clients';
    end if;

    if new.service_name not in ('Personal care', 'Homemaking', 'Companion', 'Respite') then
      raise exception 'Pick a service';
    end if;
    if new.in_lat is null or new.in_lng is null then
      raise exception 'Location is required';
    end if;

    new.aide_user_id := auth.uid();
    new.aide_id := aide.id;
    new.org_id := aide.org_id;
    new.aide_name := coalesce(nullif(btrim(aide.full_name), ''), aide.username);
    new.client_name := btrim(client_name_text);
    new.status := 'open';
    new.clock_out_at := null;
    new.out_lat := null;
    new.out_lng := null;
    if new.clock_in_at is null then
      new.clock_in_at := now();
    end if;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.aide_user_id is distinct from auth.uid() then
      raise exception 'Not your visit';
    end if;
    if old.status is distinct from 'open' or new.status is distinct from 'ready' then
      raise exception 'Only an open visit can be clocked out';
    end if;
    if new.clock_out_at is null or new.out_lat is null or new.out_lng is null then
      raise exception 'Location is required';
    end if;

    new.id := old.id;
    new.org_id := old.org_id;
    new.aide_id := old.aide_id;
    new.aide_user_id := old.aide_user_id;
    new.client_id := old.client_id;
    new.aide_name := old.aide_name;
    new.client_name := old.client_name;
    new.service_name := old.service_name;
    new.clock_in_at := old.clock_in_at;
    new.in_lat := old.in_lat;
    new.in_lng := old.in_lng;
    new.created_at := old.created_at;
    new.status := 'ready';
    new.updated_at := now();
    return new;
  end if;

  raise exception 'Not allowed';
end;
$$;

create trigger evv_visits_before_write
  before insert or update on public.evv_visits
  for each row execute function public.evv_visits_before_write();

alter table public.evv_visits enable row level security;
alter table public.evv_visits force row level security;

revoke all on public.evv_visits from public;
revoke all on public.evv_visits from anon;
revoke all on public.evv_visits from authenticated;
grant select, insert, update on public.evv_visits to authenticated;

-- Aide: read only their own rows. No cross-aide select.
create policy evv_visits_aide_select
  on public.evv_visits
  for select
  to authenticated
  using (aide_user_id = auth.uid());

-- Aide: insert only. The trigger forces status open, this aide, and an assigned client.
create policy evv_visits_aide_insert
  on public.evv_visits
  for insert
  to authenticated
  with check (
    aide_user_id = auth.uid()
    and status = 'open'
    and clock_out_at is null
  );

-- Aide: update only their own open visit, and only into ready (clock out).
create policy evv_visits_aide_update
  on public.evv_visits
  for update
  to authenticated
  using (aide_user_id = auth.uid() and status = 'open')
  with check (aide_user_id = auth.uid() and status = 'ready');

-- No DELETE policy and no DELETE grant. Aides cannot delete visits.

-- Office / admin read, separate from the aide policies.
-- A signed-in profile in the same org who is not an aide can read visits.
-- Aides do not match this policy, so it does not widen aide access.
create policy evv_visits_office_read
  on public.evv_visits
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.org_id = evv_visits.org_id
        and not exists (
          select 1
          from public.aides a
          where a.profile_id = auth.uid()
        )
    )
  );

commit;
