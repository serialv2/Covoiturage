import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { $, toast, escapeHtml, initials } from "./utils.js";

function adminUserHtml(user, showActions = true) {
  return `
    <div class="admin-user">
      <span class="mini-avatar">${escapeHtml(initials(user.full_name))}</span>
      <div>
        <strong>${escapeHtml(user.full_name)}</strong>
        <small>${escapeHtml(user.email)}</small>
      </div>
      ${showActions
        ? `<div class="admin-actions">
            <button class="approve" data-approve="${user.id}">Valider</button>
            <button class="reject" data-reject="${user.id}">Refuser</button>
          </div>`
        : ""}
    </div>`;
}

export async function loadAdmin() {
  if (!state.profile?.is_admin) return;

  const { data, error } = await supabase.rpc("admin_list_profiles");

  if (error) {
    toast(error.message, "error");
    return;
  }

  const pending = (data || []).filter(user => user.status === "pending");
  const approved = (data || []).filter(user => user.status === "approved");

  $("#pendingUsers").innerHTML = pending.length
    ? pending.map(user => adminUserHtml(user)).join("")
    : `<div class="empty-list">Aucune demande.</div>`;

  $("#approvedUsers").innerHTML = approved.length
    ? approved.map(user => adminUserHtml(user, false)).join("")
    : `<div class="empty-list">Aucun compte validé.</div>`;
}

export async function setProfileStatus(userId, status) {
  const { error } = await supabase.rpc("admin_set_profile_status", {
    p_user_id: userId,
    p_status: status
  });

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast(status === "approved" ? "Compte validé." : "Compte refusé.");
  await loadAdmin();
}
