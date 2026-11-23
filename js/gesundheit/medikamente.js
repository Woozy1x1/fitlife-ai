import {state} from "./zustand.js";
import {$,VY,clockOf,db,delButton,el,errText,hhmm,msg,timeZone} from "../lib/basis.js";

// -----------------------------------
// Medikamente
// -----------------------------------

export function setupMeds() {
  if(!$("medForm")) return;
  resetMedForm();
  $("medAddTime").addEventListener("click",() => addTimeInput(""));
  $("medCancel").addEventListener("click",resetMedForm);
  $("medForm").addEventListener("submit",saveMed);
  $("medRemind").addEventListener("change",remindHint);
}

function addTimeInput(value) {
  const box = $("medTimes");
  if(box.children.length>=6) {
    msg("medMessage","Höchstens 6 Uhrzeiten pro Medikament.");
    return;
  }
  const index = box.children.length+1;
  const input = el("input",{type:"time",required:true,value:value||"08:00","aria-label":"Uhrzeit "+index});
  const remove = el("button",{type:"button",class:"icon-btn","aria-label":"Uhrzeit "+index+" entfernen",
    onclick:() => {
      if(box.children.length<=1) return;
      row.remove();
      relabelTimes();
    }},"✕");
  const row = el("div",{class:"time-row"},input,remove);
  box.append(row);
  relabelTimes();
  if(!value) input.focus();
}

function relabelTimes() {
  const rows = [...$("medTimes").children];
  rows.forEach((row,i) => {
    row.querySelector("input").setAttribute("aria-label","Uhrzeit "+(i+1));
    const button = row.querySelector("button");
    button.setAttribute("aria-label","Uhrzeit "+(i+1)+" entfernen");
    button.disabled = rows.length<=1;
  });
  $("medAddTime").disabled = rows.length>=6;
}

export function resetMedForm() {
  if(!$("medForm")) return;
  $("medForm").reset();
  $("medForm").dataset.id = "";
  $("medTimes").replaceChildren();
  addTimeInput("08:00");
  $("medFormTitle").textContent = "Medikament hinzufügen";
  $("medCancel").classList.add("hidden");
}

function remindHint() {
  if(!$("medRemind").checked) return;
  const granted = typeof Notification!=="undefined" && Notification.permission==="granted";
  if(!granted) {
    msg("medMessage","Damit die Erinnerung ankommt, erlaube Benachrichtigungen unter „Mehr → Erinnerungen“.");
  }
}

export async function loadMeds() {
  const uid = VY.uid;
  if(!uid) return;
  const id = ++state.medLoad;
  const {data,error} = await db.from("medications")
    .select("id,name,amount,times,remind,active,note,created_at")
    .eq("user_id",uid)
    .order("created_at",{ascending:true});
  if(id!==state.medLoad || uid!==VY.uid) return;
  if(error) {
    msg("medMessage","Medikamente konnten nicht geladen werden: "+errText(error));
    return;
  }
  state.meds = (data||[]).map(m => ({...m,times:(m.times||[]).map(hhmm).sort()}));
  renderMedList();
  await loadIntakes();
}

export async function loadIntakes() {
  const uid = VY.uid;
  if(!uid) return;
  const id = state.medLoad;
  const day = VY.localDate();
  const {data,error} = await db.from("medication_intakes")
    .select("id,medication_id,day,slot,taken_at")
    .eq("user_id",uid)
    .eq("day",day);
  if(id!==state.medLoad || uid!==VY.uid) return;
  if(error) {
    msg("medMessage","Einnahmen konnten nicht geladen werden: "+errText(error));
    return;
  }
  state.intakes = (data||[]).map(i => ({...i,slot:hhmm(i.slot)}));
  state.intakeDay = day;
  renderMedToday();
}

function renderMedToday() {
  const box = $("medToday");
  if(!box) return;
  box.replaceChildren();
  const active = state.meds.filter(m => m.active);
  if(!active.length) {
    box.append(el("p",{class:"muted"},
      state.meds.length
        ? "Alle Medikamente sind pausiert."
        : "Noch kein Medikament eingetragen. Öffne „Medikamente verwalten“, um deinen Plan anzulegen."));
    if(!state.meds.length) $("medManage").open = true;
    return;
  }

  const slots = [];
  for(const med of active) {
    for(const slot of med.times) slots.push({med,slot});
  }
  slots.sort((a,b) => a.slot.localeCompare(b.slot) || a.med.name.localeCompare(b.med.name));

  const done = slots.filter(s => takenFor(s.med.id,s.slot)).length;
  box.append(el("p",{class:"med-progress"},
    el("strong",{},done+" von "+slots.length),
    " heute abgehakt"));

  for(const {med,slot} of slots) {
    const taken = takenFor(med.id,slot);
    const label = slot+" Uhr · "+med.name;
    box.append(el("div",{class:"check-row"+(taken ? " complete" : "")},
      el("div",{class:"check-icon","aria-hidden":"true"},taken ? "✓" : "💊"),
      el("div",{class:"check-main"},
        el("strong",{},med.name),
        el("small",{class:"muted"},[slot+" Uhr",med.amount,med.note,
          taken ? "✓ "+clockOf(taken.taken_at) : null].filter(Boolean).join(" · "))),
      el("button",{type:"button","aria-pressed":taken ? "true" : "false",
        "aria-label":(taken ? "Häkchen entfernen: " : "Als genommen abhaken: ")+label,
        onclick:event => toggleIntake(med,slot,event.currentTarget)},
        taken ? "Genommen ✓" : "Abhaken")));
  }
}

