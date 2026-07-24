import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { $, toast, escapeHtml, initials } from "./utils.js";

export async function createGroup(event, refreshCallback) {
  event.preventDefault();

  const { data, error } = await supabase.rpc("create_carpool_group", {
    p_name: $("#groupName").value.trim(),
    p_meeting_point: $("#meetingPoint").value.trim()
  });

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast("Groupe créé.");
  await selectGroup(data.group_id || data, refreshCallback);
}

export async function selectGroup(groupId, refreshCallback) {
  const { error } = await supabase.rpc("join_carpool_group_by_id", {
    p_group_id: groupId
  });

  if (error) {
    toast(error.message, "error");
    return;
  }

  localStorage.setItem("covoitcp_active_group", groupId);
  toast("Groupe sélectionné.");
  await refreshCallback();
}

export function leaveActiveGroupSelection(refreshCallback) {
  localStorage.removeItem("covoitcp_active_group");
  state.group = null;
  state.members = [];
  state.trips = [];
  refreshCallback();
}

export function renderAvailableGroups() {
  const container = $("#availableGroupsList");

  if (!state.availableGroups.length) {
    container.innerHTML = `
      <div class="card empty-list">
        Aucun groupe n'est encore disponible.
      </div>`;
    return;
  }

  container.innerHTML = state.availableGroups.map(group => `
    <article class="group-choice-card">
      <div class="group-choice-icon">🚗</div>
      <div class="group-choice-copy">
        <h3>${escapeHtml(group.name)}</h3>
        <p>${escapeHtml(group.meeting_point)}</p>
        <small>${group.member_count} membre${group.member_count > 1 ? "s" : ""}</small>
      </div>
      <button
        type="button"
        class="btn primary"
        data-select-group="${group.id}">
        ${group.is_member ? "Ouvrir" : "Rejoindre"}
      </button>
    </article>
  `).join("");
}

export function renderMembers() {
  $("#membersList").innerHTML = state.members
    .map(member => {
      const name = member.profiles?.full_name || "Collègue";

      return `
        <div class="member">
          <span class="mini-avatar">${escapeHtml(initials(name))}</span>
          <div>
            <strong>${escapeHtml(name)}</strong>
            <small>${member.role === "admin" ? "Responsable du groupe" : "Membre"}</small>
          </div>
        </div>`;
    })
    .join("");
}
