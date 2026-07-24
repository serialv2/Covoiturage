-- COVOIT'CP V2
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
-- Avant utilisation : Authentication > Providers > Email > désactiver "Confirm email".

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  email text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
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

insert into public.establishments(name,city)
values ('Centre pénitentiaire de Maubeuge','Maubeuge');

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
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key(group_id,user_id)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  trip_date date not null,
  departure_time time not null,
  driver_id uuid not null,
  note text check (note is null or char_length(note)<=100),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint trips_driver_id_fkey foreign key(driver_id) references public.profiles(id) on delete restrict
);

create table public.trip_passengers (
  trip_id uuid not null references public.trips(id) on delete cascade,
  passenger_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(trip_id,passenger_id),
  constraint trip_passengers_passenger_id_fkey foreign key(passenger_id) references public.profiles(id) on delete restrict
);

create index idx_group_members_user on public.group_members(user_id);
create index idx_trips_group_date on public.trips(group_id,trip_date desc);
create index idx_trips_driver on public.trips(driver_id);
create index idx_trip_passengers_passenger on public.trip_passengers(passenger_id);

-- Création automatique du profil à l'inscription.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,full_name,email)
  values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),split_part(new.email,'@',1)),new.email);
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_approved(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=p_user_id and status='approved') $$;

create or replace function public.is_site_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=p_user_id and status='approved' and is_admin=true) $$;

create or replace function public.is_group_member(p_group_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_user_id) $$;

grant execute on function public.is_approved(uuid) to authenticated;
grant execute on function public.is_site_admin(uuid) to authenticated;
grant execute on function public.is_group_member(uuid,uuid) to authenticated;

create or replace function public.create_carpool_group(p_name text,p_meeting_point text)
returns text language plpgsql security definer set search_path=public
as $$
declare v_group uuid;v_code text;v_est uuid;
begin
  if not public.is_approved(auth.uid()) then raise exception 'Compte non validé';end if;
  if length(trim(p_name))<3 or length(trim(p_meeting_point))<3 then raise exception 'Informations invalides';end if;
  select id into v_est from public.establishments where name='Centre pénitentiaire de Maubeuge' limit 1;
  loop
    v_code:=upper(substr(encode(gen_random_bytes(8),'hex'),1,8));
    exit when not exists(select 1 from public.groups where invite_code=v_code);
  end loop;
  insert into public.groups(establishment_id,name,meeting_point,invite_code,created_by)
  values(v_est,trim(p_name),trim(p_meeting_point),v_code,auth.uid()) returning id into v_group;
  insert into public.group_members(group_id,user_id,role) values(v_group,auth.uid(),'admin');
  return v_code;
end $$;

create or replace function public.join_carpool_group(p_invite_code text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_group uuid;
begin
  if not public.is_approved(auth.uid()) then raise exception 'Compte non validé';end if;
  select id into v_group from public.groups where invite_code=upper(trim(p_invite_code));
  if v_group is null then raise exception 'Code inconnu';end if;
  insert into public.group_members(group_id,user_id) values(v_group,auth.uid()) on conflict do nothing;
  return v_group;
end $$;

create or replace function public.create_trip_with_passengers(
  p_group_id uuid,p_trip_date date,p_departure_time time,p_driver_id uuid,p_passenger_ids uuid[],p_note text default null
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_trip uuid;v_passenger uuid;
begin
  if not public.is_approved(auth.uid()) or not public.is_group_member(p_group_id,auth.uid()) then raise exception 'Accès refusé';end if;
  if not public.is_group_member(p_group_id,p_driver_id) then raise exception 'Conducteur hors groupe';end if;
  if coalesce(array_length(p_passenger_ids,1),0)=0 then raise exception 'Choisissez un passager';end if;
  if p_driver_id=any(p_passenger_ids) then raise exception 'Le conducteur ne peut pas être passager';end if;
  foreach v_passenger in array p_passenger_ids loop
    if not public.is_group_member(p_group_id,v_passenger) then raise exception 'Passager hors groupe';end if;
  end loop;
  insert into public.trips(group_id,trip_date,departure_time,driver_id,note,created_by)
  values(p_group_id,p_trip_date,p_departure_time,p_driver_id,nullif(trim(p_note),''),auth.uid()) returning id into v_trip;
  insert into public.trip_passengers(trip_id,passenger_id)
  select v_trip,x from unnest(p_passenger_ids) x group by x;
  return v_trip;
end $$;

create or replace function public.admin_list_profiles()
returns table(id uuid,full_name text,email text,status text,is_admin boolean,created_at timestamptz)
language sql security definer set search_path=public
as $$
  select p.id,p.full_name,p.email,p.status,p.is_admin,p.created_at
  from public.profiles p
  where public.is_site_admin(auth.uid())
  order by p.created_at desc
$$;

create or replace function public.admin_set_profile_status(p_user_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_site_admin(auth.uid()) then raise exception 'Administrateur requis';end if;
  if p_status not in ('approved','rejected','pending') then raise exception 'Statut invalide';end if;
  update public.profiles set status=p_status,updated_at=now() where id=p_user_id;
end $$;

grant execute on function public.create_carpool_group(text,text) to authenticated;
grant execute on function public.join_carpool_group(text) to authenticated;
grant execute on function public.create_trip_with_passengers(uuid,date,time,uuid,uuid[],text) to authenticated;
grant execute on function public.admin_list_profiles() to authenticated;
grant execute on function public.admin_set_profile_status(uuid,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.establishments enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.trips enable row level security;
alter table public.trip_passengers enable row level security;

create policy "Read own profile or admin"
on public.profiles for select to authenticated
using(id=auth.uid() or public.is_site_admin(auth.uid()));

create policy "Approved users read group profiles"
on public.profiles for select to authenticated
using(
  public.is_approved(auth.uid()) and exists(
    select 1 from public.group_members me
    join public.group_members other on other.group_id=me.group_id
    where me.user_id=auth.uid() and other.user_id=profiles.id
  )
);

create policy "Approved users read establishments"
on public.establishments for select to authenticated using(public.is_approved(auth.uid()));

create policy "Members read groups"
on public.groups for select to authenticated using(public.is_group_member(id,auth.uid()));

create policy "Members read memberships"
on public.group_members for select to authenticated using(public.is_group_member(group_id,auth.uid()));

create policy "Members read trips"
on public.trips for select to authenticated using(public.is_group_member(group_id,auth.uid()));

create policy "Creator driver or site admin delete trips"
on public.trips for delete to authenticated
using(public.is_group_member(group_id,auth.uid()) and (created_by=auth.uid() or driver_id=auth.uid() or public.is_site_admin(auth.uid())));

create policy "Members read passengers"
on public.trip_passengers for select to authenticated
using(exists(select 1 from public.trips t where t.id=trip_passengers.trip_id and public.is_group_member(t.group_id,auth.uid())));

-- APRÈS ta première inscription, exécute cette commande en remplaçant l'adresse :
-- update public.profiles
-- set status='approved', is_admin=true
-- where email='TON_ADRESSE_EMAIL';