function takenFor(medId,slot) {
  return state.intakes.find(i => i.medication_id===medId && i.slot===slot) || null;
}

async function toggleIntake(med,slot,button) {
  const uid = VY.uid;
  if(!uid) return;
  button.disabled = true;
  const day = state.intakeDay || VY.localDate();
  const existing = takenFor(med.id,slot);
  try {
    if(existing) {
      const {error} = await db.from("medication_intakes").delete()
        .eq("user_id",uid).eq("medication_id",med.id).eq("day",day).eq("slot",slot);
      if(error) throw error;
      state.intakes = state.intakes.filter(i => i!==existing);
    } else {
      const row = {user_id:uid,medication_id:med.id,day,slot,taken_at:new Date().toISOString()};
      const result = await VY.saveOrQueue("medication_intakes",row,{onConflict:"user_id,medication_id,day,slot"});
      state.intakes.push(row);
      if(result?.queued) msg("medMessage","Offline gespeichert – wird übertragen, sobald du wieder online bist.");
      else msg("medMessage","");
    }
    renderMedToday();
  } catch(error) {
    button.disabled = false;
    msg("medMessage","Speichern fehlgeschlagen: "+errText(error));
  }
}

function renderMedList() {
  const list = $("medList");
  if(!list) return;
  list.replaceChildren();
  for(const med of state.meds) {
    const info = el("div",{},
      el("strong",{},med.name+(med.active ? "" : " (pausiert)")),
      el("small",{},[med.amount,med.times.join(", ")+" Uhr",med.remind ? "🔔 Erinnerung an" : null]
        .filter(Boolean).join(" · ")));
    list.append(el("div",{class:"meal-row"},info,
      el("div",{class:"row-actions"},
        el("button",{type:"button",class:"soft-btn","aria-label":"Bearbeiten: "+med.name,
          onclick:() => editMed(med)},"Ändern"),
        el("button",{type:"button",class:"soft-btn","aria-label":(med.active ? "Pausieren: " : "Fortsetzen: ")+med.name,
          onclick:event => setMedActive(med,!med.active,event.currentTarget)},med.active ? "Pause" : "Weiter"),
        delButton("Löschen: "+med.name,event => deleteMed(med,event.currentTarget)))));
  }
}

function editMed(med) {
  $("medForm").dataset.id = med.id;
  $("medName").value = med.name;
  $("medAmount").value = med.amount || "";
  $("medNote").value = med.note || "";
  $("medRemind").checked = !!med.remind;
  $("medTimes").replaceChildren();
  med.times.forEach(t => addTimeInput(t));
  $("medFormTitle").textContent = "„"+med.name+"“ ändern";
  $("medCancel").classList.remove("hidden");
  $("medManage").open = true;
  $("medName").focus();
}

async function saveMed(event) {
  event.preventDefault();
  const uid = VY.uid;
  if(!uid) return;
  const name = $("medName").value.trim();
  const times = [...new Set([...$("medTimes").querySelectorAll("input")]
    .map(i => i.value).filter(v => /^\d{2}:\d{2}$/.test(v)))].sort();
  if(!name) { msg("medMessage","Bitte einen Namen eingeben."); return; }
  if(!times.length) { msg("medMessage","Bitte mindestens eine Uhrzeit angeben."); return; }

  const row = {
    name,
    amount:$("medAmount").value.trim() || null,
    note:$("medNote").value.trim() || null,
    times,
    remind:$("medRemind").checked,
    tz:timeZone(),
    updated_at:new Date().toISOString()
  };
  const id = $("medForm").dataset.id;
  $("medSave").disabled = true;
  try {
    const {error} = id
      ? await db.from("medications").update(row).eq("id",id).eq("user_id",uid)
      : await db.from("medications").insert({...row,user_id:uid,active:true});
    if(error) throw error;
    msg("medMessage",id ? "Änderung gespeichert." : "„"+name+"“ wurde zu deinem Plan hinzugefügt.");
    resetMedForm();
    await loadMeds();
  } catch(error) {
    msg("medMessage","Speichern fehlgeschlagen: "+errText(error));
  } finally {
    $("medSave").disabled = false;
  }
}

async function setMedActive(med,active,button) {
  button.disabled = true;
  const {error} = await db.from("medications")
    .update({active,updated_at:new Date().toISOString()})
    .eq("id",med.id).eq("user_id",VY.uid);
  if(error) {
    button.disabled = false;
    msg("medMessage","Ändern fehlgeschlagen: "+errText(error));
    return;
  }
  msg("medMessage",active ? "„"+med.name+"“ ist wieder im Plan." : "„"+med.name+"“ ist pausiert.");
  await loadMeds();
}

async function deleteMed(med,button) {
  if(button.dataset.confirm!=="1") {
    button.dataset.confirm = "1";
    button.textContent = "Sicher?";
    button.setAttribute("aria-label","Wirklich löschen: "+med.name+" mit allen Häkchen");
    setTimeout(() => {
      if(!button.isConnected) return;
      button.dataset.confirm = "";
      button.textContent = "Löschen";
      button.setAttribute("aria-label","Löschen: "+med.name);
    },4000);
    return;
  }
  button.disabled = true;
  const {error} = await db.from("medications").delete().eq("id",med.id).eq("user_id",VY.uid);
  if(error) {
    button.disabled = false;
    msg("medMessage","Löschen fehlgeschlagen: "+errText(error));
    return;
  }
  if($("medForm").dataset.id===med.id) resetMedForm();
  msg("medMessage","„"+med.name+"“ wurde gelöscht.");
  await loadMeds();
}
