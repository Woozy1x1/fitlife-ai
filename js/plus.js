// VYORA AI – Erweiterungen
// Medikamentenplan, Symptom-Tagebuch, Laborwerte, Blutdruck-Woche,
// Arztbericht, Zwei-Faktor-Anmeldung, Schichtarbeit und Bestleistungen.
//
// Grundsatz (keine Medizinprodukt-Funktion): VYORA speichert und zeigt an,
// was du selbst einträgst. Es wird nichts bewertet, eingestuft oder
// vorhergesagt und keine Dosis berechnet.

let VY = null;
let db = null;
let $ = null;

const state = {
  meds:[],
  intakes:[],
  intakeDay:"",
  symptoms:[],
  labs:[],
  prs:null,
  medLoad:0,
  symLoad:0,
  labLoad:0,
  prLoad:0,
  pendingFactor:null
};

// -----------------------------------
// Hilfsfunktionen
// -----------------------------------

function el(tag,props={},...children) {
  const node = document.createElement(tag);
  for(const [key,value] of Object.entries(props||{})) {
    if(value==null || value===false) continue;
    if(key==="class") node.className = value;
    else if(key==="text") node.textContent = value;
    else if(key.startsWith("on")) node.addEventListener(key.slice(2),value);
    else if(key in node && typeof value!=="string") node[key] = value;
    else node.setAttribute(key,value===true ? "" : value);
  }
  for(const child of children.flat()) {
    if(child==null || child===false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function msg(id,text) {
  const node = $(id);
  if(node) node.textContent = text || "";
}

function fmtDate(day,withYear=true) {
  if(!day) return "–";
  const d = new Date(day+"T12:00:00");
  return isNaN(d.getTime()) ? day : d.toLocaleDateString("de-DE",
    withYear ? {day:"2-digit",month:"2-digit",year:"numeric"} : {day:"2-digit",month:"2-digit"});
}

function fmtDay(day) {
  if(day===VY.localDate()) return "Heute";
  if(day===VY.daysAgo(1)) return "Gestern";
  const d = new Date(day+"T12:00:00");
  return d.toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit"});
}

function fmtNum(n,digits=1) {
  if(n==null || !Number.isFinite(Number(n))) return "–";
  return Number(n).toLocaleString("de-DE",{maximumFractionDigits:digits});
}

function hhmm(t) {
  return String(t||"").slice(0,5);
}

function clockOf(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" :
    String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}

function dayOf(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : VY.dayString(d);
}

function avg(list) {
  return list.length ? list.reduce((a,b) => a+b,0)/list.length : null;
}

function errText(error) {
  const text = String(error?.message || error || "");
  return /fetch|network|offline/i.test(text)
    ? "Keine Verbindung. Bitte später noch einmal versuchen."
    : text;
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function delButton(label,onClick) {
  return el("button",{type:"button","aria-label":label,onclick:onClick},"Löschen");
}

function timeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin"; }
  catch(_e) { return "Europe/Berlin"; }
}

// -----------------------------------
// Start
// -----------------------------------

export function init(api) {
  VY = api;
  db = api.supabase;
  $ = api.$;

  setupSubnav();
  setupMeds();
  setupSymptoms();
  setupLabs();
  setupReport();
  setupSecurity();
  setupDayStart();

  VY.on("user",loadAll);
  VY.on("reset",resetAll);
  VY.on("refresh",onRefresh);
  VY.on("measures",renderBpWeek);
  VY.on("training",schedulePrs);

  if(VY.uid) loadAll();
}

function loadAll() {
  if(!VY.uid) return;
  loadMeds();
  loadSymptoms();
  loadLabs();
  loadPrs();
  renderBpWeek();
  loadSecurity();
  syncDayStart();
}

function resetAll() {
  state.meds = [];
  state.intakes = [];
  state.intakeDay = "";
  state.symptoms = [];
  state.labs = [];
  state.prs = null;
  state.medLoad++; state.symLoad++; state.labLoad++; state.prLoad++;
  state.pendingFactor = null;
  for(const id of ["medToday","medList","symRecent","labList","bpWeek","prWeeks","printReport"]) {
    $(id)?.replaceChildren();
  }
  if($("prList")) $("prList").textContent = "Noch keine Trainings eingetragen.";
  for(const id of ["medMessage","symMessage","labMessage","reportMessage","mfaSetupMessage","dayStartMessage"]) msg(id,"");
  resetMedForm();
  $("mfaSetup")?.classList.add("hidden");
  $("mfaEnable")?.classList.add("hidden");
  $("mfaDisable")?.classList.add("hidden");
  if($("mfaQr")) $("mfaQr").removeAttribute("src");
  if($("mfaSecret")) $("mfaSecret").value = "";
  msg("mfaStatus","Wird geprüft ...");
}

function onRefresh() {
  // Neuer Tag (auch bei Schichtbeginn): Häkchen für heute neu laden
  if(state.intakeDay && state.intakeDay!==VY.localDate()) loadIntakes();
}

// -----------------------------------
// Unternavigation „Gesundheit“
// -----------------------------------

function setupSubnav() {
  const nav = $("healthSubnav");
  if(!nav) return;
  nav.addEventListener("click",event => {
    const button = event.target.closest("button[data-target]");
    if(!button) return;
    const target = $(button.dataset.target);
    if(!target) return;
    target.scrollIntoView({behavior:reducedMotion() ? "auto" : "smooth",block:"start"});
    const heading = target.querySelector("h2");
    if(heading) {
      heading.setAttribute("tabindex","-1");
      heading.focus({preventScroll:true});
    }
  });
}

// -----------------------------------
// Medikamente
// -----------------------------------

function setupMeds() {
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

function resetMedForm() {
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

async function loadMeds() {
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

async function loadIntakes() {
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

// -----------------------------------
// Symptom-Tagebuch
// -----------------------------------

function setupSymptoms() {
  if(!$("symptomForm")) return;
  const range = $("symIntensity");
  const out = $("symIntensityOut");
  const sync = () => {
    out.textContent = range.value;
    range.setAttribute("aria-valuetext",range.value+" von 10");
  };
  range.addEventListener("input",sync);
  sync();
  $("symDay").value = VY.localDate();
  $("symptomForm").addEventListener("submit",saveSymptom);
}

async function loadSymptoms() {
  const uid = VY.uid;
  if(!uid) return;
  const id = ++state.symLoad;
  const {data,error} = await db.from("symptom_log")
    .select("id,day,symptom,intensity,note,created_at")
    .eq("user_id",uid)
    .gte("day",VY.daysAgo(13))
    .order("day",{ascending:false})
    .order("created_at",{ascending:false})
    .limit(300);
  if(id!==state.symLoad || uid!==VY.uid) return;
  if(error) {
    msg("symMessage","Symptome konnten nicht geladen werden: "+errText(error));
    return;
  }
  state.symptoms = data||[];
  renderSymptoms();
}

function renderSymptoms() {
  const box = $("symRecent");
  if(!box) return;
  box.replaceChildren();
  if(!state.symptoms.length) {
    box.append(el("p",{class:"muted"},"Keine Einträge in den letzten 14 Tagen."));
    return;
  }
  box.append(el("h3",{},"Letzte 14 Tage"));
  let last = "";
  for(const s of state.symptoms) {
    if(s.day!==last) {
      last = s.day;
      box.append(el("div",{class:"day-head"},fmtDay(s.day)));
    }
    box.append(el("div",{class:"meal-row"},
      el("div",{},
        el("strong",{},s.symptom+" · Stärke "+s.intensity+"/10"),
        el("small",{},s.note || "")),
      delButton("Eintrag löschen: "+s.symptom+" am "+fmtDate(s.day),
        event => deleteSymptom(s,event.currentTarget))));
  }
}

async function saveSymptom(event) {
  event.preventDefault();
  const uid = VY.uid;
  if(!uid) return;
  const day = $("symDay").value;
  const symptom = $("symName").value.trim();
  if(!day || !symptom) { msg("symMessage","Bitte Datum und Beschwerde angeben."); return; }
  if(day>VY.localDate()) { msg("symMessage","Das Datum liegt in der Zukunft."); return; }
  const row = {
    user_id:uid,
    day,
    symptom,
    intensity:Math.round(Number($("symIntensity").value)),
    note:$("symNote").value.trim() || null
  };
  $("symSave").disabled = true;
  try {
    const result = await VY.saveOrQueue("symptom_log",row);
    msg("symMessage",result?.queued
      ? "Offline gespeichert – wird übertragen, sobald du wieder online bist."
      : "Eingetragen.");
    $("symName").value = "";
    $("symNote").value = "";
    $("symIntensity").value = "5";
    $("symIntensity").dispatchEvent(new Event("input"));
    if(result?.queued) {
      state.symptoms.unshift({...row,created_at:new Date().toISOString()});
      renderSymptoms();
    } else {
      await loadSymptoms();
    }
  } catch(error) {
    msg("symMessage","Speichern fehlgeschlagen: "+errText(error));
  } finally {
    $("symSave").disabled = false;
  }
}

async function deleteSymptom(s,button) {
  button.disabled = true;
  const {error} = await db.from("symptom_log").delete().eq("id",s.id).eq("user_id",VY.uid);
  if(error) {
    button.disabled = false;
    msg("symMessage","Löschen fehlgeschlagen: "+errText(error));
    return;
  }
  msg("symMessage","Eintrag gelöscht.");
  await loadSymptoms();
}

// -----------------------------------
// Laborwerte
// -----------------------------------

// Häufige Werte mit der üblichen Einheit als Vorschlag. Die Einheit auf
// dem eigenen Befund hat immer Vorrang (Labore nutzen unterschiedliche).
const LAB_SUGGEST = [
  ["HbA1c","%"],["Nüchternglukose","mg/dl"],["Gesamtcholesterin","mg/dl"],
  ["LDL-Cholesterin","mg/dl"],["HDL-Cholesterin","mg/dl"],["Triglyceride","mg/dl"],
  ["Lipoprotein(a)","nmol/l"],["Kreatinin","mg/dl"],["eGFR","ml/min/1,73m²"],
  ["Harnsäure","mg/dl"],["TSH","mU/l"],["Vitamin D (25-OH)","ng/ml"],
  ["Vitamin B12","pg/ml"],["Ferritin","ng/ml"],["Hämoglobin","g/dl"],
  ["CRP","mg/l"],["GPT (ALT)","U/l"],["GOT (AST)","U/l"],["Gamma-GT","U/l"],
  ["Kalium","mmol/l"],["Natrium","mmol/l"],["PSA","ng/ml"]
];

function setupLabs() {
  if(!$("labForm")) return;
  $("labSuggest").replaceChildren(...LAB_SUGGEST.map(([name]) => el("option",{value:name})));
  // Einheit vorschlagen, sobald ein bekannter Wert gewählt ist
  const suggestUnit = () => {
    const name = $("labName").value.trim().toLowerCase();
    const hit = LAB_SUGGEST.find(([n]) => n.toLowerCase()===name);
    const known = state.labs.find(l => l.name.trim().toLowerCase()===name && l.unit);
    if(!$("labUnit").value && document.activeElement!==$("labUnit")) $("labUnit").value = known?.unit || hit?.[1] || "";
  };
  $("labName").addEventListener("input",suggestUnit);
  $("labName").addEventListener("change",suggestUnit);
  $("labDay").value = VY.localDate();
  $("labForm").addEventListener("submit",saveLab);
}

async function loadLabs() {
  const uid = VY.uid;
  if(!uid) return;
  const id = ++state.labLoad;
  const {data,error} = await db.from("lab_results")
    .select("id,day,name,value,unit,ref_low,ref_high,note")
    .eq("user_id",uid)
    .order("day",{ascending:false})
    .limit(1000);
  if(id!==state.labLoad || uid!==VY.uid) return;
  if(error) {
    msg("labMessage","Laborwerte konnten nicht geladen werden: "+errText(error));
    return;
  }
  state.labs = data||[];
  renderLabs();
}

function labGroups(rows) {
  const groups = new Map();
  for(const row of rows) {
    const key = row.name.trim().toLowerCase();
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(list => list.sort((a,b) => b.day.localeCompare(a.day)))
    .sort((a,b) => b[0].day.localeCompare(a[0].day));
}

function refText(row) {
  const lo = row.ref_low!=null, hi = row.ref_high!=null;
  if(!lo && !hi) return "";
  const unit = row.unit ? " "+row.unit : "";
  if(lo && hi) return fmtNum(row.ref_low,3)+"–"+fmtNum(row.ref_high,3)+unit;
  return lo ? "ab "+fmtNum(row.ref_low,3)+unit : "bis "+fmtNum(row.ref_high,3)+unit;
}

function sparkline(points,label) {
  // Nur der Verlauf deiner eigenen Werte – ohne Grenzen oder Farben,
  // die etwas bewerten würden.
  const values = points.map(p => Number(p.value));
  const min = Math.min(...values), max = Math.max(...values);
  const w = 120, h = 32, pad = 4;
  const span = max-min || 1;
  const xy = values.map((v,i) => [
    pad+(values.length===1 ? (w-2*pad)/2 : i*(w-2*pad)/(values.length-1)),
    h-pad-(v-min)/span*(h-2*pad)
  ]);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox",`0 0 ${w} ${h}`);
  svg.setAttribute("class","spark");
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label",label);
  const line = document.createElementNS(ns,"polyline");
  line.setAttribute("points",xy.map(p => p.map(n => n.toFixed(1)).join(",")).join(" "));
  svg.append(line);
  for(const [x,y] of xy) {
    const dot = document.createElementNS(ns,"circle");
    dot.setAttribute("cx",x.toFixed(1)); dot.setAttribute("cy",y.toFixed(1)); dot.setAttribute("r","2.4");
    svg.append(dot);
  }
  return svg;
}

function renderLabs() {
  const box = $("labList");
  if(!box) return;
  box.replaceChildren();
  if(!state.labs.length) {
    box.append(el("p",{class:"muted"},"Noch keine Laborwerte eingetragen."));
    return;
  }
  for(const group of labGroups(state.labs)) {
    const latest = group[0];
    const unit = latest.unit ? " "+latest.unit : "";
    const ref = refText(latest);
    const chrono = [...group].reverse().slice(-8);
    const summary = el("summary",{},
      el("span",{class:"lab-name"},latest.name),
      el("span",{class:"lab-value"},fmtNum(latest.value,3)+unit),
      el("small",{class:"muted"},fmtDate(latest.day)+(group.length>1 ? " · "+group.length+" Werte" : "")));
    const body = el("div",{class:"lab-body"},
      ref ? el("p",{class:"muted small-note"},"Referenzbereich laut deinem Befund: "+ref) : null,
      chrono.length>1 ? sparkline(chrono,"Verlauf "+latest.name+": "+
        chrono.map(p => fmtNum(p.value,3)+" am "+fmtDate(p.day)).join(", ")) : null,
      ...group.map(row => el("div",{class:"meal-row"},
        el("div",{},
          el("strong",{},fmtDate(row.day)+" · "+fmtNum(row.value,3)+(row.unit ? " "+row.unit : "")),
          el("small",{},row.note || "")),
        delButton("Löschen: "+row.name+" vom "+fmtDate(row.day),event => deleteLab(row,event.currentTarget)))));
    box.append(el("details",{class:"lab-group"},summary,body));
  }
}

function numOrNull(id) {
  const raw = $(id).value.trim().replace(",",".");
  if(raw==="") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

async function saveLab(event) {
  event.preventDefault();
  const uid = VY.uid;
  if(!uid) return;
  const day = $("labDay").value;
  const name = $("labName").value.trim();
  const value = numOrNull("labValue");
  const low = numOrNull("labLow");
  const high = numOrNull("labHigh");
  if(!day || !name || value==null) { msg("labMessage","Bitte Datum, Wert und Ergebnis angeben."); return; }
  if([value,low,high].some(n => Number.isNaN(n))) { msg("labMessage","Bitte nur Zahlen eingeben."); return; }
  if(day>VY.localDate()) { msg("labMessage","Das Datum liegt in der Zukunft."); return; }
  if(low!=null && high!=null && low>high) { msg("labMessage","„Referenz von“ ist größer als „bis“. Bitte prüfen."); return; }
  const row = {user_id:uid,day,name,value,unit:$("labUnit").value.trim() || null,ref_low:low,ref_high:high};
  $("labSave").disabled = true;
  try {
    const {error} = await db.from("lab_results").insert(row);
    if(error) throw error;
    msg("labMessage","„"+name+"“ gespeichert.");
    $("labName").value = ""; $("labValue").value = ""; $("labUnit").value = "";
    $("labLow").value = ""; $("labHigh").value = "";
    await loadLabs();
  } catch(error) {
    msg("labMessage","Speichern fehlgeschlagen: "+errText(error));
  } finally {
    $("labSave").disabled = false;
  }
}

async function deleteLab(row,button) {
  button.disabled = true;
  const {error} = await db.from("lab_results").delete().eq("id",row.id).eq("user_id",VY.uid);
  if(error) {
    button.disabled = false;
    msg("labMessage","Löschen fehlgeschlagen: "+errText(error));
    return;
  }
  msg("labMessage","Eintrag gelöscht.");
  await loadLabs();
}

// -----------------------------------
// Blutdruck – letzte 7 Tage
// -----------------------------------

function bpStats(rows) {
  const part = list => ({
    n:list.length,
    sys:avg(list.map(r => r.systolic)),
    dia:avg(list.map(r => r.diastolic)),
    pulse:avg(list.filter(r => r.pulse!=null).map(r => r.pulse)),
    days:new Set(list.map(r => dayOf(r.measured_at))).size
  });
  const hour = r => new Date(r.measured_at).getHours();
  return {
    morning:part(rows.filter(r => hour(r)>=4 && hour(r)<12)),
    evening:part(rows.filter(r => hour(r)>=17 || hour(r)<4)),
    all:part(rows)
  };
}

function bpKv(stat,label) {
  return el("div",{class:"kv"},
    el("strong",{},stat.n ? Math.round(stat.sys)+"/"+Math.round(stat.dia) : "–"),
    el("small",{},label+(stat.n ? " · "+stat.n+" Messung"+(stat.n===1 ? "" : "en") : "")));
}

function renderBpWeek() {
  const box = $("bpWeek");
  if(!box) return;
  box.replaceChildren();
  const rows = (VY.measureData||[]).filter(m => m.kind==="bp" && m.systolic && m.diastolic);
  if(!rows.length) {
    box.append(el("p",{class:"muted"},"Noch keine Blutdruck-Messungen im Messtagebuch der letzten 7 Tage."));
    return;
  }
  const s = bpStats(rows);
  box.append(
    el("div",{class:"kv-grid"},bpKv(s.morning,"Ø morgens"),bpKv(s.evening,"Ø abends"),bpKv(s.all,"Ø alle")),
    el("p",{class:"muted small-note"},
      "mmHg · Messungen an "+s.all.days+" von 7 Tagen"+
      (s.all.pulse!=null ? " · Ø Puls "+Math.round(s.all.pulse)+"/min" : "")+
      ". Morgens = 4–12 Uhr, abends = ab 17 Uhr."),
    el("p",{class:"tip"},
      el("strong",{},"Allgemeiner Tipp: "),
      "Für ein Protokoll vor dem Arzttermin empfiehlt die Deutsche Hochdruckliga, "+
      "7 Tage lang morgens und abends jeweils zweimal im Abstand von etwa einer Minute "+
      "im Sitzen zu messen. Was die Werte für dich bedeuten, klärst du mit deiner Ärztin oder deinem Arzt."));
}

// -----------------------------------
// Bericht für den Arzttermin (Drucken / PDF)
// -----------------------------------

function setupReport() {
  if(!$("reportPrint")) return;
  $("reportPrint").addEventListener("click",buildReport);
  window.addEventListener("afterprint",() => {
    // Gesundheitsdaten nicht länger als nötig in der Seite lassen
    setTimeout(() => $("printReport")?.replaceChildren(),500);
  });
}

function table(headers,rows) {
  return el("table",{},
    el("thead",{},el("tr",{},headers.map(h => el("th",{scope:"col"},h)))),
    el("tbody",{},rows.map(r => el("tr",{},r.map(c => el("td",{},c==null ? "" : String(c)))))));
}

async function buildReport() {
  const uid = VY.uid;
  if(!uid) return;
  const days = Number(document.querySelector("input[name=reportDays]:checked")?.value || 30);
  const parts = new Set([...document.querySelectorAll("input[name=reportPart]:checked")].map(i => i.value));
  if(!parts.size) { msg("reportMessage","Bitte mindestens einen Inhalt auswählen."); return; }

  const button = $("reportPrint");
  button.disabled = true;
  msg("reportMessage","Bericht wird erstellt ...");

  const since = VY.daysAgo(days-1);
  const today = VY.localDate();
  const sinceTs = new Date(since+"T00:00:00").toISOString();
  const yearAgo = VY.daysAgo(365);

  const q = (promise) => promise.then(r => {
    if(r.error) throw r.error;
    return r.data||[];
  });

  try {
    const [measures,health,meds,intakes,symptoms,labs,wellbeing,sleep] = await Promise.all([
      (parts.has("bp") || parts.has("glucose"))
        ? q(db.from("measurements").select("kind,measured_at,systolic,diastolic,pulse,glucose_mg_dl,glucose_context,insulin_units,insulin_kind,insulin_name,carbs_ke,notes")
          .eq("user_id",uid).gte("measured_at",sinceTs).order("measured_at",{ascending:true}).limit(3000)) : [],
      (parts.has("weight") || parts.has("bp"))
        ? q(db.from("health_entries").select("entry_date,weight_kg,systolic,diastolic,pulse,notes")
          .eq("user_id",uid).gte("entry_date",since).order("entry_date",{ascending:true}).limit(1000)) : [],
      parts.has("meds") ? q(db.from("medications").select("id,name,amount,times,active,note").eq("user_id",uid).order("created_at",{ascending:true})) : [],
      parts.has("meds") ? q(db.from("medication_intakes").select("medication_id,day,slot").eq("user_id",uid).gte("day",since).limit(5000)) : [],
      parts.has("symptoms") ? q(db.from("symptom_log").select("day,symptom,intensity,note").eq("user_id",uid).gte("day",since).order("day",{ascending:true}).limit(2000)) : [],
      parts.has("labs") ? q(db.from("lab_results").select("day,name,value,unit,ref_low,ref_high,note").eq("user_id",uid).gte("day",yearAgo).order("day",{ascending:true}).limit(1000)) : [],
      parts.has("wellbeing") ? q(db.from("wellbeing_log").select("day,mood,energy,stress").eq("user_id",uid).gte("day",since).limit(400)) : [],
      parts.has("sleep") ? q(db.from("daily_metrics").select("day,source,sleep_minutes,sleep_quality").eq("user_id",uid).gte("day",since).order("day",{ascending:true}).limit(400)) : []
    ]);

    const out = $("printReport");
    out.replaceChildren();
    out.append(
      el("header",{class:"pr-head"},
        el("h1",{},"Gesundheitsbericht"),
        el("p",{},"Zeitraum: "+fmtDate(since)+" – "+fmtDate(today)+" · erstellt am "+
          new Date().toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"})+" mit VYORA AI"),
        el("p",{class:"pr-fill"},"Name: ______________________________   Geburtsdatum: ______________"),
        el("p",{class:"pr-note"},"Alle Werte wurden von der Person selbst erfasst oder aus verbundenen "+
          "Geräten übernommen. VYORA AI ist kein Medizinprodukt und bewertet die Werte nicht.")));

    const section = (title,...content) => out.append(el("section",{},el("h2",{},title),...content));
    const none = text => el("p",{class:"pr-empty"},text);

    if(parts.has("bp")) {
      const bp = measures.filter(m => m.kind==="bp");
      const legacy = health.filter(h => h.systolic && h.diastolic);
      if(!bp.length && !legacy.length) section("Blutdruck & Puls",none("Keine Messungen im Zeitraum."));
      else {
        const s = bpStats(bp);
        const fmtS = (x,label) => label+": "+(x.n ? Math.round(x.sys)+"/"+Math.round(x.dia)+" mmHg ("+x.n+" Messung"+(x.n===1 ? "" : "en")+")" : "–");
        const sys = bp.map(r => r.systolic), dia = bp.map(r => r.diastolic);
        section("Blutdruck & Puls",
          bp.length ? el("p",{},[fmtS(s.morning,"Ø morgens (4–12 Uhr)"),fmtS(s.evening,"Ø abends (ab 17 Uhr)"),fmtS(s.all,"Ø gesamt")].join(" · ")) : null,
          bp.length ? el("p",{},"Spannweite: systolisch "+Math.min(...sys)+"–"+Math.max(...sys)+
            ", diastolisch "+Math.min(...dia)+"–"+Math.max(...dia)+" mmHg"+
            (s.all.pulse!=null ? " · Ø Puls "+Math.round(s.all.pulse)+"/min" : "")) : null,
          table(["Datum","Uhrzeit","Blutdruck (mmHg)","Puls","Notiz"],[
            ...bp.map(r => [dayOf(r.measured_at),clockOf(r.measured_at),r.systolic+"/"+r.diastolic,r.pulse ?? "",r.notes || ""]),
            ...legacy.map(r => [r.entry_date,"",r.systolic+"/"+r.diastolic,r.pulse ?? "",r.notes || ""])
          ].sort((x,y) => (x[0]+x[1]).localeCompare(y[0]+y[1]))
           .map(r => [fmtDate(r[0]),...r.slice(1)])));
      }
    }

    if(parts.has("glucose")) {
      const unit = VY.glucoseUnit==="mmol_l" ? "mmol/l" : "mg/dl";
      const g = v => VY.glucoseUnit==="mmol_l" ? fmtNum(v/18.0182,1) : fmtNum(v,0);
      const ctx = {nuechtern:"nüchtern",vor_essen:"vor dem Essen",nach_essen:"nach dem Essen",nacht:"nachts",sonstiges:"sonstiges"};
      const kinds = {mahlzeit:"Mahlzeit",korrektur:"Korrektur",basal:"Basal",misch:"Misch",sonstiges:"sonstiges"};
      const gl = measures.filter(m => m.kind==="glucose");
      const ins = measures.filter(m => m.kind==="insulin");
      if(!gl.length && !ins.length) section("Blutzucker & Insulin",none("Keine Einträge im Zeitraum."));
      else {
        const byCtx = Object.entries(ctx).map(([k,label]) => {
          const list = gl.filter(r => r.glucose_context===k).map(r => Number(r.glucose_mg_dl));
          return list.length ? "Ø "+label+": "+g(avg(list))+" "+unit+" ("+list.length+")" : null;
        }).filter(Boolean);
        section("Blutzucker & Insulin",
          byCtx.length ? el("p",{},byCtx.join(" · ")) : null,
          gl.length ? table(["Datum","Uhrzeit","Blutzucker ("+unit+")","Situation","Notiz"],
            gl.map(r => [fmtDate(dayOf(r.measured_at)),clockOf(r.measured_at),g(r.glucose_mg_dl),ctx[r.glucose_context] || "",r.notes || ""])) : null,
          ins.length ? el("h3",{},"Insulin (wie eingetragen)") : null,
          ins.length ? table(["Datum","Uhrzeit","Einheiten","Art","Name","KE","Notiz"],
            ins.map(r => [fmtDate(dayOf(r.measured_at)),clockOf(r.measured_at),fmtNum(r.insulin_units,1),kinds[r.insulin_kind] || "",r.insulin_name || "",r.carbs_ke!=null ? fmtNum(r.carbs_ke,1) : "",r.notes || ""])) : null);
      }
    }

    if(parts.has("weight")) {
      const w = health.filter(h => h.weight_kg!=null);
      section("Gewicht", w.length
        ? el("p",{},"Erster Wert: "+fmtNum(w[0].weight_kg)+" kg ("+fmtDate(w[0].entry_date)+") · letzter Wert: "+
            fmtNum(w[w.length-1].weight_kg)+" kg ("+fmtDate(w[w.length-1].entry_date)+") · "+w.length+" Messungen")
        : none("Keine Gewichtseinträge im Zeitraum."));
    }

    if(parts.has("meds")) {
      if(!meds.length) section("Medikamente",none("Kein Medikamentenplan eingetragen."));
      else {
        const count = id => intakes.filter(i => i.medication_id===id).length;
        section("Medikamente",
          el("p",{class:"pr-note"},"Plan wie von der Person eingetragen. Abgehakt = in der App als genommen markiert."),
          table(["Medikament","Menge laut Plan","Uhrzeiten","Status","abgehakt im Zeitraum","Notiz"],
            meds.map(m => [m.name,m.amount || "",(m.times||[]).map(hhmm).join(", "),m.active ? "aktiv" : "pausiert",count(m.id)+"×",m.note || ""])));
      }
    }

    if(parts.has("symptoms")) {
      section("Symptome",symptoms.length
        ? table(["Datum","Beschwerde","Stärke (eigene Einschätzung 0–10)","Notiz"],
            symptoms.map(s => [fmtDate(s.day),s.symptom,s.intensity,s.note || ""]))
        : none("Keine Einträge im Zeitraum."));
    }

    if(parts.has("labs")) {
      section("Laborwerte (letzte 12 Monate)",labs.length
        ? table(["Datum","Wert","Ergebnis","Referenz laut Befund","Notiz"],
            labs.map(l => [fmtDate(l.day),l.name,fmtNum(l.value,3)+(l.unit ? " "+l.unit : ""),refText(l),l.note || ""]))
        : none("Keine Laborwerte eingetragen."));
    }

    if(parts.has("wellbeing")) {
      const a = key => avg(wellbeing.map(w => w[key]).filter(v => v!=null));
      section("Wohlbefinden",wellbeing.length
        ? el("p",{},wellbeing.length+" Check-ins · Ø Stimmung "+fmtNum(a("mood"))+"/5 · Ø Energie "+
            fmtNum(a("energy"))+"/5 · Ø Stress "+fmtNum(a("stress"))+"/5 (jeweils eigene Einschätzung)")
        : none("Keine Check-ins im Zeitraum."));
    }

    if(parts.has("sleep")) {
      const s = sleep.filter(x => x.sleep_minutes);
      const mins = avg(s.map(x => x.sleep_minutes));
      section("Schlaf",s.length
        ? el("p",{},s.length+" Nächte erfasst · Ø Schlafdauer "+Math.floor(mins/60)+" h "+
            String(Math.round(mins%60)).padStart(2,"0")+" min")
        : none("Keine Schlafdaten im Zeitraum."));
    }

    msg("reportMessage","Fertig. Im Druckfenster kannst du „Als PDF sichern“ wählen.");
    window.print();
  } catch(error) {
    msg("reportMessage","Bericht konnte nicht erstellt werden: "+errText(error));
  } finally {
    button.disabled = false;
  }
}

// -----------------------------------
// Zwei-Faktor-Anmeldung einrichten
// -----------------------------------

function setupSecurity() {
  if(!$("securityCard")) return;
  if(!db.auth.mfa) {
    msg("mfaStatus","Auf diesem Gerät nicht verfügbar.");
    return;
  }
  $("mfaEnable").addEventListener("click",startMfa);
  $("mfaCancel").addEventListener("click",cancelMfa);
  $("mfaVerifyForm").addEventListener("submit",verifyMfa);
  $("mfaDisable").addEventListener("click",disableMfa);
  $("mfaSecret").addEventListener("focus",event => event.target.select());
}

async function loadSecurity() {
  if(!db.auth.mfa || !$("securityCard")) return;
  try {
    const {data,error} = await db.auth.mfa.listFactors();
    if(error) throw error;
    const verified = (data?.totp||[]).find(f => f.status==="verified");
    $("mfaSetup").classList.toggle("hidden",!state.pendingFactor);
    $("mfaEnable").classList.toggle("hidden",!!verified || !!state.pendingFactor);
    $("mfaDisable").classList.toggle("hidden",!verified);
    msg("mfaStatus",verified
      ? "✓ Aktiv seit "+new Date(verified.created_at || verified.updated_at || Date.now()).toLocaleDateString("de-DE")+
        ". Beim Anmelden auf einem neuen Gerät fragt VYORA nach dem Code."
      : "Nicht eingerichtet.");
  } catch(error) {
    msg("mfaStatus","Status konnte nicht geladen werden: "+errText(error));
  }
}

async function startMfa() {
  const button = $("mfaEnable");
  button.disabled = true;
  msg("mfaSetupMessage","");
  try {
    // Abgebrochene, nie bestätigte Versuche aufräumen
    const {data:list} = await db.auth.mfa.listFactors();
    for(const f of (list?.all||[])) {
      if(f.status!=="verified" && f.factor_type==="totp") await db.auth.mfa.unenroll({factorId:f.id});
    }
    const {data,error} = await db.auth.mfa.enroll({
      factorType:"totp",
      friendlyName:"VYORA "+new Date().toISOString().slice(0,16).replace("T"," ")
    });
    if(error) throw error;
    state.pendingFactor = data.id;
    $("mfaQr").src = data.totp.qr_code;
    $("mfaSecret").value = data.totp.secret;
    $("mfaVerifyCode").value = "";
    $("mfaSetup").classList.remove("hidden");
    button.classList.add("hidden");
    $("mfaVerifyCode").focus();
  } catch(error) {
    msg("mfaSetupMessage","Einrichtung fehlgeschlagen: "+errText(error));
  } finally {
    button.disabled = false;
  }
}

async function verifyMfa(event) {
  event.preventDefault();
  const code = $("mfaVerifyCode").value.replace(/\s+/g,"");
  if(!/^\d{6}$/.test(code)) { msg("mfaSetupMessage","Bitte den 6-stelligen Code aus der App eingeben."); return; }
  if(!state.pendingFactor) return;
  $("mfaVerifyButton").disabled = true;
  try {
    const {error} = await db.auth.mfa.challengeAndVerify({factorId:state.pendingFactor,code});
    if(error) throw error;
    state.pendingFactor = null;
    $("mfaQr").removeAttribute("src");
    $("mfaSecret").value = "";
    $("mfaSetup").classList.add("hidden");
    msg("mfaSetupMessage","Zwei-Faktor-Anmeldung ist aktiv. Bewahre den Zugang zu deiner Authenticator-App gut auf.");
    await loadSecurity();
  } catch(error) {
    msg("mfaSetupMessage",/invalid|expired|code/i.test(String(error?.message))
      ? "Der Code stimmt nicht. Prüfe, ob die Uhrzeit am Handy stimmt, und gib den aktuellen Code ein."
      : "Aktivieren fehlgeschlagen: "+errText(error));
  } finally {
    $("mfaVerifyButton").disabled = false;
  }
}

async function cancelMfa() {
  const id = state.pendingFactor;
  state.pendingFactor = null;
  $("mfaSetup").classList.add("hidden");
  $("mfaQr").removeAttribute("src");
  $("mfaSecret").value = "";
  msg("mfaSetupMessage","");
  if(id) {
    try { await db.auth.mfa.unenroll({factorId:id}); } catch(_e) {}
  }
  await loadSecurity();
}

async function disableMfa() {
  const button = $("mfaDisable");
  if(button.dataset.confirm!=="1") {
    button.dataset.confirm = "1";
    button.textContent = "Wirklich ausschalten? Nochmal tippen";
    setTimeout(() => {
      button.dataset.confirm = "";
      button.textContent = "Zwei-Faktor-Anmeldung ausschalten";
    },5000);
    return;
  }
  button.disabled = true;
  try {
    const {data:list,error:listError} = await db.auth.mfa.listFactors();
    if(listError) throw listError;
    for(const f of (list?.totp||[])) {
      const {error} = await db.auth.mfa.unenroll({factorId:f.id});
      if(error) throw error;
    }
    msg("mfaSetupMessage","Zwei-Faktor-Anmeldung ist ausgeschaltet.");
  } catch(error) {
    msg("mfaSetupMessage","Ausschalten fehlgeschlagen: "+errText(error));
  } finally {
    button.disabled = false;
    button.dataset.confirm = "";
    button.textContent = "Zwei-Faktor-Anmeldung ausschalten";
    await loadSecurity();
  }
}

// -----------------------------------
// Schichtarbeit: Tagesbeginn
// -----------------------------------

function setupDayStart() {
  if(!$("dayStartSelect")) return;
  $("dayStartSelect").value = String(VY.dayStartHour);
  $("dayStartSave").addEventListener("click",saveDayStart);
}

async function syncDayStart() {
  const uid = VY.uid;
  if(!uid || !$("dayStartSelect")) return;
  const {data,error} = await db.from("user_goals").select("day_start_hour").eq("user_id",uid).maybeSingle();
  if(error || !data || uid!==VY.uid) return;
  const server = Number(data.day_start_hour) || 0;
  if(server!==VY.dayStartHour) {
    // Auf einem anderen Gerät geändert: übernehmen und neu laden
    VY.setDayStartHour(server);
    location.reload();
  }
}

async function saveDayStart() {
  const uid = VY.uid;
  if(!uid) return;
  const hour = Number($("dayStartSelect").value) || 0;
  $("dayStartSave").disabled = true;
  try {
    const {error} = await db.from("user_goals").upsert({user_id:uid,day_start_hour:hour},{onConflict:"user_id"});
    if(error) throw error;
    VY.setDayStartHour(hour);
    msg("dayStartMessage","Gespeichert. VYORA wird neu geladen ...");
    setTimeout(() => location.reload(),600);
  } catch(error) {
    $("dayStartSave").disabled = false;
    msg("dayStartMessage","Speichern fehlgeschlagen: "+errText(error));
  }
}

// -----------------------------------
// Training: Fortschritt & Bestleistungen
// -----------------------------------

let prTimer = null;
function schedulePrs() {
  clearTimeout(prTimer);
  prTimer = setTimeout(loadPrs,1500);
}

async function loadPrs() {
  const uid = VY.uid;
  if(!uid || !$("prCard")) return;
  const id = ++state.prLoad;
  const {data,error} = await db.from("workout_entries")
    .select("exercise,sets,reps,weight_kg,entry_date")
    .eq("user_id",uid)
    .gte("entry_date",VY.daysAgo(364))
    .order("entry_date",{ascending:true})
    .limit(5000);
  if(id!==state.prLoad || uid!==VY.uid) return;
  if(error) {
    $("prList").textContent = "Fortschritt konnte nicht geladen werden: "+errText(error);
    return;
  }
  state.prs = data||[];
  renderPrs();
}

// Epley: 1RM ≈ Gewicht × (1 + Wiederholungen / 30). Nur bis 12 Wdh. sinnvoll.
function e1rm(weight,reps) {
  return weight>0 && reps>0 && reps<=12 ? weight*(1+reps/30) : null;
}

function mondayOf(day) {
  const d = new Date(day+"T12:00:00");
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  return VY.dayString(d);
}

function renderPrs() {
  const rows = state.prs||[];
  const weeksBox = $("prWeeks");
  const list = $("prList");
  weeksBox.replaceChildren();
  list.replaceChildren();
  if(!rows.length) {
    list.textContent = "Noch keine Trainings eingetragen.";
    return;
  }

  // Trainingstage pro Woche (letzte 8 Wochen)
  const thisMonday = mondayOf(VY.localDate());
  const weeks = [];
  for(let i=7;i>=0;i--) {
    const d = new Date(thisMonday+"T12:00:00");
    d.setDate(d.getDate()-7*i);
    weeks.push(VY.dayString(d));
  }
  const daysPerWeek = new Map(weeks.map(w => [w,new Set()]));
  for(const r of rows) {
    const w = mondayOf(r.entry_date);
    if(daysPerWeek.has(w)) daysPerWeek.get(w).add(r.entry_date);
  }
  const max = Math.max(3,...[...daysPerWeek.values()].map(s => s.size));
  const chart = el("div",{class:"chart pr-chart",role:"img",
    "aria-label":"Trainingstage pro Woche, letzte 8 Wochen: "+
      weeks.map(w => daysPerWeek.get(w).size).join(", ")});
  for(const w of weeks) {
    const n = daysPerWeek.get(w).size;
    const bar = el("div",{class:"chart-bar"});
    bar.style.height = Math.max(n ? 8 : 0,n/max*100)+"%";
    chart.append(el("div",{class:"chart-column","aria-hidden":"true"},
      el("div",{class:"chart-value"},n),
      el("div",{class:"chart-track"},bar),
      el("div",{class:"chart-label"},w===thisMonday ? "jetzt" : fmtDate(w,false))));
  }
  weeksBox.append(el("h3",{},"Trainingstage pro Woche"),chart);

  // Bestleistungen je Übung
  const byEx = new Map();
  for(const r of rows) {
    const name = String(r.exercise||"").trim();
    if(!name) continue;
    const key = name.toLowerCase();
    if(!byEx.has(key)) byEx.set(key,{name,rows:[]});
    const g = byEx.get(key);
    g.name = name;
    g.rows.push(r);
  }
  const recent = VY.daysAgo(6);
  const items = [...byEx.values()].map(g => {
    let best = null, bestReps = null, bestW = null;
    for(const r of g.rows) {
      const w = Number(r.weight_kg)||0, reps = Number(r.reps)||0;
      const e = e1rm(w,reps);
      if(e && (!best || e>best.value)) best = {value:e,w,reps,day:r.entry_date};
      if(w>0 && (!bestW || w>bestW.w || (w===bestW.w && reps>bestW.reps))) bestW = {w,reps,day:r.entry_date};
      if(!w && reps && (!bestReps || reps>bestReps.reps)) bestReps = {reps,day:r.entry_date};
    }
    const last = g.rows[g.rows.length-1].entry_date;
    const sessions = new Set(g.rows.map(r => r.entry_date)).size;
    return {name:g.name,best,bestW,bestReps,last,sessions};
  }).sort((a,b) => b.last.localeCompare(a.last)).slice(0,12);

  list.append(el("h3",{},"Bestleistungen"));
  for(const it of items) {
    const facts = [];
    if(it.bestW) facts.push("schwerster Satz "+fmtNum(it.bestW.w)+" kg × "+it.bestW.reps+" ("+fmtDate(it.bestW.day,false)+")");
    if(it.best) facts.push("1RM geschätzt ≈ "+fmtNum(Math.round(it.best.value*2)/2)+" kg");
    if(it.bestReps) facts.push("meiste Wdh. "+it.bestReps.reps+" ("+fmtDate(it.bestReps.day,false)+")");
    const fresh = [it.bestW?.day,it.best?.day,it.bestReps?.day].some(d => d && d>=recent);
    list.append(el("div",{class:"meal-row"},
      el("div",{},
        el("strong",{},it.name,fresh ? el("span",{class:"pill pr-new"},"neu diese Woche") : null),
        el("small",{},(facts.join(" · ") || "noch keine Wiederholungen eingetragen")+
          " · "+it.sessions+" Trainingstag"+(it.sessions===1 ? "" : "e")))));
  }
}
