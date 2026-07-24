-- ============================================================
-- COVOIT'CP V3 - OPTION A
-- Architecture Supabase Auth + RLS + RPC
-- Ce script remet à zéro uniquement les objets Covoit'CP du schéma public.
-- Il NE SUPPRIME PAS les utilisateurs présents dans Authentication > Users.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. NETTOYAGE DE L'ANCIENNE VERSION
-- ------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_approved(uuid) cascade;
drop function if exists public.is_site_admin(uuid) cascade;
drop function if exists public.is_group_member(uuid, uuid) cascade;
drop function if exists public.create_carpool_group(text, text) cascade;
drop function if exists public.join_carpool_group(text) cascade;
drop function if exists public.create_trip_with_passengers(uuid, date, time, uuid, uuid[], text) cascade;
drop function if exists public.admin_list_profiles() cascade;
drop function if exists public.admin_set_profile_status(uuid, text) cascade;

drop table if exists public.trip_passengers cascade;
drop table if exists public.trips cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop table if exists public.establishments cascade;
drop table if exists public.profiles cascade;

-- ------------------------------------------------------------
-- 2. TABLES
-- ------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  created_at timestamptz not null default now()
);

insert into public.establishments (name, city)
values ('Centre pénitentiaire de Maubeuge', 'Maubeuge');

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid references public.establishments(id) on delete set null,
  name text not null check (char_length(name) between 3 and 100),
  meeting_point text not null check (char_length(meeting_point) between 3 and 150),
  invite_code text not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  trip_date date not null,
  departure_time time not null,
  driver_id uuid not null,
  note text check (note is null or char_length(note) <= 100),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint trips_driver_id_fkey
    foreign key (driver_id) references public.profiles(id) on delete restrict
);

create table public.trip_passengers (
  trip_id uuid not null references public.trips(id) on delete cascade,
  passenger_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, passenger_id),
  constraint trip_passengers_passenger_id_fkey
    foreign key (passenger_id) references public.profiles(id) on delete restrict
);

create index idx_group_members_user
  on public.group_members(user_id);

create index idx_trips_group_date
  on public.trips(group_id, trip_date desc);

create index idx_trips_driver
  on public.trips(driver_id);

create index idx_trip_passengers_passenger
  on public.trip_passengers(passenger_id);

-- ------------------------------------------------------------
-- 3. PROFIL AUTOMATIQUE À L'INSCRIPTION
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    status,
    is_admin
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'utilisateur'), '@', 1)
    ),
    coalesce(new.email, ''),
    'pending',
    false
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Récupère aussi les utilisateurs déjà créés avant ce nouveau script.
insert into public.profiles (
  id,
  full_name,
  email,
  status,
  is_admin
)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(u.email, 'utilisateur'), '@', 1)
  ),
  coalesce(u.email, ''),
  'pending',
  false
from auth.users u
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 4. FONCTIONS DE SÉCURITÉ
-- ------------------------------------------------------------

create or replace function public.is_approved(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.status = 'approved'
  );
$$;

create or replace function public.is_site_admin(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.status = 'approved'
      and p.is_admin = true
  );
$$;

create or replace function public.is_group_member(
  p_group_id uuid,
  p_user_id uuid default auth.uid()
)
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

-- ------------------------------------------------------------
-- 5. RPC MÉTIER
-- ------------------------------------------------------------

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
  v_invite_code text;
  v_establishment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  if not public.is_approved(auth.uid()) then
    raise exception 'Votre compte doit être validé';
  end if;

  if char_length(trim(p_name)) < 3
     or char_length(trim(p_meeting_point)) < 3 then
    raise exception 'Nom ou point de rendez-vous invalide';
  end if;

  select e.id
  into v_establishment_id
  from public.establishments e
  where e.name = 'Centre pénitentiaire de Maubeuge'
  limit 1;

  loop
    v_invite_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
    exit when not exists (
      select 1
      from public.groups g
      where g.invite_code = v_invite_code
    );
  end loop;

  insert into public.groups (
    establishment_id,
    name,
    meeting_point,
    invite_code,
    created_by
  )
  values (
    v_establishment_id,
    trim(p_name),
    trim(p_meeting_point),
    v_invite_code,
    auth.uid()
  )
  returning id into v_group_id;

  insert into public.group_members (
    group_id,
    user_id,
    role
  )
  values (
    v_group_id,
    auth.uid(),
    'admin'
  );

  return v_invite_code;
end;
$$;

create or replace function public.join_carpool_group(
  p_invite_code text
)
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

  if not public.is_approved(auth.uid()) then
    raise exception 'Votre compte doit être validé';
  end if;

  select g.id
  into v_group_id
  from public.groups g
  where g.invite_code = upper(trim(p_invite_code));

  if v_group_id is null then
    raise exception 'Code d''invitation inconnu';
  end if;

  insert into public.group_members (
    group_id,
    user_id,
    role
  )
  values (
    v_group_id,
    auth.uid(),
    'member'
  )
  on conflict (group_id, user_id) do nothing;

  return v_group_id;
