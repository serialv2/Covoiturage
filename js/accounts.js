import { state } from "./state.js";
import { $, escapeHtml, initials } from "./utils.js";

function relationships() {
  const currentUserId = state.session.user.id;
  const result = new Map();

  state.members
    .filter(member => member.user_id !== currentUserId)
    .forEach(member => {
      result.set(member.user_id, {
        id: member.user_id,
        name: member.profiles?.full_name || "Collègue",
        iDrove: 0,
        droveMe: 0
      });
    });

  state.trips.forEach(trip => {
    const passengerIds = (trip.trip_passengers || []).map(item => item.passenger_id);

    if (trip.driver_id === currentUserId) {
      passengerIds.forEach(id => {
        if (result.has(id)) result.get(id).iDrove++;
      });
    }

    if (passengerIds.includes(currentUserId) && result.has(trip.driver_id)) {
      result.get(trip.driver_id).droveMe++;
    }
  });

  return [...result.values()].map(item => ({
    ...item,
    balance: item.iDrove - item.droveMe
  }));
}

function accountRow(item) {
  let situation = "Équilibré";
  let className = "even";

  if (item.balance > 0) {
    situation = `Vous avez ${item.balance} trajet${item.balance > 1 ? "s" : ""} d'avance`;
    className = "positive";
  } else if (item.balance < 0) {
    const count = Math.abs(item.balance);
    situation = `${item.name} a ${count} trajet${count > 1 ? "s" : ""} d'avance`;
    className = "negative";
  }

  return `
    <tr>
      <td>
        <div class="person">
          <span class="mini-avatar">${escapeHtml(initials(item.name))}</span>
          ${escapeHtml(item.name)}
        </div>
      </td>
      <td>${item.iDrove}</td>
      <td>${item.droveMe}</td>
      <td class="${className}">${escapeHtml(situation)}</td>
    </tr>`;
}

export function renderAccounts() {
  const rows = relationships();

  $("#accountsBody").innerHTML = rows.length
    ? rows.map(accountRow).join("")
    : `<tr><td colspan="4" class="empty-list">Pas encore de comptes.</td></tr>`;

  $("#accountPreview").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Collègue</th>
            <th>Je l'ai conduit</th>
            <th>Il/elle m'a conduit</th>
            <th>Situation</th>
          </tr>
        </thead>
        <tbody>
          ${rows.slice(0, 5).map(accountRow).join("") ||
            `<tr><td colspan="4" class="empty-list">Pas encore de comptes.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}
