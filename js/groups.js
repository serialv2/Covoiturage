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

  toast(`Groupe créé. Code : ${data}`);
  await refreshCallback();
}

export async function joinGroup(event, refreshCallback) {
  event.preventDefault();

  const { error } = await supabase.rpc("join_carpool_group", {
    p_invite_code: $("#inviteCode").value.trim().toUpperCase()
  });

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast("Groupe rejoint.");
  await refreshCallback();
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
