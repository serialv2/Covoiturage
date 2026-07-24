import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { $, $$, toast, escapeHtml, formatDate } from "./utils.js";

export function tripRoleForCurrentUser(trip) {
  const currentUserId = state.session.user.id;

  if (trip.driver_id === currentUserId) return "driver";

  if ((trip.trip_passengers || []).some(
    passenger => passenger.passenger_id === currentUserId
  )) {
    return "passenger";
  }

  return "group";
}

function tripHtml(trip, allowDelete = false) {
  const passengers = (trip.trip_passengers || [])
    .map(item => item.passenger?.full_name || "Collègue")
    .join(", ") || "Aucun";

  const canDelete = allowDelete && (
    trip.created_by === state.session.user.id ||
    trip.driver_id === state.session.user.id ||
    state.profile.is_admin
  );

  return `
    <div class="trip">
      <div class="trip-date">
        <strong>${escapeHtml(formatDate(trip.trip_date))}</strong>
        <span>${escapeHtml(trip.departure_time.slice(0, 5))}</span>
      </div>
      <div class="trip-main">
        <strong>Conducteur : ${escapeHtml(trip.driver?.full_name || "Collègue")}</strong>
        <small>Passagers : ${escapeHtml(passengers)}</small>
        ${trip.note ? `<small>${escapeHtml(trip.note)}</small>` : ""}
      </div>
      <div class="trip-actions">
        <span class="badge">Aller-retour</span>
        ${canDelete ? `<button class="danger-btn" data-delete="${trip.id}">Supprimer</button>` : ""}
      </div>
    </div>`;
}

export function renderUpcomingTrips() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = state.trips
    .filter(trip => new Date(`${trip.trip_date}T12:00:00`) >= today)
    .filter(trip => tripRoleForCurrentUser(trip) !== "group")
    .sort((a, b) =>
      a.trip_date.localeCompare(b.trip_date) ||
      a.departure_time.localeCompare(b.departure_time)
    );

  $("#upcomingTrips").innerHTML = upcoming.length
    ? upcoming.slice(0, 4).map(trip => tripHtml(trip)).join("")
    : `<div class="empty-list">Aucun trajet à venir.</div>`;
}

export function fillTripForm() {
  $("#driverSelect").innerHTML = state.members
    .map(member => `
      <option value="${member.user_id}">
        ${escapeHtml(member.profiles?.full_name || "Collègue")}
      </option>`)
    .join("");

  $("#driverSelect").value = state.session.user.id;
  updatePassengerChoices();
}

export function updatePassengerChoices() {
  const driverId = $("#driverSelect").value;

  $("#passengerChoices").innerHTML = state.members
    .filter(member => member.user_id !== driverId)
    .map(member => `
      <label class="check">
        <input type="checkbox" name="passengers" value="${member.user_id}">
        ${escapeHtml(member.profiles?.full_name || "Collègue")}
      </label>`)
    .join("") || `<div class="empty-list">Aucun autre membre.</div>`;
}

export function openTripDialog(date = null) {
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 1);

  $("#tripDate").value = date || defaultDate.toISOString().slice(0, 10);
  $("#tripTime").value = "05:45";
  $("#driverSelect").value = state.session.user.id;
  updatePassengerChoices();
  $("#tripDialog").showModal();
}

export async function saveTrip(event, refreshCallback) {
  event.preventDefault();

  const passengerIds = $$('input[name="passengers"]:checked')
    .map(input => input.value);

  const { error } = await supabase.rpc("create_trip_with_passengers", {
    p_group_id: state.group.id,
    p_trip_date: $("#tripDate").value,
    p_departure_time: $("#tripTime").value,
    p_driver_id: $("#driverSelect").value,
    p_passenger_ids: passengerIds,
    p_note: $("#tripNote").value.trim() || null
  });

  if (error) {
    toast(error.message, "error");
    return;
  }

  $("#tripDialog").close();

  toast(
    passengerIds.length
      ? "Trajet enregistré."
      : "Trajet publié sans passager."
  );

  await refreshCallback();
}

export async function removeTrip(tripId, refreshCallback) {
  if (!confirm("Supprimer ce trajet ?")) return;

  const { error } = await supabase
    .from("trips")
    .delete()
    .eq("id", tripId);

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast("Trajet supprimé.");
  await refreshCallback();
}


export async function joinTrip(tripId, refreshCallback) {
  const { error } = await supabase.rpc("join_carpool_trip", {
    p_trip_id: tripId
  });

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast("Tu as rejoint ce covoiturage.");
  await refreshCallback();
}

export async function leaveTrip(tripId, refreshCallback) {
  const { error } = await supabase.rpc("leave_carpool_trip", {
    p_trip_id: tripId
  });

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast("Tu as quitté ce covoiturage.");
  await refreshCallback();
}
