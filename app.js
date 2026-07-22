import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);

const state = {
  session: null,
  profile: null,
  group: null,
  members: [],
  trips: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const authView = $("#authView");
const appView = $("#appView");
const noGroupPanel = $("#noGroupPanel");
const groupContent = $("#groupContent");
const tripModal = $("#tripModal");

function showToast(message, type = "success") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => (toast.hidden = true), 3500);
}

function initials(name = "?") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("") || "?";
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short"
  }).format(new Date(`${dateString}T12:00:00`));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

async function ensureProfile(user) {
  const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Collègue";

  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, full_name: fullName }, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function loadCurrentGroup() {
  const { data: membership, error } = await supabase
    .from("group_members")
    .select("group_id, groups(*)")
    .eq("user_id", state.session.user.id)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  state.group = membership?.groups || null;

  if (!state.group) {
    state.members = [];
    state.trips = [];
    render();
    return;
  }

  const [{ data: members, error: membersError }, { data: trips, error: tripsError }] = await Promise.all([
    supabase
      .from("group_members")
      .select("user_id, role, joined_at, profiles(id, full_name)")
      .eq("group_id", state.group.id)
      .order("joined_at"),
    supabase
      .from("trips")
      .select(`
        id, group_id, trip_date, departure_time, note, driver_id, created_by, created_at,
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
  render();
}

function render() {
  const loggedIn = Boolean(state.session);
  authView.hidden = loggedIn;
  appView.hidden = !loggedIn;
  if (!loggedIn) return;

  $("#sidebarName").textContent = state.profile?.full_name || "Utilisateur";
  $("#sidebarAvatar").textContent = initials(state.profile?.full_name);

  const hasGroup = Boolean(state.group);
  noGroupPanel.hidden = hasGroup;
  groupContent.hidden = !hasGroup;
  $("#openTripModalBtn").disabled = !hasGroup;

  if (!hasGroup) {
    $("#groupTitle").textContent = "Votre groupe de covoiturage";
    $("#groupSubtitle").textContent = "Créez ou rejoignez un groupe";
    return;
  }

  $("#groupTitle").textContent = state.group.name;
  $("#groupSubtitle").textContent = `Rendez-vous : ${state.group.meeting_point}`;
  $("#groupInfoName").textContent = state.group.name;
  $("#groupInfoMeeting").textContent = state.group.meeting_point;
  $("#groupInfoCode").textContent = state.group.invite_code;

  renderStats();
  renderTrips();
  renderAccounts();
  renderMembers();
  fillTripForm();
}

function myRelationships() {
  const me = state.session.user.id;
  const result = new Map();

  for (const member of state.members) {
    if (member.user_id !== me) {
      result.set(member.user_id, {
        id: member.user_id,
        name: member.profiles?.full_name || "Collègue",
        iDrove: 0,
        droveMe: 0
      });
    }
  }

  for (const trip of state.trips) {
    const passengerIds = (trip.trip_passengers || []).map(p => p.passenger_id);

    if (trip.driver_id === me) {
      for (const passengerId of passengerIds) {
        if (result.has(passengerId)) result.get(passengerId).iDrove++;
      }
    }

    if (passengerIds.includes(me) && result.has(trip.driver_id)) {
      result.get(trip.driver_id).droveMe++;
    }
  }

  return [...result.values()].map(row => ({
    ...row,
    balance: row.iDrove - row.droveMe
  }));
}

function renderStats() {
  const me = state.session.user.id;
  const driven = state.trips.filter(t => t.driver_id === me).length;
  const passenger = state.trips.filter(t =>
    (t.trip_passengers || []).some(p => p.passenger_id === me)
  ).length;

  $("#drivenCount").textContent = driven;
  $("#passengerCount").textContent = passenger;
  $("#balanceCount").textContent = `${driven - passenger >= 0 ? "+" : ""}${driven - passenger}`;
  $("#memberCount").textContent = state.members.length;
}

function tripHtml(trip, allowDelete = false) {
  const passengers = (trip.trip_passengers || [])
    .map(p => p.passenger?.full_name || "Collègue")
    .join(", ") || "Aucun passager";

  const canDelete = allowDelete &&
    (trip.created_by === state.session.user.id || trip.driver_id === state.session.user.id);

  return `
    <div class="trip-item">
      <div class="trip-date">
        <strong>${escapeHtml(formatDate(trip.trip_date))}</strong>
        <span>${escapeHtml(trip.departure_time?.slice(0, 5) || "")}</span>
      </div>
      <div class="trip-main">
        <strong>Conducteur : ${escapeHtml(trip.driver?.full_name || "Collègue")}</strong>
        <small>Passagers : ${escapeHtml(passengers)}</small>
        ${trip.note ? `<small>${escapeHtml(trip.note)}</small>` : ""}
      </div>
      <div class="trip-actions">
        <span class="badge">Aller-retour</span>
        ${canDelete ? `<button class="delete-btn" data-delete-trip="${trip.id}">Supprimer</button>` : ""}
      </div>
    </div>`;
}

function renderTrips() {
  const today = new Date();
  today.setHours(0,0,0,0);

  const upcoming = state.trips
    .filter(t => new Date(`${t.trip_date}T12:00:00`) >= today)
    .sort((a,b) => a.trip_date.localeCompare(b.trip_date) || a.departure_time.localeCompare(b.departure_time));

  $("#upcomingTrips").innerHTML = upcoming.length
    ? upcoming.slice(0, 4).map(t => tripHtml(t)).join("")
    : `<div class="list-empty">Aucun trajet à venir.</div>`;

  $("#allTrips").innerHTML = state.trips.length
    ? state.trips.map(t => tripHtml(t, true)).join("")
    : `<div class="list-empty">Aucun trajet enregistré.</div>`;
}

function accountRowHtml(row) {
  let label = "Équilibré";
  let className = "balance-even";

  if (row.balance > 0) {
    label = `Vous avez ${row.balance} trajet${row.balance > 1 ? "s" : ""} d’avance`;
    className = "balance-positive";
  } else if (row.balance < 0) {
    const debt = Math.abs(row.balance);
    label = `${row.name} a ${debt} trajet${debt > 1 ? "s" : ""} d’avance`;
    className = "balance-negative";
  }

  return `
    <tr>
      <td><div class="person-cell"><span class="mini-avatar">${escapeHtml(initials(row.name))}</span>${escapeHtml(row.name)}</div></td>
      <td>${row.iDrove}</td>
      <td>${row.droveMe}</td>
      <td class="${className}">${escapeHtml(label)}</td>
    </tr>`;
}

function renderAccounts() {
  const rows = myRelationships();
  const html = rows.length
    ? rows.map(accountRowHtml).join("")
    : `<tr><td colspan="4" class="list-empty">Ajoutez des collègues puis enregistrez des trajets.</td></tr>`;

  $("#accountsTableBody").innerHTML = html;
  $("#accountPreview").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Collègue</th><th>Je l’ai conduit</th><th>Il/elle m’a conduit</th><th>Situation</th></tr></thead>
        <tbody>${rows.slice(0, 5).map(accountRowHtml).join("") || `<tr><td colspan="4" class="list-empty">Pas encore de comptes.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function renderMembers() {
  $("#membersList").innerHTML = state.members.map(member => {
    const name = member.profiles?.full_name || "Collègue";
    return `
      <div class="member-row">
        <span class="mini-avatar">${escapeHtml(initials(name))}</span>
        <div><strong>${escapeHtml(name)}</strong><small>${member.role === "admin" ? "Administrateur" : "Membre"}</small></div>
      </div>`;
  }).join("");
}

function fillTripForm() {
  const options = state.members.map(member => {
    const name = member.profiles?.full_name || "Collègue";
    return `<option value="${member.user_id}">${escapeHtml(name)}</option>`;
  }).join("");

  $("#driverSelect").innerHTML = options;
  $("#driverSelect").value = state.session.user.id;

  updatePassengerCheckboxes();
}

function updatePassengerCheckboxes() {
  const driverId = $("#driverSelect").value;
  $("#passengerCheckboxes").innerHTML = state.members
    .filter(member => member.user_id !== driverId)
    .map(member => {
      const name = member.profiles?.full_name || "Collègue";
      return `
        <label class="check-label">
          <input type="checkbox" name="passengers" value="${member.user_id}" />
          ${escapeHtml(name)}
        </label>`;
    }).join("") || `<p class="list-empty">Aucun autre membre dans ce groupe.</p>`;
}

function showPage(page) {
  $$(".page").forEach(el => (el.hidden = true));
  $(`#${page}Page`).hidden = false;
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.page === page));
}

async function handleRegister(event) {
  event.preventDefault();
  const fullName = $("#registerName").value.trim();
  const email = $("#registerEmail").value.trim();
  const password = $("#registerPassword").value;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });

  if (error) return showToast(error.message, "error");

  if (!data.session) {
    showToast("Compte créé. Vérifiez votre e-mail pour confirmer l’inscription.");
  } else {
    showToast("Compte créé.");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const { error } = await supabase.auth.signInWithPassword({
    email: $("#loginEmail").value.trim(),
    password: $("#loginPassword").value
  });

  if (error) showToast(error.message, "error");
}

async function handleCreateGroup(event) {
  event.preventDefault();
  const { data, error } = await supabase.rpc("create_carpool_group", {
    p_name: $("#groupName").value.trim(),
    p_meeting_point: $("#meetingPoint").value.trim()
  });

  if (error) return showToast(error.message, "error");
  showToast(`Groupe créé. Code : ${data}`);
  await loadCurrentGroup();
}

async function handleJoinGroup(event) {
  event.preventDefault();
  const { error } = await supabase.rpc("join_carpool_group", {
    p_invite_code: $("#inviteCode").value.trim().toUpperCase()
  });

  if (error) return showToast(error.message, "error");
  showToast("Vous avez rejoint le groupe.");
  await loadCurrentGroup();
}

async function handleCreateTrip(event) {
  event.preventDefault();

  const passengerIds = $$('input[name="passengers"]:checked').map(input => input.value);
  if (!passengerIds.length) return showToast("Sélectionnez au moins un passager.", "error");

  const { error } = await supabase.rpc("create_trip_with_passengers", {
    p_group_id: state.group.id,
    p_trip_date: $("#tripDate").value,
    p_departure_time: $("#tripTime").value,
    p_driver_id: $("#driverSelect").value,
    p_passenger_ids: passengerIds,
    p_note: $("#tripNote").value.trim() || null
  });

  if (error) return showToast(error.message, "error");

  tripModal.close();
  $("#tripForm").reset();
  showToast("Trajet enregistré.");
  await loadCurrentGroup();
}

async function deleteTrip(tripId) {
  if (!confirm("Supprimer ce trajet ? Les comptes seront automatiquement recalculés.")) return;

  const { error } = await supabase.from("trips").delete().eq("id", tripId);
  if (error) return showToast(error.message, "error");

  showToast("Trajet supprimé.");
  await loadCurrentGroup();
}

function openTripModal() {
  if (!state.group) return;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  $("#tripDate").value = tomorrow.toISOString().slice(0, 10);
  $("#tripTime").value = "05:45";
  $("#driverSelect").value = state.session.user.id;
  updatePassengerCheckboxes();
  tripModal.showModal();
}

function bindEvents() {
  $$(".tab").forEach(tab => tab.addEventListener("click", () => {
    $$(".tab").forEach(t => t.classList.toggle("active", t === tab));
    $("#loginForm").hidden = tab.dataset.authTab !== "login";
    $("#registerForm").hidden = tab.dataset.authTab !== "register";
  }));

  $("#loginForm").addEventListener("submit", handleLogin);
  $("#registerForm").addEventListener("submit", handleRegister);
  $("#createGroupForm").addEventListener("submit", handleCreateGroup);
  $("#joinGroupForm").addEventListener("submit", handleJoinGroup);
  $("#tripForm").addEventListener("submit", handleCreateTrip);
  $("#driverSelect").addEventListener("change", updatePassengerCheckboxes);

  $("#logoutBtn").addEventListener("click", () => supabase.auth.signOut());
  $("#openTripModalBtn").addEventListener("click", openTripModal);
  $$("[data-open-trip]").forEach(btn => btn.addEventListener("click", openTripModal));
  $("#closeTripModalBtn").addEventListener("click", () => tripModal.close());
  $("#cancelTripBtn").addEventListener("click", () => tripModal.close());

  $$(".nav-item").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.page)));
  $$("[data-page-link]").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.pageLink)));

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-delete-trip]");
    if (button) deleteTrip(button.dataset.deleteTrip);
  });
}

async function bootstrap() {
  bindEvents();

  const { data: { session } } = await supabase.auth.getSession();
  await applySession(session);

  supabase.auth.onAuthStateChange(async (_event, newSession) => {
    await applySession(newSession);
  });
}

async function applySession(session) {
  state.session = session;

  if (!session) {
    state.profile = null;
    state.group = null;
    render();
    return;
  }

  try {
    state.profile = await ensureProfile(session.user);
    await loadCurrentGroup();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Erreur de chargement.", "error");
  }
}

bootstrap();
