-- COVOIT'CP V7
-- Groupes visibles dans une liste + rejoindre/quitter un trajet

create or replace function public.list_available_carpool_groups()
returns table (
  id uuid,
  name text,
  meeting_point text,
  member_count bigint,
  is_member boolean
)
language sql
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.meeting_point,
    count(gm_all.user_id) as member_count,
    exists (
      select 1
      from public.group_members gm_me
      where gm_me.group_id = g.id
        and gm_me.user_id = auth.uid()
    ) as is_member
  from public.groups g
  left join public.group_members gm_all
    on gm_all.group_id = g.id
  where public.is_approved(auth.uid())
  group by g.id, g.name, g.meeting_point
  order by g.name;
$$;

create or replace function public.join_carpool_group_by_id(
  p_group_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_approved(auth.uid()) then
    raise exception 'Compte non autorisé';
  end if;

  if not exists (
    select 1 from public.groups where id = p_group_id
  ) then
    raise exception 'Groupe introuvable';
  end if;

  insert into public.group_members(group_id, user_id, role)
  values(p_group_id, auth.uid(), 'member')
  on conflict(group_id, user_id) do nothing;

  return p_group_id;
end;
$$;

create or replace function public.join_carpool_trip(
  p_trip_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_driver_id uuid;
begin
  select group_id, driver_id
  into v_group_id, v_driver_id
  from public.trips
  where id = p_trip_id;

  if v_group_id is null then
    raise exception 'Trajet introuvable';
  end if;

  if not public.is_approved(auth.uid())
     or not public.is_group_member(v_group_id, auth.uid()) then
    raise exception 'Accès refusé';
  end if;

  if v_driver_id = auth.uid() then
    raise exception 'Vous êtes déjà le conducteur';
  end if;

  insert into public.trip_passengers(trip_id, passenger_id)
  values(p_trip_id, auth.uid())
  on conflict(trip_id, passenger_id) do nothing;
end;
$$;

create or replace function public.leave_carpool_trip(
  p_trip_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.trip_passengers
  where trip_id = p_trip_id
    and passenger_id = auth.uid();
end;
$$;

grant execute on function public.list_available_carpool_groups() to authenticated;
grant execute on function public.join_carpool_group_by_id(uuid) to authenticated;
grant execute on function public.join_carpool_trip(uuid) to authenticated;
grant execute on function public.leave_carpool_trip(uuid) to authenticated;
