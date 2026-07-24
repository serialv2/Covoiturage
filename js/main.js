import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { $, $$, toast } from "./utils.js";
import { getMyProfile, loadCurrentGroup } from "./data.js";
import { renderApplication, showPage } from "./ui.js";
import { register, login, logout } from "./auth.js";
import { createGroup, joinGroup } from "./groups.js";
import {
  openTripDialog,
  saveTrip,
  removeTrip,
  updatePassengerChoices
} from "./trips.js";
import {
  renderCalendar,
  openDayDetails,
  changeCalendarMonth,
  showToday,
  setCalendarFilter,
  addTripFromSelectedDay
} from "./calendar.js";
import { loadAdmin, setProfileStatus } from "./admin.js";

async function refreshApplication() {
  await loadCurrentGroup();
  renderApplication();
}

async function applySession(session) {
  state.session = session;

  if (!session) {
    state.profile = null;
    state.group = null;
    state.members = [];
    state.trips = [];
    renderApplication();
    return;
  }

  try {
    state.profile = await getMyProfile();

    if (state.profile.status === "approved") {
      await loadCurrentGroup();
    }

    renderApplication();
  } catch (error) {
    console.error(error);
    toast(error.message || "Erreur de chargement.", "error");
  }
}

function bindEvents() {
  $$(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach(item => {
        item.classList.toggle("active", item === tab);
      });

      $("#loginForm").hidden = tab.dataset.tab !== "login";
      $("#registerForm").hidden = tab.dataset.tab !== "register";
    });
  });

  $("#loginForm").addEventListener("submit", login);
  $("#registerForm").addEventListener("submit", register);

  $("#createGroupForm").addEventListener("submit", event =>
    createGroup(event, refreshApplication)
  );

  $("#joinGroupForm").addEventListener("submit", event =>
    joinGroup(event, refreshApplication)
  );

  $("#tripForm").addEventListener("submit", event =>
    saveTrip(event, refreshApplication)
  );

  $("#driverSelect").addEventListener("change", updatePassengerChoices);

  $("#logoutBtn").addEventListener("click", logout);
  $("#pendingLogoutBtn").addEventListener("click", logout);

  $("#newTripBtn").addEventListener("click", () => openTripDialog());

  $$("[data-open-trip]").forEach(button => {
    button.addEventListener("click", () => openTripDialog());
  });

  $("#closeTripBtn").addEventListener("click", () => {
    $("#tripDialog").close();
  });

  $("#cancelTripBtn").addEventListener("click", () => {
    $("#tripDialog").close();
  });

  $$(".nav").forEach(button => {
    button.addEventListener("click", async () => {
      showPage(button.dataset.page);

      if (button.dataset.page === "admin") {
        await loadAdmin();
      }

      if (button.dataset.page === "trips") {
        renderCalendar();
      }
    });
  });

  $$("[data-page-link]").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.pageLink);

      if (button.dataset.pageLink === "trips") {
        renderCalendar();
      }
    });
  });

  $("#refreshAdminBtn").addEventListener("click", loadAdmin);

  $("#previousMonthBtn").addEventListener("click", () => {
    changeCalendarMonth(-1);
  });

  $("#nextMonthBtn").addEventListener("click", () => {
    changeCalendarMonth(1);
  });

  $("#todayBtn").addEventListener("click", showToday);

  $("#myTripsFilter").addEventListener("click", () => {
    setCalendarFilter("mine");
  });

  $("#groupTripsFilter").addEventListener("click", () => {
    setCalendarFilter("group");
  });

  $("#closeDayDetailsBtn").addEventListener("click", () => {
    $("#dayDetailsDialog").close();
  });

  $("#closeDayDetailsBottomBtn").addEventListener("click", () => {
    $("#dayDetailsDialog").close();
  });

  $("#addTripFromDayBtn").addEventListener("click", addTripFromSelectedDay);

  document.addEventListener("click", async event => {
    const calendarDay = event.target.closest("[data-calendar-date]");

    if (calendarDay && !calendarDay.disabled) {
      openDayDetails(calendarDay.dataset.calendarDate);
    }

    const deleteButton = event.target.closest("[data-delete]");

    if (deleteButton) {
      if ($("#dayDetailsDialog")?.open) {
        $("#dayDetailsDialog").close();
      }

      await removeTrip(deleteButton.dataset.delete, refreshApplication);
    }

    const approveButton = event.target.closest("[data-approve]");

    if (approveButton) {
      await setProfileStatus(approveButton.dataset.approve, "approved");
    }

    const rejectButton = event.target.closest("[data-reject]");

    if (rejectButton) {
      await setProfileStatus(rejectButton.dataset.reject, "rejected");
    }
  });
}

async function bootstrap() {
  bindEvents();

  const {
    data: { session }
  } = await supabase.auth.getSession();

  await applySession(session);

  supabase.auth.onAuthStateChange(async (_event, newSession) => {
    await applySession(newSession);
  });
}

bootstrap();
