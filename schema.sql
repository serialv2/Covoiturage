-- COVOIT'CP - Schéma Supabase V1
-- À exécuter dans Supabase > SQL Editor.
-- Cette version prévoit plusieurs établissements et plusieurs groupes.

create extension if not exists pgcrypto;

create table if not exists public.establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  created_at timestamptz not null default now()
);

insert into public.establishments (name, city)
select 'Centre pénitentiaire de Maubeuge', 'Maubeuge'
where not exists (
  select 1 from public.establishments
  where name = 'Centre pénitentiaire de Maubeuge'
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references public.establishments(id) on delete set null,
  name text not null check (char_length(name) between 3 and 100),
  meeting_point text not null check (char_length(meeting_point) between 3 and 150),
  invite_code text not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  trip_date date not null,
  departure_time time not null,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  note text check (note is null or char_length(note) <= 100),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_passengers (
  trip_id uuid not null references public.trips(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (trip_id, passenger_id)
);

create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_trips_group_date on public.trips(group_id, trip_date desc);
create index if not exists idx_trips_driver on public.trips(driver_id);
create index if not exists idx_trip_passengers_passenger on public.trip_passengers(passenger_id);

-- Les relations nommées facilitent les jointures Supabase du frontend.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trips_driver_id_fkey') then
    alter table public.trips
      add constraint trips_driver_id_fkey
      foreign key (driver_id) references public.profiles(id) on delete restrict;
  end if;
exception when duplicate_object then null;
end $$;

-- Fonction utilitaire : l'utilisateur appartient-il au groupe ?
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
  );
$$;

revoke all on function public.is_group_member(uuid, uuid) from public;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;

-- Création sécurisée d'un groupe + ajout automatique du créateur.
create or replace function public.create_carpool_group(
  p_name text,
  p_meeting_point text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_code text;
  v_establishment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  if length(trim(p_name)) < 3 or length(trim(p_meeting_point)) < 3 then
    raise exception 'Nom ou point de rendez-vous invalide';
  end if;

  select id into v_establishment_id
  from public.establishments
  where name = 'Centre pénitentiaire de Maubeuge'
  limit 1;

  loop
    v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
    exit when not exists (select 1 from public.groups where invite_code = v_code);
  end loop;

  insert into public.groups (establishment_id, name, meeting_point, invite_code, created_by)
  values (v_establishment_id, trim(p_name), trim(p_meeting_point), v_code, auth.uid())
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, auth.uid(), 'admin');

  return v_code;
end;
$$;

grant execute on function public.create_carpool_group(text, text) to authenticated;

-- Rejoindre un groupe grâce à son code.
create or replace function public.join_carpool_group(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  select id into v_group_id
  from public.groups
  where invite_code = upper(trim(p_invite_code));

  if v_group_id is null then
    raise exception 'Code d''invitation inconnu';
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_group_id, auth.uid())
  on conflict do nothing;

  return v_group_id;
end;
$$;

grant execute on function public.join_carpool_group(text) to authenticated;

-- Création atomique du trajet et de ses passagers.
create or replace function public.create_trip_with_passengers(
  p_group_id uuid,
  p_trip_date date,
  p_departure_time time,
  p_driver_id uuid,
  p_passenger_ids uuid[],
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_passenger uuid;
begin
  if auth.uid() is null or not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'Vous n''êtes pas membre de ce groupe';
  end if;

  if not public.is_group_member(p_group_id, p_driver_id) then
    raise exception 'Le conducteur n''appartient pas au groupe';
  end if;

  if coalesce(array_length(p_passenger_ids, 1), 0) = 0 then
    raise exception 'Sélectionnez au moins un passager';
  end if;

  if p_driver_id = any(p_passenger_ids) then
    raise exception 'Le conducteur ne peut pas être passager';
  end if;

  foreach v_passenger in array p_passenger_ids loop
    if not public.is_group_member(p_group_id, v_passenger) then
      raise exception 'Un passager n''appartient pas au groupe';
    end if;
  end loop;

  insert into public.trips (
    group_id, trip_date, departure_time, driver_id, note, created_by
  )
  values (
    p_group_id, p_trip_date, p_departure_time, p_driver_id,
    nullif(trim(p_note), ''), auth.uid()
  )
  returning id into v_trip_id;

  insert into public.trip_passengers (trip_id, passenger_id)
  select v_trip_id, passenger_id
  from unnest(p_passenger_ids) as passenger_id
  group by passenger_id;

  return v_trip_id;
end;
$$;

grant execute on function public.create_trip_with_passengers(uuid, date, time, uuid, uuid[], text) to authenticated;

-- RLS
alter table public.establishments enable row level security;
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.trips enable row level security;
alter table public.trip_passengers enable row level security;

drop policy if exists "Authenticated users read establishments" on public.establishments;
create policy "Authenticated users read establishments"
on public.establishments for select to authenticated
using (true);

drop policy if exists "Users read profiles in their groups" on public.profiles;
create policy "Users read profiles in their groups"
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.group_members me
    join public.group_members other_member
      on other_member.group_id = me.group_id
    where me.user_id = auth.uid()
      and other_member.user_id = profiles.id
  )
);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
on public.profiles for insert to authenticated
with check (id = auth.uid());

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Members read their groups" on public.groups;
create policy "Members read their groups"
on public.groups for select to authenticated
using (public.is_group_member(id, auth.uid()));

drop policy if exists "Members read memberships" on public.group_members;
create policy "Members read memberships"
on public.group_members for select to authenticated
using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "Members read trips" on public.trips;
create policy "Members read trips"
on public.trips for select to authenticated
using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "Creator or driver delete trip" on public.trips;
create policy "Creator or driver delete trip"
on public.trips for delete to authenticated
using (
  public.is_group_member(group_id, auth.uid())
  and (created_by = auth.uid() or driver_id = auth.uid())
);

drop policy if exists "Members read trip passengers" on public.trip_passengers;
create policy "Members read trip passengers"
on public.trip_passengers for select to authenticated
using (
  exists (
    select 1 from public.trips t
    where t.id = trip_passengers.trip_id
      and public.is_group_member(t.group_id, auth.uid())
  )
);

-- Les écritures de groupes, membres et trajets passent volontairement
-- par les fonctions RPC sécurisées ci-dessus.
