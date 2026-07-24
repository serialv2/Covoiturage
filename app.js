import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);

const state = {
  session:null,
  profile:null,
  group:null,
  members:[],
  trips:[],
  calendarDate:new Date(),
  calendarFilter:"mine",
  selectedCalendarDate:null
};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function toast(message,type="ok"){
  const el=$("#toast"); el.textContent=message; el.className=`toast ${type==="error"?"error":""}`; el.hidden=false;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.hidden=true,3500);
}
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function initials(name="?"){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("")||"?"}
function formatDate(v){return new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"2-digit",month:"short"}).format(new Date(`${v}T12:00:00`))}
function setPage(page){
  $$(".page").forEach(x=>x.hidden=true); $(`#${page}Page`).hidden=false;
  $$(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
}
async function getMyProfile(){
  const {data,error}=await supabase.from("profiles").select("*").eq("id",state.session.user.id).single();
  if(error) throw error; return data;
}
async function loadGroup(){
  const {data,error}=await supabase.from("group_members")
    .select("group_id, groups(*)").eq("user_id",state.session.user.id)
    .order("joined_at",{ascending:false}).limit(1).maybeSingle();
  if(error) throw error;
  state.group=data?.groups||null;
  if(!state.group){state.members=[];state.trips=[];render();return}
  const [{data:members,error:me},{data:trips,error:te}]=await Promise.all([
    supabase.from("group_members").select("user_id,role,joined_at,profiles(id,full_name,status)").eq("group_id",state.group.id).order("joined_at"),
    supabase.from("trips").select(`id,group_id,trip_date,departure_time,note,driver_id,created_by,created_at,
      driver:profiles!trips_driver_id_fkey(id,full_name),
      trip_passengers(passenger_id,passenger:profiles!trip_passengers_passenger_id_fkey(id,full_name))`)
      .eq("group_id",state.group.id).order("trip_date",{ascending:false}).order("departure_time",{ascending:false})
  ]);
  if(me) throw me;if(te) throw te;state.members=members||[];state.trips=trips||[];render();
}
function render(){
  const logged=!!state.session, approved=state.profile?.status==="approved";
  $("#authView").hidden=logged; $("#pendingView").hidden=!logged||approved; $("#appView").hidden=!logged||!approved;
  if(!logged||!approved)return;
  $("#userName").textContent=state.profile.full_name;$("#userAvatar").textContent=initials(state.profile.full_name);
  $("#userRole").textContent=state.profile.is_admin?"Administrateur":"Membre";$("#adminNav").hidden=!state.profile.is_admin;
  const has=!!state.group;$("#noGroupView").hidden=has;$$(".page").forEach(x=>x.hidden=true);$("#newTripBtn").disabled=!has;
  if(!has){$("#headerTitle").textContent="Covoit'CP";$("#headerSubtitle").textContent="Crée ou rejoins un groupe";return}
  $("#dashboardPage").hidden=false;$("#headerTitle").textContent=state.group.name;$("#headerSubtitle").textContent=`Rendez-vous : ${state.group.meeting_point}`;
  $("#groupInfoName").textContent=state.group.name;$("#groupInfoMeeting").textContent=state.group.meeting_point;$("#groupInfoCode").textContent=state.group.invite_code;
  renderStats();renderTrips();renderCalendar();renderAccounts();renderMembers();fillTripForm();
}
function relations(){
  const me=state.session.user.id,map=new Map();
  state.members.filter(m=>m.user_id!==me).forEach(m=>map.set(m.user_id,{id:m.user_id,name:m.profiles?.full_name||"Collègue",iDrove:0,droveMe:0}));
  state.trips.forEach(t=>{
    const p=(t.trip_passengers||[]).map(x=>x.passenger_id);
    if(t.driver_id===me)p.forEach(id=>map.has(id)&&map.get(id).iDrove++);
    if(p.includes(me)&&map.has(t.driver_id))map.get(t.driver_id).droveMe++;
  });
  return [...map.values()].map(x=>({...x,balance:x.iDrove-x.droveMe}));
}
function renderStats(){
  const me=state.session.user.id, driven=state.trips.filter(t=>t.driver_id===me).length,
    passenger=state.trips.filter(t=>(t.trip_passengers||[]).some(p=>p.passenger_id===me)).length;
  $("#statDriven").textContent=driven;$("#statPassenger").textContent=passenger;$("#statBalance").textContent=`${driven-passenger>=0?"+":""}${driven-passenger}`;$("#statMembers").textContent=state.members.length;
}
function tripHtml(t,del=false){
  const passengers=(t.trip_passengers||[]).map(p=>p.passenger?.full_name||"Collègue").join(", ")||"Aucun";
  const can=del&&(t.created_by===state.session.user.id||t.driver_id===state.session.user.id||state.profile.is_admin);
  return `<div class="trip"><div class="trip-date"><strong>${esc(formatDate(t.trip_date))}</strong><span>${esc(t.departure_time.slice(0,5))}</span></div>
    <div class="trip-main"><strong>Conducteur : ${esc(t.driver?.full_name||"Collègue")}</strong><small>Passagers : ${esc(passengers)}</small>${t.note?`<small>${esc(t.note)}</small>`:""}</div>
    <div class="trip-actions"><span class="badge">Aller-retour</span>${can?`<button class="danger-btn" data-delete="${t.id}">Supprimer</button>`:""}</div></div>`;
}
function renderTrips(){
  const today=new Date();today.setHours(0,0,0,0);
  const upcoming=state.trips
    .filter(t=>new Date(`${t.trip_date}T12:00:00`)>=today)
    .filter(t=>tripRoleForMe(t)!=="group")
    .sort((a,b)=>a.trip_date.localeCompare(b.trip_date)||a.departure_time.localeCompare(b.departure_time));

  $("#upcomingTrips").innerHTML=upcoming.length
    ? upcoming.slice(0,4).map(t=>tripHtml(t)).join("")
    : `<div class="empty-list">Aucun trajet à venir.</div>`;
}

function startOfDay(date){
  const value=new Date(date);
  value.setHours(0,0,0,0);
  return value;
}

function dateKey(date){
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,"0");
  const day=String(date.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}

function tripRoleForMe(trip){
  const me=state.session.user.id;
  if(trip.driver_id===me)return "driver";
  if((trip.trip_passengers||[]).some(p=>p.passenger_id===me))return "passenger";
  return "group";
}

function filteredCalendarTrips(){
  if(state.calendarFilter==="group")return state.trips;
  return state.trips.filter(trip=>tripRoleForMe(trip)!=="group");
}

function renderCalendar(){
  const grid=$("#calendarGrid");
  if(!grid || !state.group)return;

  const current=new Date(state.calendarDate.getFullYear(),state.calendarDate.getMonth(),1);
  const monthTitle=new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(current);
  $("#calendarMonthTitle").textContent=monthTitle;

  $("#myTripsFilter").classList.toggle("active",state.calendarFilter==="mine");
  $("#groupTripsFilter").classList.toggle("active",state.calendarFilter==="group");

  const mondayIndex=(current.getDay()+6)%7;
  const gridStart=new Date(current);
  gridStart.setDate(current.getDate()-mondayIndex);

  const tripsByDay=new Map();
  filteredCalendarTrips().forEach(trip=>{
    if(!tripsByDay.has(trip.trip_date))tripsByDay.set(trip.trip_date,[]);
    tripsByDay.get(trip.trip_date).push(trip);
  });

  const todayKey=dateKey(new Date());
  let html="";

  for(let i=0;i<42;i++){
    const day=new Date(gridStart);
    day.setDate(gridStart.getDate()+i);

    const key=dateKey(day);
    const dayTrips=(tripsByDay.get(key)||[])
      .sort((a,b)=>(a.departure_time||"").localeCompare(b.departure_time||""));

    const otherMonth=day.getMonth()!==current.getMonth();
    const classes=[
      "calendar-day",
      otherMonth?"other-month":"",
      key===todayKey?"today":"",
      dayTrips.length?"has-trips":""
    ].filter(Boolean).join(" ");

    const events=dayTrips.slice(0,3).map(trip=>{
      const role=tripRoleForMe(trip);
      let label;
      if(role==="driver"){
        const passengerCount=(trip.trip_passengers||[]).length;
        label=`🚗 Je conduis · ${trip.departure_time.slice(0,5)} · ${passengerCount} pass.`;
      }else if(role==="passenger"){
        label=`👤 Avec ${trip.driver?.full_name||"un collègue"} · ${trip.departure_time.slice(0,5)}`;
      }else{
        label=`🚘 ${trip.driver?.full_name||"Conducteur"} · ${trip.departure_time.slice(0,5)}`;
      }
      return `<div class="calendar-event ${role}">${esc(label)}</div>`;
    }).join("");

    html+=`
      <button type="button" class="${classes}" data-calendar-date="${key}" ${dayTrips.length?"":"disabled"}>
        <div class="calendar-day-number">
          <span>${day.getDate()}</span>
          ${dayTrips.length?`<span class="calendar-day-count">${dayTrips.length}</span>`:""}
        </div>
        <div class="calendar-events">
          ${events}
          ${dayTrips.length>3?`<div class="calendar-more">+ ${dayTrips.length-3} autre${dayTrips.length-3>1?"s":""}</div>`:""}
        </div>
      </button>`;
  }

  grid.innerHTML=html;
}

function openDayDetails(dayKey){
  state.selectedCalendarDate=dayKey;
  const dayTrips=filteredCalendarTrips()
    .filter(trip=>trip.trip_date===dayKey)
    .sort((a,b)=>(a.departure_time||"").localeCompare(b.departure_time||""));

  const date=new Date(`${dayKey}T12:00:00`);
  $("#dayDetailsTitle").textContent=new Intl.DateTimeFormat("fr-FR",{
    weekday:"long",day:"numeric",month:"long",year:"numeric"
  }).format(date);

  $("#dayDetailsSubtitle").textContent=
    state.calendarFilter==="mine"
      ?"Covoiturages qui te concernent."
      :"Tous les covoiturages du groupe.";

  $("#dayDetailsList").innerHTML=dayTrips.length
    ? dayTrips.map(trip=>dayTripDetailsHtml(trip)).join("")
    : `<div class="empty-list">Aucun covoiturage ce jour.</div>`;

  $("#dayDetailsDialog").showModal();
}

function dayTripDetailsHtml(trip){
  const role=tripRoleForMe(trip);
  const roleText=role==="driver"?"Je conduis":role==="passenger"?"Je suis passager":"Trajet du groupe";
  const passengers=(trip.trip_passengers||[])
    .map(p=>p.passenger?.full_name||"Collègue")
    .join(", ")||"Aucun passager";

  const canDelete=
    trip.created_by===state.session.user.id ||
    trip.driver_id===state.session.user.id ||
    state.profile.is_admin;

  return `
    <div class="day-trip">
      <div class="day-trip-head">
        <strong>${esc(trip.departure_time.slice(0,5))} — Aller-retour</strong>
        <span class="day-trip-role ${role}">${esc(roleText)}</span>
      </div>
      <div class="day-trip-meta">
        <span><b>Conducteur :</b> ${esc(trip.driver?.full_name||"Collègue")}</span>
        <span><b>Passagers :</b> ${esc(passengers)}</span>
        <span><b>Rendez-vous :</b> ${esc(state.group.meeting_point)}</span>
        ${trip.note?`<span><b>Note :</b> ${esc(trip.note)}</span>`:""}
      </div>
      ${canDelete?`<div><button class="danger-btn" data-delete="${trip.id}">Supprimer ce trajet</button></div>`:""}
    </div>`;
}

function setCalendarMonth(offset){
  state.calendarDate=new Date(
    state.calendarDate.getFullYear(),
    state.calendarDate.getMonth()+offset,
    1
  );
  renderCalendar();
}

function openTripForSelectedDay(){
  $("#dayDetailsDialog").close();
  openTrip();
  if(state.selectedCalendarDate){
    $("#tripDate").value=state.selectedCalendarDate;
  }
}


function accountRow(r){
  let text="Équilibré",cl="even";if(r.balance>0){text=`Vous avez ${r.balance} trajet${r.balance>1?"s":""} d'avance`;cl="positive"}
  if(r.balance<0){const n=Math.abs(r.balance);text=`${r.name} a ${n} trajet${n>1?"s":""} d'avance`;cl="negative"}
  return `<tr><td><div class="person"><span class="mini-avatar">${esc(initials(r.name))}</span>${esc(r.name)}</div></td><td>${r.iDrove}</td><td>${r.droveMe}</td><td class="${cl}">${esc(text)}</td></tr>`;
}
function renderAccounts(){
  const rows=relations(),body=rows.length?rows.map(accountRow).join(""):`<tr><td colspan="4" class="empty-list">Pas encore de comptes.</td></tr>`;
  $("#accountsBody").innerHTML=body;$("#accountPreview").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Collègue</th><th>Je l'ai conduit</th><th>Il/elle m'a conduit</th><th>Situation</th></tr></thead><tbody>${rows.slice(0,5).map(accountRow).join("")||`<tr><td colspan="4" class="empty-list">Pas encore de comptes.</td></tr>`}</tbody></table></div>`;
}
function renderMembers(){
  $("#membersList").innerHTML=state.members.map(m=>{const n=m.profiles?.full_name||"Collègue";return `<div class="member"><span class="mini-avatar">${esc(initials(n))}</span><div><strong>${esc(n)}</strong><small>${m.role==="admin"?"Responsable du groupe":"Membre"}</small></div></div>`}).join("");
}
function fillTripForm(){
  $("#driverSelect").innerHTML=state.members.map(m=>`<option value="${m.user_id}">${esc(m.profiles?.full_name||"Collègue")}</option>`).join("");
  $("#driverSelect").value=state.session.user.id;updatePassengers();
}
function updatePassengers(){
  const d=$("#driverSelect").value;$("#passengerChoices").innerHTML=state.members.filter(m=>m.user_id!==d).map(m=>`<label class="check"><input type="checkbox" name="passengers" value="${m.user_id}">${esc(m.profiles?.full_name||"Collègue")}</label>`).join("")||`<div class="empty-list">Aucun autre membre.</div>`;
}
async function loadAdmin(){
  if(!state.profile?.is_admin)return;
  const {data,error}=await supabase.rpc("admin_list_profiles");if(error)return toast(error.message,"error");
  const pending=(data||[]).filter(x=>x.status==="pending"),approved=(data||[]).filter(x=>x.status==="approved");
  $("#pendingUsers").innerHTML=pending.length?pending.map(adminUserHtml).join(""):`<div class="empty-list">Aucune demande.</div>`;
  $("#approvedUsers").innerHTML=approved.length?approved.map(x=>adminUserHtml(x,false)).join(""):`<div class="empty-list">Aucun compte validé.</div>`;
}
function adminUserHtml(u,actions=true){return `<div class="admin-user"><span class="mini-avatar">${esc(initials(u.full_name))}</span><div><strong>${esc(u.full_name)}</strong><small>${esc(u.email)}</small></div>${actions?`<div class="admin-actions"><button class="approve" data-approve="${u.id}">Valider</button><button class="reject" data-reject="${u.id}">Refuser</button></div>`:""}</div>`}
async function register(e){
  e.preventDefault();const full_name=$("#registerName").value.trim();
  const {data,error}=await supabase.auth.signUp({email:$("#registerEmail").value.trim(),password:$("#registerPassword").value,options:{data:{full_name}}});
  if(error)return toast(error.message,"error");
  if(data.session)toast("Compte créé. Il doit maintenant être validé.");else toast("Compte créé.");
}
async function login(e){e.preventDefault();const {error}=await supabase.auth.signInWithPassword({email:$("#loginEmail").value.trim(),password:$("#loginPassword").value});if(error)toast(error.message,"error")}
async function createGroup(e){e.preventDefault();const {data,error}=await supabase.rpc("create_carpool_group",{p_name:$("#groupName").value.trim(),p_meeting_point:$("#meetingPoint").value.trim()});if(error)return toast(error.message,"error");toast(`Groupe créé. Code : ${data}`);await loadGroup()}
async function joinGroup(e){e.preventDefault();const {error}=await supabase.rpc("join_carpool_group",{p_invite_code:$("#inviteCode").value.trim().toUpperCase()});if(error)return toast(error.message,"error");toast("Groupe rejoint.");await loadGroup()}
async function saveTrip(e){
  e.preventDefault();const ids=$$('input[name="passengers"]:checked').map(x=>x.value);if(!ids.length)return toast("Choisis au moins un passager.","error");
  const {error}=await supabase.rpc("create_trip_with_passengers",{p_group_id:state.group.id,p_trip_date:$("#tripDate").value,p_departure_time:$("#tripTime").value,p_driver_id:$("#driverSelect").value,p_passenger_ids:ids,p_note:$("#tripNote").value.trim()||null});
  if(error)return toast(error.message,"error");$("#tripDialog").close();toast("Trajet enregistré.");await loadGroup();
}
async function removeTrip(id){if(!confirm("Supprimer ce trajet ?"))return;const {error}=await supabase.from("trips").delete().eq("id",id);if(error)return toast(error.message,"error");toast("Trajet supprimé.");await loadGroup()}
async function setStatus(id,status){const {error}=await supabase.rpc("admin_set_profile_status",{p_user_id:id,p_status:status});if(error)return toast(error.message,"error");toast(status==="approved"?"Compte validé.":"Compte refusé.");await loadAdmin()}
function openTrip(){const d=new Date();d.setDate(d.getDate()+1);$("#tripDate").value=d.toISOString().slice(0,10);$("#tripTime").value="05:45";$("#driverSelect").value=state.session.user.id;updatePassengers();$("#tripDialog").showModal()}
function bind(){
  $$(".tab").forEach(t=>t.onclick=()=>{$$(".tab").forEach(x=>x.classList.toggle("active",x===t));$("#loginForm").hidden=t.dataset.tab!=="login";$("#registerForm").hidden=t.dataset.tab!=="register"});
  $("#loginForm").onsubmit=login;$("#registerForm").onsubmit=register;$("#createGroupForm").onsubmit=createGroup;$("#joinGroupForm").onsubmit=joinGroup;$("#tripForm").onsubmit=saveTrip;
  $("#driverSelect").onchange=updatePassengers;$("#logoutBtn").onclick=()=>supabase.auth.signOut();$("#pendingLogoutBtn").onclick=()=>supabase.auth.signOut();
  $("#newTripBtn").onclick=openTrip;$$("[data-open-trip]").forEach(x=>x.onclick=openTrip);$("#closeTripBtn").onclick=()=>$("#tripDialog").close();$("#cancelTripBtn").onclick=()=>$("#tripDialog").close();
  $$(".nav").forEach(x=>x.onclick=async()=>{setPage(x.dataset.page);if(x.dataset.page==="admin")await loadAdmin()});$$("[data-page-link]").forEach(x=>x.onclick=()=>setPage(x.dataset.pageLink));
  $("#refreshAdminBtn").onclick=loadAdmin;
  $("#previousMonthBtn").onclick=()=>setCalendarMonth(-1);
  $("#nextMonthBtn").onclick=()=>setCalendarMonth(1);
  $("#todayBtn").onclick=()=>{state.calendarDate=new Date();renderCalendar()};
  $("#myTripsFilter").onclick=()=>{state.calendarFilter="mine";renderCalendar()};
  $("#groupTripsFilter").onclick=()=>{state.calendarFilter="group";renderCalendar()};
  $("#closeDayDetailsBtn").onclick=()=>$("#dayDetailsDialog").close();
  $("#closeDayDetailsBottomBtn").onclick=()=>$("#dayDetailsDialog").close();
  $("#addTripFromDayBtn").onclick=openTripForSelectedDay;
  document.onclick=e=>{
    const calendarDay=e.target.closest("[data-calendar-date]");
    if(calendarDay && !calendarDay.disabled)openDayDetails(calendarDay.dataset.calendarDate);

    const d=e.target.closest("[data-delete]");
    if(d){
      removeTrip(d.dataset.delete);
      if($("#dayDetailsDialog")?.open)$("#dayDetailsDialog").close();
    }

    const a=e.target.closest("[data-approve]");
    if(a)setStatus(a.dataset.approve,"approved");

    const r=e.target.closest("[data-reject]");
    if(r)setStatus(r.dataset.reject,"rejected");
  };
}
async function applySession(session){
  state.session=session;
  if(!session){state.profile=null;state.group=null;render();return}
  try{state.profile=await getMyProfile();if(state.profile.status==="approved")await loadGroup();else render()}catch(e){console.error(e);toast(e.message||"Erreur de chargement.","error")}
}
async function boot(){
  bind();const {data:{session}}=await supabase.auth.getSession();await applySession(session);
  supabase.auth.onAuthStateChange(async(_e,s)=>await applySession(s));
}
boot();