end;
$$;

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
  v_passenger_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  if not public.is_approved(auth.uid())
     or not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'Accès refusé';
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

  foreach v_passenger_id in array p_passenger_ids loop
    if not public.is_group_member(p_group_id, v_passenger_id) then
      raise exception 'Un passager n''appartient pas au groupe';
    end if;
  end loop;

  insert into public.trips (
    group_id,
    trip_date,
    departure_time,
    driver_id,
    note,
    created_by
  )
  values (
    p_group_id,
    p_trip_date,
    p_departure_time,
    p_driver_id,
    nullif(trim(p_note), ''),
    auth.uid()
  )
  returning id into v_trip_id;

  insert into public.trip_passengers (
    trip_id,
    passenger_id
  )
  select
    v_trip_id,
    passenger_id
  from unnest(p_passenger_ids) as passenger_id
  group by passenger_id;

  return v_trip_id;
end;
$$;

create or replace function public.admin_list_profiles()
returns table (
  id uuid,
  full_name text,
  email text,
  status text,
  is_admin boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_site_admin(auth.uid()) then
    raise exception 'Administrateur requis';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.email,
    p.status,
    p.is_admin,
    p.created_at
  from public.profiles p
  order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_profile_status(
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_site_admin(auth.uid()) then
    raise exception 'Administrateur requis';
  end if;

  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Statut invalide';
  end if;

  update public.profiles
  set
    status = p_status,
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Utilisateur introuvable';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 6. DROITS SQL EXPLICITES
-- ------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.establishments to authenticated;
grant select on public.groups to authenticated;
grant select on public.group_members to authenticated;
grant select on public.trips to authenticated;
grant select on public.trip_passengers to authenticated;

grant delete on public.trips to authenticated;

revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.establishments from anon, authenticated;
revoke insert, update, delete on public.groups from anon, authenticated;
revoke insert, update, delete on public.group_members from anon, authenticated;
revoke insert, update on public.trips from anon, authenticated;
revoke insert, update, delete on public.trip_passengers from anon, authenticated;

grant execute on function public.is_approved(uuid) to authenticated;
grant execute on function public.is_site_admin(uuid) to authenticated;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.create_carpool_group(text, text) to authenticated;
grant execute on function public.join_carpool_group(text) to authenticated;
grant execute on function public.create_trip_with_passengers(uuid, date, time, uuid, uuid[], text) to authenticated;
grant execute on function public.admin_list_profiles() to authenticated;
grant execute on function public.admin_set_profile_status(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.establishments enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.trips enable row level security;
alter table public.trip_passengers enable row level security;

create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_site_admin(auth.uid())
);

create policy profiles_select_group_colleagues
on public.profiles
for select
to authenticated
using (
  public.is_approved(auth.uid())
  and exists (
    select 1
    from public.group_members my_membership
    join public.group_members colleague_membership
      on colleague_membership.group_id = my_membership.group_id
    where my_membership.user_id = auth.uid()
      and colleague_membership.user_id = profiles.id
  )
);

create policy establishments_select_approved
on public.establishments
for select
to authenticated
using (
  public.is_approved(auth.uid())
);

create policy groups_select_members
on public.groups
for select
to authenticated
using (
  public.is_group_member(id, auth.uid())
);

create policy group_members_select_members
on public.group_members
for select
to authenticated
using (
  public.is_group_member(group_id, auth.uid())
);

create policy trips_select_members
on public.trips
for select
to authenticated
using (
  public.is_group_member(group_id, auth.uid())
);

create policy trips_delete_authorized
on public.trips
for delete
to authenticated
using (
  public.is_group_member(group_id, auth.uid())
  and (
    created_by = auth.uid()
    or driver_id = auth.uid()
    or public.is_site_admin(auth.uid())
  )
);

create policy trip_passengers_select_members
on public.trip_passengers
for select
to authenticated
using (
  exists (
    select 1
    from public.trips t
    where t.id = trip_passengers.trip_id
      and public.is_group_member(t.group_id, auth.uid())
  )
);

-- ------------------------------------------------------------
-- 8. PREMIER ADMINISTRATEUR
-- ------------------------------------------------------------
-- Après ton inscription, remplace l'adresse ci-dessous puis exécute seulement
-- la commande UPDATE :
--
-- update public.profiles
-- set status = 'approved',
--     is_admin = true,
--     updated_at = now()
-- where lower(email) = lower('TON_ADRESSE_EMAIL');
--
-- Vérification :
--
-- select id, full_name, email, status, is_admin
-- from public.profiles
-- order by created_at desc;
