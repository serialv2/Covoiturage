import { state } from "./state.js";
import { $, escapeHtml, dateKey } from "./utils.js";
import { tripRoleForCurrentUser, openTripDialog } from "./trips.js";

function filteredTrips() {
  if (state.calendarFilter === "group") return state.trips;

  return state.trips.filter(
    trip => tripRoleForCurrentUser(trip) !== "group"
  );
}

export function renderCalendar() {
  const grid = $("#calendarGrid");
  if (!grid || !state.group) return;

  const currentMonth = new Date(
    state.calendarDate.getFullYear(),
    state.calendarDate.getMonth(),
    1
  );

  $("#calendarMonthTitle").textContent = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric"
  }).format(currentMonth);

  $("#myTripsFilter").classList.toggle(
    "active",
    state.calendarFilter === "mine"
  );

  $("#groupTripsFilter").classList.toggle(
    "active",
    state.calendarFilter === "group"
  );

  const mondayIndex = (currentMonth.getDay() + 6) % 7;
  const gridStart = new Date(currentMonth);
  gridStart.setDate(currentMonth.getDate() - mondayIndex);

  const tripsByDay = new Map();

  filteredTrips().forEach(trip => {
    if (!tripsByDay.has(trip.trip_date)) {
      tripsByDay.set(trip.trip_date, []);
    }

    tripsByDay.get(trip.trip_date).push(trip);
  });

  const today = dateKey(new Date());
  let html = "";

  for (let index = 0; index < 42; index++) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);

    const key = dateKey(day);
    const dayTrips = (tripsByDay.get(key) || [])
      .sort((a, b) =>
        (a.departure_time || "").localeCompare(b.departure_time || "")
      );

    const classes = [
      "calendar-day",
      day.getMonth() !== currentMonth.getMonth() ? "other-month" : "",
      key === today ? "today" : "",
      dayTrips.length ? "has-trips" : ""
    ].filter(Boolean).join(" ");

    const events = dayTrips.slice(0, 3).map(trip => {
      const role = tripRoleForCurrentUser(trip);
      let label = "";

      if (role === "driver") {
        const count = (trip.trip_passengers || []).length;
        label = `🚗 Je conduis · ${trip.departure_time.slice(0, 5)} · ${count} pass.`;
      } else if (role === "passenger") {
        label = `👤 Avec ${trip.driver?.full_name || "un collègue"} · ${trip.departure_time.slice(0, 5)}`;
      } else {
        label = `🚘 ${trip.driver?.full_name || "Conducteur"} · ${trip.departure_time.slice(0, 5)}`;
      }

      return `<div class="calendar-event ${role}">${escapeHtml(label)}</div>`;
    }).join("");

    html += `
      <button
        type="button"
        class="${classes}"
        data-calendar-date="${key}"
        ${dayTrips.length ? "" : "disabled"}>
        <div class="calendar-day-number">
          <span>${day.getDate()}</span>
          ${dayTrips.length
            ? `<span class="calendar-day-count">${dayTrips.length}</span>`
            : ""}
        </div>
        <div class="calendar-events">
          ${events}
          ${dayTrips.length > 3
            ? `<div class="calendar-more">+ ${dayTrips.length - 3} autre${dayTrips.length - 3 > 1 ? "s" : ""}</div>`
            : ""}
        </div>
      </button>`;
  }

  grid.innerHTML = html;
}

export function openDayDetails(dayKey) {
  state.selectedCalendarDate = dayKey;

  const dayTrips = filteredTrips()
    .filter(trip => trip.trip_date === dayKey)
    .sort((a, b) =>
      (a.departure_time || "").localeCompare(b.departure_time || "")
    );

  const date = new Date(`${dayKey}T12:00:00`);

  $("#dayDetailsTitle").textContent = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);

  $("#dayDetailsSubtitle").textContent =
    state.calendarFilter === "mine"
      ? "Covoiturages qui te concernent."
      : "Tous les covoiturages du groupe.";

  $("#dayDetailsList").innerHTML = dayTrips.length
    ? dayTrips.map(dayTripHtml).join("")
    : `<div class="empty-list">Aucun covoiturage ce jour.</div>`;

  $("#dayDetailsDialog").showModal();
}

function dayTripHtml(trip) {
  const role = tripRoleForCurrentUser(trip);
  const roleText =
    role === "driver"
      ? "Je conduis"
      : role === "passenger"
        ? "Je suis passager"
        : "Trajet du groupe";

  const passengers = (trip.trip_passengers || [])
    .map(item => item.passenger?.full_name || "Collègue")
    .join(", ") || "Aucun passager";

  const canDelete =
    trip.created_by === state.session.user.id ||
    trip.driver_id === state.session.user.id ||
    state.profile.is_admin;

  return `
    <div class="day-trip">
      <div class="day-trip-head">
        <strong>${escapeHtml(trip.departure_time.slice(0, 5))} — Aller-retour</strong>
        <span class="day-trip-role ${role}">${escapeHtml(roleText)}</span>
      </div>
      <div class="day-trip-meta">
        <span><b>Conducteur :</b> ${escapeHtml(trip.driver?.full_name || "Collègue")}</span>
        <span><b>Passagers :</b> ${escapeHtml(passengers)}</span>
        <span><b>Rendez-vous :</b> ${escapeHtml(state.group.meeting_point)}</span>
        ${trip.note ? `<span><b>Note :</b> ${escapeHtml(trip.note)}</span>` : ""}
      </div>
      ${canDelete
        ? `<div><button class="danger-btn" data-delete="${trip.id}">Supprimer ce trajet</button></div>`
        : ""}
    </div>`;
}

export function changeCalendarMonth(offset) {
  state.calendarDate = new Date(
    state.calendarDate.getFullYear(),
    state.calendarDate.getMonth() + offset,
    1
  );

  renderCalendar();
}

export function showToday() {
  state.calendarDate = new Date();
  renderCalendar();
}

export function setCalendarFilter(filter) {
  state.calendarFilter = filter;
  renderCalendar();
}

export function addTripFromSelectedDay() {
  $("#dayDetailsDialog").close();
  openTripDialog(state.selectedCalendarDate);
}
