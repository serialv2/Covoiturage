import { state } from "./state.js";
import { $, $$, initials } from "./utils.js";
import { renderUpcomingTrips } from "./trips.js";
import { renderCalendar } from "./calendar.js";
import { renderAccounts } from "./accounts.js";
import { renderMembers } from "./groups.js";
import { fillTripForm } from "./trips.js";

export function showPage(page) {
  $$(".page").forEach(element => {
    element.hidden = true;
  });

  const selectedPage = $(`#${page}Page`);
  if (selectedPage) selectedPage.hidden = false;

  $$(".nav").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
}

export function renderApplication() {
  const loggedIn = Boolean(state.session);
  const approved = state.profile?.status === "approved";

  $("#authView").hidden = loggedIn;
  $("#pendingView").hidden = !loggedIn || approved;
  $("#appView").hidden = !loggedIn || !approved;

  if (!loggedIn || !approved) return;

  $("#userName").textContent = state.profile.full_name;
  $("#userAvatar").textContent = initials(state.profile.full_name);
  $("#userRole").textContent = state.profile.is_admin
    ? "Administrateur"
    : "Membre";
  $("#adminNav").hidden = !state.profile.is_admin;

  const hasGroup = Boolean(state.group);

  $("#noGroupView").hidden = hasGroup;
  $$(".page").forEach(element => {
    element.hidden = true;
  });
  $("#newTripBtn").disabled = !hasGroup;

  if (!hasGroup) {
    $("#headerTitle").textContent = "Covoit'CP";
    $("#headerSubtitle").textContent = "Crée ou rejoins un groupe";
    return;
  }

  $("#dashboardPage").hidden = false;
  $("#headerTitle").textContent = state.group.name;
  $("#headerSubtitle").textContent = `Rendez-vous : ${state.group.meeting_point}`;

  $("#groupInfoName").textContent = state.group.name;
  $("#groupInfoMeeting").textContent = state.group.meeting_point;
  $("#groupInfoCode").textContent = state.group.invite_code;

  renderStats();
  renderUpcomingTrips();
  renderCalendar();
  renderAccounts();
  renderMembers();
  fillTripForm();
}

function renderStats() {
  const currentUserId = state.session.user.id;

  const driven = state.trips.filter(
    trip => trip.driver_id === currentUserId
  ).length;

  const passenger = state.trips.filter(
    trip => (trip.trip_passengers || []).some(
      item => item.passenger_id === currentUserId
    )
  ).length;

  $("#statDriven").textContent = driven;
  $("#statPassenger").textContent = passenger;
  $("#statBalance").textContent =
    `${driven - passenger >= 0 ? "+" : ""}${driven - passenger}`;
  $("#statMembers").textContent = state.members.length;
}
