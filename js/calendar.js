import { state } from "./state.js";
import { $, escapeHtml, dateKey } from "./utils.js";
import { tripRoleForCurrentUser, openTripDialog } from "./trips.js";

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

  const mondayIndex = (currentMonth.getDay() + 6) % 7;
  const gridStart = new Date(currentMonth);
  gridStart.setDate(currentMonth.getDate() - mondayIndex);

  const tripsByDay = new Map();

  state.trips.forEach(trip => {
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

    const isInvolved = dayTrips.some(
      trip => tripRoleForCurrentUser(trip) !== "group"
    );

    const classes = [
      "calendar-day",
      day.getMonth() !== currentMonth.getMonth() ? "other-month" : "",
      key === today ? "today" : "",
      dayTrips.length ? "has-trips" : "",
      isInvolved ? "user-involved" : ""
    ].filter(Boolean).join(" ");

    const driverCount = dayTrips.length;

    html += `
      <button
        type="button"
        class="${classes}"
        data-calendar-date="${key}"
        ${dayTrips.length ? "" : "disabled"}>
        <div class="calendar-day-number">
          <span>${day.getDate()}</span>
        </div>
        <div class="calendar-driver-count ${driverCount ? "visible" : ""}">
          ${driverCount
            ? `<strong>${driverCount}</strong><span>conducteur${driverCount > 1 ? "s" : ""}</span>`
            : ""}
        </div>
        ${isInvolved ? `<div class="calendar-joined-mark">✓ Tu participes</div>` : ""}
      </button>`;
  }

  grid.innerHTML = html;
}

export function openDayDetails(dayKey) {
  state.selectedCalendarDate = dayKey;

  const dayTrips = state.trips
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
    `${dayTrips.length} conducteur${dayTrips.length > 1 ? "s" : ""} disponible${dayTrips.length > 1 ? "s" : ""}.`;

  $("#dayDetailsList").innerHTML = dayTrips.length
    ? dayTrips.map(dayTripHtml).join("")
    : `<div class="empty-list">Aucun covoiturage ce jour.</div>`;

  $("#dayDetailsDialog").showModal();
}

function dayTripHtml(trip) {
  const role = tripRoleForCurrentUser(trip);
  const passengerCount = (trip.trip_passengers || []).length;
  const passengers = (trip.trip_passengers || [])
    .map(item => item.passenger?.full_name || "Collègue")
    .join(", ") || "Aucun passager";

  let action = "";

  if (role === "driver") {
    action = `<span class="trip-status driver-status">Votre trajet</span>`;
  } else if (role === "passenger") {
    action = `
      <button class="btn secondary" data-leave-trip="${trip.id}">
        Quitter
      </button>`;
  } else {
    action = `
      <button class="btn primary" data-join-trip="${trip.id}">
        Rejoindre
      </button>`;
  }

  return `
    <article class="driver-choice-card">
      <div class="driver-choice-head">
        <div class="driver-avatar">${escapeHtml(
          (trip.driver?.full_name || "?")
            .split(/\s+/)
            .slice(0, 2)
            .map(part => part[0]?.toUpperCase())
            .join("")
        )}</div>
        <div class="driver-choice-copy">
          <h3>${escapeHtml(trip.driver?.full_name || "Collègue")}</h3>
          <p>${escapeHtml(trip.departure_time.slice(0, 5))} · Aller-retour</p>
        </div>
        <div class="passenger-count">
          <strong>${passengerCount}</strong>
          <span>passager${passengerCount > 1 ? "s" : ""}</span>
        </div>
      </div>

      <div class="driver-choice-details">
        <span><b>Rendez-vous :</b> ${escapeHtml(state.group.meeting_point)}</span>
        <span><b>Passagers :</b> ${escapeHtml(passengers)}</span>
        ${trip.note ? `<span><b>Note :</b> ${escapeHtml(trip.note)}</span>` : ""}
      </div>

      <div class="driver-choice-action">
        ${action}
      </div>
    </article>`;
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

export function addTripFromSelectedDay() {
  $("#dayDetailsDialog").close();
  openTripDialog(state.selectedCalendarDate);
}
