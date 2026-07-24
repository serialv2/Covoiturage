import { supabase } from "./supabase.js";
import { state } from "./state.js";

export async function getMyProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", state.session.user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function loadAvailableGroups() {
  const { data, error } = await supabase.rpc("list_available_carpool_groups");

  if (error) throw error;
  state.availableGroups = data || [];
}

export async function loadCurrentGroup() {
  const selectedGroupId = localStorage.getItem("covoitcp_active_group");

  if (!selectedGroupId) {
    state.group = null;
    state.members = [];
    state.trips = [];
    return;
  }

  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, groups(*)")
    .eq("user_id", state.session.user.id)
    .eq("group_id", selectedGroupId)
    .maybeSingle();

  if (error) throw error;

  state.group = data?.groups || null;

  if (!state.group) {
    localStorage.removeItem("covoitcp_active_group");
    state.members = [];
    state.trips = [];
    return;
  }

  const [
    { data: members, error: membersError },
    { data: trips, error: tripsError }
  ] = await Promise.all([
    supabase
      .from("group_members")
      .select("user_id, role, joined_at, profiles(id, full_name, status)")
      .eq("group_id", state.group.id)
      .order("joined_at"),

    supabase
      .from("trips")
      .select(`
        id,
        group_id,
        trip_date,
        departure_time,
        note,
        driver_id,
        created_by,
        created_at,
        driver:profiles!trips_driver_id_fkey(id, full_name),
        trip_passengers(
          passenger_id,
          passenger:profiles!trip_passengers_passenger_id_fkey(id, full_name)
        )
      `)
      .eq("group_id", state.group.id)
      .order("trip_date", { ascending: false })
      .order("departure_time", { ascending: false })
  ]);

  if (membersError) throw membersError;
  if (tripsError) throw tripsError;

  state.members = members || [];
  state.trips = trips || [];
}
