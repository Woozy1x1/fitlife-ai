// VYORA AI – Schichtdienst (Frühdienst, Spätdienst, Nachtdienst)
// Dienstplan, eigene Dienstzeiten, Schlafplan passend zur Schicht und
// Bewegung passend zur Schicht. Alle Vorschläge sind allgemeine Tipps
// (BAuA, DGSM) – keine medizinische Beratung.

let VY = null;
let db = null;
let $ = null;

const KINDS = {
  frueh:{label:"Frühdienst",short:"F",icon:"🌅",def:["06:00","14:00"]},
  spaet:{label:"Spätdienst",short:"S",icon:"🌆",def:["14:00","22:00"]},
  nacht:{label:"Nachtdienst",short:"N",icon:"🌙",def:["22:00","06:00"]},
  sonder:{label:"Anderer Dienst",short:"X",icon:"🕒",def:["08:00","16:30"]},
  frei:{label:"Frei",short:"–",icon:"🌿",def:null}
};
const WD = ["Mo","Di","Mi","Do","Fr","Sa","So"];

const state = {
  mode:false,
  quiet:true,
  times:{},
  plan:new Map(),
  sleep:new Map(),
  start:null,       // Montag der angezeigten 4 Wochen
  selected:null,
  load:0
};

function el(tag,props={},...children) {
  const node = document.createElement(tag);
  for(const [key,value] of Object.entries(props||{})) {
    if(value==null || value===false) continue;
    if(key==="class") node.className = value;
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

const msg = (id,text) => { if($(id)) $(id).textContent = text || ""; };
const errText = e => /fetch|network/i.test(String(e?.message||e)) ? "Keine Verbindung. Bitte später erneut versuchen." : String(e?.message||e);

function addDays(day,n) {
  const d = new Date(day+"T12:00:00");
  d.setDate(d.getDate()+n);
  return VY.dayString(d);
}
function mondayOf(day) {
  const d = new Date(day+"T12:00:00");
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  return VY.dayString(d);
}
const shortDate = day => new Date(day+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
const weekdayOf = day => (new Date(day+"T12:00:00").getDay()+6)%7;
const toMin = t => { const [h,m] = String(t||"0:0").split(":").map(Number); return h*60+m; };
const fromMin = m => { m = ((Math.round(m)%1440)+1440)%1440; return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0"); };
const hm = min => Math.floor(min/60)+":"+String(Math.round(min%60)).padStart(2,"0")+" h";

function timesFor(kind) {
  const own = state.times?.[kind];
  return Array.isArray(own) && own.length===2 ? own : KINDS[kind]?.def;
}

function shiftOn(day) {
  const row = state.plan.get(day);
  if(!row) return null;
  const def = timesFor(row.kind);
  return {
    ...row,
    start:row.start_time ? String(row.start_time).slice(0,5) : def?.[0] || null,
    end:row.end_time ? String(row.end_time).slice(0,5) : def?.[1] || null
  };
}

function shiftText(s) {
  if(!s) return "nichts eingetragen";
  const k = KINDS[s.kind];
  return k.icon+" "+k.label+(s.kind!=="frei" && s.start ? " "+s.start+"–"+s.end : "");
}

// -----------------------------------
// Start
// -----------------------------------

export function init(api) {
  VY = api;
  db = api.supabase;
  $ = api.$;
  setupSettings();
  setupPlan();
  VY.on("user",loadAll);
  VY.on("reset",resetAll);
  VY.on("refresh",renderAll);
  if(VY.uid) loadAll();
}

function resetAll() {
  state.mode = false; state.quiet = true; state.times = {};
  state.plan = new Map(); state.sleep = new Map(); state.selected = null;
  state.load++;
  renderAll();
}

async function loadAll() {
  const uid = VY.uid;
  if(!uid) return;
  const id = ++state.load;
  const today = VY.localDate();
  const q = p => p.then(r => r.error ? null : r.data).catch(() => null);
  const [goals,plan,metrics] = await Promise.all([
    q(db.from("user_goals").select("shift_mode,shift_quiet,shift_times").eq("user_id",uid).maybeSingle()),
    q(db.from("shift_plan").select("day,kind,start_time,end_time,note").eq("user_id",uid)
      .gte("day",VY.daysAgo(90)).lte("day",addDays(today,70)).limit(400)),
    q(db.from("daily_metrics").select("day,source,sleep_minutes").eq("user_id",uid).gte("day",VY.daysAgo(90)).limit(400))
  ]);
  if(id!==state.load || uid!==VY.uid) return;
  state.mode = !!goals?.shift_mode;
  state.quiet = goals?.shift_quiet!==false;
  state.times = goals?.shift_times || {};
  state.plan = new Map((plan||[]).map(r => [r.day,r]));
  state.sleep = new Map();
  for(const m of metrics||[]) {
    if(m.sleep_minutes!=null && (!state.sleep.has(m.day) || m.source==="apple_health")) state.sleep.set(m.day,Number(m.sleep_minutes));
  }
  state.start = state.start || mondayOf(today);
  renderAll();
}

function renderAll() {
  renderSettings();
  renderPlan();
  renderToday();
  renderSleepPlan();
  renderMove();
}

// -----------------------------------
// Einstellungen (Mehr)
// -----------------------------------

function setupSettings() {
  if(!$("shiftMode")) return;
  $("shiftSave").addEventListener("click",saveSettings);
  $("shiftMode").addEventListener("change",() => $("shiftDetails").classList.toggle("hidden",!$("shiftMode").checked));
}

function renderSettings() {
  if(!$("shiftMode")) return;
  $("shiftMode").checked = state.mode;
  $("shiftQuiet").checked = state.quiet;
  $("shiftDetails").classList.toggle("hidden",!state.mode);
  for(const kind of ["frueh","spaet","nacht"]) {
    const [s,e] = timesFor(kind);
    $("st-"+kind+"-s").value = s;
    $("st-"+kind+"-e").value = e;
  }
  $("shiftPlanCard")?.classList.toggle("hidden",!state.mode);
}

async function saveSettings() {
  const uid = VY.uid;
  if(!uid) return;
  const times = {};
  for(const kind of ["frueh","spaet","nacht"]) {
    const s = $("st-"+kind+"-s").value, e = $("st-"+kind+"-e").value;
    if(!/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(e) || s===e) {
      msg("shiftMessage","Bitte gültige Zeiten für den "+KINDS[kind].label+" eingeben.");
      return;
    }
    times[kind] = [s,e];
  }
  const row = {user_id:uid,shift_mode:$("shiftMode").checked,shift_quiet:$("shiftQuiet").checked,shift_times:times};
  $("shiftSave").disabled = true;
  const {error} = await db.from("user_goals").upsert(row,{onConflict:"user_id"});
  $("shiftSave").disabled = false;
  if(error) { msg("shiftMessage","Speichern fehlgeschlagen: "+errText(error)); return; }
  state.mode = row.shift_mode; state.quiet = row.shift_quiet; state.times = times;
  msg("shiftMessage",state.mode
    ? "✓ Gespeichert. Trag jetzt unten deinen Dienstplan ein."
    : "✓ Gespeichert. Schichtdienst ist ausgeschaltet.");
  renderAll();
  if(state.mode) $("shiftPlanCard")?.scrollIntoView({behavior:"smooth",block:"start"});
}

// -----------------------------------
// Dienstplan (4 Wochen)
// -----------------------------------

function setupPlan() {
  if(!$("shiftPlanCard")) return;
  $("spPrev").addEventListener("click",() => { state.start = addDays(state.start,-28); state.selected = null; renderPlan(); });
  $("spNext").addEventListener("click",() => { state.start = addDays(state.start,28); state.selected = null; renderPlan(); });
  $("spCopy").addEventListener("click",copyWeek);
  $("spImportBtn")?.addEventListener("click",() => $("spImportFile").click());
  $("spImportFile")?.addEventListener("change",onImportFile);
}

function renderPlan() {
  const grid = $("spGrid");
  if(!grid) return;
  if(!state.start) state.start = mondayOf(VY.localDate());
  $("spLabel").textContent = shortDate(state.start)+" – "+shortDate(addDays(state.start,27));
  grid.replaceChildren(...WD.map(d => el("div",{class:"sp-head","aria-hidden":"true"},d)));
  const today = VY.localDate();
  for(let i=0;i<28;i++) {
    const day = addDays(state.start,i);
    const s = shiftOn(day);
    const label = WD[i%7]+" "+shortDate(day)+": "+(s ? KINDS[s.kind].label+(s.kind!=="frei" && s.start ? " "+s.start+" bis "+s.end : "") : "nichts eingetragen");
    grid.append(el("button",{type:"button",
      class:"sp-day"+(s ? " k-"+s.kind : "")+(day===today ? " today" : "")+(day===state.selected ? " sel" : ""),
      "aria-label":label,"aria-pressed":String(day===state.selected),
      onclick:() => { state.selected = day===state.selected ? null : day; renderPlan(); }},
      el("small",{},String(new Date(day+"T12:00:00").getDate())),
      el("strong",{},s ? KINDS[s.kind].short : "·")));
  }
  renderChooser();
  renderCounts();
}

function renderChooser() {
  const box = $("spChooser");
  if(!box) return;
  box.replaceChildren();
  const day = state.selected;
  if(!day) {
    box.append(el("p",{class:"muted small-note"},"Tippe auf einen Tag, um den Dienst einzutragen."));
    return;
  }
  const current = shiftOn(day);
  box.append(el("p",{class:"sp-sel"},WD[weekdayOf(day)]+", "+shortDate(day)+": ",el("strong",{},shiftText(current))));
  const buttons = el("div",{class:"sp-kinds"});
  for(const [kind,k] of Object.entries(KINDS)) {
    if(kind==="sonder") continue;
    buttons.append(el("button",{type:"button",class:"sp-kind k-"+kind,"aria-pressed":String(current?.kind===kind),
      onclick:() => setShift(day,kind)},k.icon+" "+k.label));
  }
  buttons.append(el("button",{type:"button",class:"sp-kind",onclick:() => setShift(day,null)},"✕ Leeren"));
  box.append(buttons);
  // Abweichende Zeiten für diesen Tag
  const s = current && current.kind!=="frei" ? current : null;
  const start = el("input",{type:"time",value:s?.start || "08:00","aria-label":"Dienstbeginn an diesem Tag"});
  const end = el("input",{type:"time",value:s?.end || "16:30","aria-label":"Dienstende an diesem Tag"});
  box.append(el("details",{class:"cx-extra sp-custom"},
    el("summary",{},"Andere Zeiten an diesem Tag"),
    el("div",{class:"sp-times"},start,el("span",{},"bis"),end,
      el("button",{type:"button",class:"btn secondary",onclick:() => {
        if(!start.value || !end.value || start.value===end.value) { msg("spMessage","Bitte Beginn und Ende angeben."); return; }
        const kind = s?.kind && s.kind!=="sonder" ? s.kind : guessKind(start.value,end.value);
        setShift(day,kind,start.value,end.value);
      }},"Übernehmen"))));
}

function guessKind(s,e) {
  const a = toMin(s), b = toMin(e);
  if(b<=a || a>=19*60) return "nacht";
  if(a<10*60) return "frueh";
  if(a>=11*60) return "spaet";
  return "sonder";
}

async function setShift(day,kind,start,end) {
  const uid = VY.uid;
  if(!uid) return;
  let error;
  if(!kind) {
    ({error} = await db.from("shift_plan").delete().eq("user_id",uid).eq("day",day));
    if(!error) state.plan.delete(day);
  } else {
    const def = timesFor(kind);
    const row = {user_id:uid,day,kind,
      start_time:kind==="frei" ? null : (start || def[0]),
      end_time:kind==="frei" ? null : (end || def[1]),
      updated_at:new Date().toISOString()};
    ({error} = await db.from("shift_plan").upsert(row,{onConflict:"user_id,day"}));
    if(!error) state.plan.set(day,row);
  }
  if(error) { msg("spMessage","Speichern fehlgeschlagen: "+errText(error)); return; }
  msg("spMessage","");
  // Nach dem Eintragen direkt zum nächsten Tag springen – so geht ein ganzer Plan schnell
  const next = addDays(day,1);
  state.selected = next<=addDays(state.start,27) ? next : null;
  renderAll();
}

async function copyWeek() {
  const uid = VY.uid;
  const from = mondayOf(state.selected || VY.localDate());
  const rows = [];
  for(let i=0;i<7;i++) {
    const s = state.plan.get(addDays(from,i));
    if(s) rows.push({user_id:uid,day:addDays(from,i+7),kind:s.kind,start_time:s.start_time,end_time:s.end_time,updated_at:new Date().toISOString()});
  }
  if(!rows.length) { msg("spMessage","In der Woche ab "+shortDate(from)+" ist noch nichts eingetragen."); return; }
  const {error} = await db.from("shift_plan").upsert(rows,{onConflict:"user_id,day"});
  if(error) { msg("spMessage","Kopieren fehlgeschlagen: "+errText(error)); return; }
  for(const r of rows) state.plan.set(r.day,r);
  msg("spMessage","✓ Woche ab "+shortDate(from)+" in die Woche ab "+shortDate(addDays(from,7))+" kopiert.");
  renderAll();
}

function renderCounts() {
  const box = $("spCounts");
  if(!box) return;
  const c = {frueh:0,spaet:0,nacht:0,frei:0,sonder:0};
  for(let i=0;i<28;i++) { const s = state.plan.get(addDays(state.start,i)); if(s) c[s.kind]++; }
  box.textContent = "In diesen 4 Wochen: "+c.frueh+"× Früh · "+c.spaet+"× Spät · "+c.nacht+"× Nacht · "+c.frei+"× frei"+(c.sonder ? " · "+c.sonder+"× anders" : "");
}

// -----------------------------------
// Heute: Dienst und Schlafhinweis
// -----------------------------------

function renderToday() {
  const card = $("shiftTodayCard");
  if(!card) return;
  card.classList.toggle("hidden",!state.mode || !VY.uid);
  if(!state.mode) return;
  const today = VY.localDate();
  const t = shiftOn(today), m = shiftOn(addDays(today,1));
  const box = $("shiftTodayBox");
  const tip = sleepLines(today)[0];
  box.replaceChildren(...[
    el("div",{class:"kv-grid two"},
      el("div",{class:"kv"},el("strong",{},t ? KINDS[t.kind].icon+" "+KINDS[t.kind].label : "–"),
        el("small",{},"Heute"+(t && t.kind!=="frei" && t.start ? " · "+t.start+"–"+t.end : ""))),
      el("div",{class:"kv"},el("strong",{},m ? KINDS[m.kind].icon+" "+KINDS[m.kind].label : "–"),
        el("small",{},"Morgen"+(m && m.kind!=="frei" && m.start ? " · "+m.start+"–"+m.end : "")))),
    tip ? el("p",{class:"tip"},el("strong",{},"😴 "),tip) : null,
    !t && !m ? el("p",{class:"muted small-note"},"Für heute und morgen ist noch kein Dienst eingetragen.") : null,
    el("button",{type:"button",class:"link-btn",onclick:openPlan},"Dienstplan bearbeiten")].filter(Boolean));
}

function openPlan() {
  VY.switchView("moreView");
  setTimeout(() => $("shiftPlanCard")?.scrollIntoView({behavior:"smooth",block:"start"}),300);
}

// -----------------------------------
// Schlaf passend zur Schicht
// -----------------------------------

function sleepLines(day) {
  const y = shiftOn(addDays(day,-1)), t = shiftOn(day), m = shiftOn(addDays(day,1));
  const out = [];
  const lastNight = y?.kind==="nacht" && t?.kind!=="nacht";
  if(lastNight) {
    out.push("Nach dem letzten Nachtdienst: nur kurz schlafen (etwa 3–4 Stunden, bis zum frühen Nachmittag), "+
      "dann wach bleiben, Tageslicht tanken und abends zur gewohnten Zeit ins Bett – so kommst du schneller in den Tagesrhythmus.");
  }
  if(t?.kind==="nacht" && t.start) {
    const s = toMin(t.start), e = toMin(t.end);
    if(y?.kind!=="nacht") out.push("Vor dem ersten Nachtdienst: Vorschlaf am Nachmittag, etwa "+fromMin(s-450)+"–"+fromMin(s-360)+" Uhr.");
    else out.push("Vor dem Nachtdienst hilft vielen ein Nickerchen von 20–90 Minuten.");
    out.push("Nach dem Dienst möglichst bald schlafen – etwa "+fromMin(e+45)+"–"+fromMin(e+45+420)+" Uhr. Zimmer abdunkeln, Handy lautlos.");
  }
  if(t?.kind==="spaet" && t.end && m?.kind!=="frueh") {
    out.push("Nach dem Spätdienst (Ende "+t.end+"): etwa eine Stunde runterkommen, dann gegen "+fromMin(toMin(t.end)+60)+" Uhr schlafen.");
  }
  if(m?.kind==="frueh" && m.start) {
    const wake = toMin(m.start)-75, bed = wake-450;
    const bedAbs = ((bed%1440)+1440)%1440;
    const endT = t && t.kind!=="frei" && t.kind!=="nacht" && t.end ? toMin(t.end) : null;
    if(endT!=null && endT>=12*60 && endT+45>bedAbs) {
      const left = (wake+1440)-(endT+45);
      out.push("Spät auf Früh ist ein kurzer Wechsel: nach dem Dienst ("+t.end+") möglichst schnell schlafen. "+
        "Mit Wecker gegen "+fromMin(wake)+" Uhr bleiben dir nur etwa "+hm(Math.max(left,0))+" Schlaf – plane morgen nach dem Dienst Ruhe oder ein Nickerchen ein.");
    } else {
      out.push("Für den Frühdienst morgen: gegen "+fromMin(bed)+" Uhr ins Bett, Wecker etwa "+fromMin(wake)+" Uhr – das sind rund 7½ Stunden Schlaf.");
    }
    if(t && t.kind!=="frei" && t.end && t.kind!=="nacht") {
      let rest = toMin(m.start)-toMin(t.end); if(rest<=0) rest += 1440;
      if(rest<11*60) out.push("Zwischen Dienstende heute ("+t.end+") und Dienstbeginn morgen ("+m.start+") liegen nur "+hm(rest)+
        ". Das Arbeitszeitgesetz sieht in der Regel mindestens 11 Stunden Ruhezeit vor.");
    }
  }
  if(!out.length && (t?.kind==="frei" || !t)) {
    out.push("Freie Tage: Feste Schlafzeiten helfen dem inneren Rhythmus – wenn möglich ähnlich wie an Arbeitstagen.");
  }
  return out;
}

function sleepByShift() {
  const groups = {frueh:[],spaet:[],nacht:[],afterNight:[],frei:[]};
  const sleep = new Map([...state.sleep,...VY.sleepMinutesByDay()]);
  for(const [day,min] of sleep) {
    if(day<VY.daysAgo(90)) continue;
    const y = shiftOn(addDays(day,-1)), t = shiftOn(day);
    if(y?.kind==="nacht") groups.afterNight.push(min);
    else if(t && groups[t.kind]) groups[t.kind].push(min);
  }
  const avg = l => l.reduce((a,b) => a+b,0)/l.length;
  return [["frueh","Vor Frühdiensten"],["spaet","An Spätdienst-Tagen"],["nacht","Vor Nachtdiensten"],["afterNight","Nach Nachtdiensten"],["frei","An freien Tagen"]]
    .filter(([k]) => groups[k].length>=3).map(([k,label]) => ({label,n:groups[k].length,avg:avg(groups[k])}));
}

function renderSleepPlan() {
  const card = $("shiftSleepCard");
  if(!card) return;
  card.classList.toggle("hidden",!state.mode || !VY.uid);
  if(!state.mode) return;
  const today = VY.localDate();
  const box = $("shiftSleepBox");
  const t = shiftOn(today);
  box.replaceChildren(
    el("p",{class:"muted"},"Heute: "+shiftText(t)+" · Morgen: "+shiftText(shiftOn(addDays(today,1)))),
    el("ul",{class:"shift-list"},sleepLines(today).map(l => el("li",{},l))));
  const stats = sleepByShift();
  box.append(el("h3",{},"Dein Schlaf nach Schicht (letzte 90 Tage)"));
  if(stats.length) {
    box.append(el("div",{class:"kv-grid"},stats.map(s => el("div",{class:"kv"},el("strong",{},hm(s.avg)),el("small",{},s.label+" · "+s.n+" Tage")))));
    box.append(el("p",{class:"muted small-note"},"Durchschnitt deiner eingetragenen oder übertragenen Schlafdauer (inklusive Vorschlaf und Nickerchen). Nur eine Übersicht, keine Bewertung."));
  } else {
    box.append(el("p",{class:"muted"},"Sobald du an mindestens 3 Tagen pro Schichtart Schlaf eingetragen hast, siehst du hier, wie viel du vor Früh-, Spät- und Nachtdiensten schläfst."));
  }
}

// -----------------------------------
// Bewegung passend zur Schicht (Training)
// -----------------------------------

function moveLine(s) {
  if(!s || s.kind==="frei") return "Frei: Bewegung, wann es dir passt – draußen bei Tageslicht hilft das zusätzlich deinem Schlaf-Wach-Rhythmus.";
  const a = toMin(s.start), e = toMin(s.end);
  if(s.kind==="frueh") return "Frühdienst: gut passt der Nachmittag nach dem Dienst, etwa "+fromMin(e+60)+"–"+fromMin(e+240)+
    " Uhr. Intensives Training lieber nicht kurz vor dem frühen Schlafengehen.";
  if(s.kind==="spaet") return "Spätdienst: gut passt der Vormittag, etwa "+fromMin(a-270)+"–"+fromMin(a-120)+" Uhr.";
  if(s.kind==="nacht") return "Nachtdienst: nach dem Tagschlaf am Nachmittag, spätestens etwa "+fromMin(a-180)+
    " Uhr fertig sein. Direkt nach dem Dienst nur locker bewegen (z. B. kurzer Spaziergang), dann schlafen.";
  return "Anderer Dienst: Bewegung vor oder nach dem Dienst einplanen – mit etwas Abstand zum Schlafen.";
}

function renderMove() {
  const card = $("shiftMoveCard");
  if(!card) return;
  card.classList.toggle("hidden",!state.mode || !VY.uid);
  if(!state.mode) return;
  const today = VY.localDate();
  const week = el("div",{class:"shift-week","aria-label":"Deine Dienste in den nächsten 7 Tagen"});
  for(let i=0;i<7;i++) {
    const day = addDays(today,i), s = shiftOn(day);
    week.append(el("div",{class:"sw-day"+(s ? " k-"+s.kind : "")},
      el("small",{},i===0 ? "heute" : WD[weekdayOf(day)]),
      el("strong",{},s ? KINDS[s.kind].short : "·")));
  }
  $("shiftMoveBox").replaceChildren(
    week,
    el("p",{class:"tip"},el("strong",{},"Allgemeiner Tipp: "),moveLine(shiftOn(today))),
    el("p",{class:"muted small-note"},"Plane Trainingstage in der Wochenplanung gern um deine Dienste herum – zum Beispiel an freien Tagen oder nach Frühdiensten."));
}

// -----------------------------------
// Import aus einer Kalenderdatei (.ics), z. B. Supershift → Google/iCloud-Kalender
// Die Datei wird nur im Browser gelesen. Gespeichert werden nur Datum,
// Dienstart, Beginn und Ende – keine Titel, Orte oder Notizen.
// -----------------------------------

const ICS_MAX_BYTES = 3*1024*1024;
const ICS_MAX_EVENTS = 20000;
let importRows = [];

async function onImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if(!file) return;
  msg("spMessage","");
  if(file.size>ICS_MAX_BYTES) { msg("spMessage","Die Datei ist zu groß (höchstens 3 MB). Exportiere am besten nur den Supershift-Kalender."); return; }
  let text;
  try { text = await file.text(); } catch { msg("spMessage","Die Datei konnte nicht gelesen werden."); return; }
  if(!/BEGIN:VCALENDAR/i.test(text)) { msg("spMessage","Das ist keine Kalenderdatei (.ics)."); return; }
  const events = parseIcs(text);
  importRows = buildImportRows(events);
  renderImport(events.length);
}

// Zeilen entfalten (RFC 5545: Folgezeilen beginnen mit Leerzeichen oder Tab)
function icsLines(text) {
  return text.replace(/\r\n|\r/g,"\n").replace(/\n[ \t]/g,"").split("\n");
}

function icsText(v) {
  return String(v||"").replace(/\\n/gi," ").replace(/\\([,;\\])/g,"$1").trim();
}

function parseIcs(text) {
  const out = [];
  let cur = null;
  for(const line of icsLines(text)) {
    if(/^BEGIN:VEVENT$/i.test(line)) { cur = {}; continue; }
    if(/^END:VEVENT$/i.test(line)) { if(cur) out.push(cur); cur = null; if(out.length>=ICS_MAX_EVENTS) break; continue; }
    if(!cur) continue;
    const i = line.indexOf(":");
    if(i<0) continue;
    const head = line.slice(0,i), value = line.slice(i+1);
    const [name,...params] = head.split(";");
    const key = name.toUpperCase();
    if(key==="DTSTART" || key==="DTEND") cur[key] = parseIcsDate(value,params);
    else if(key==="SUMMARY") cur.summary = icsText(value).slice(0,80);
    else if(key==="RRULE") cur.rrule = true;
    else if(key==="STATUS") cur.status = value.toUpperCase();
    else if(key==="DURATION") cur.duration = value;
  }
  return out;
}

// Liefert {day:"YYYY-MM-DD", time:"HH:MM"|null, allDay:boolean}
function parseIcsDate(value,params) {
  const v = value.trim();
  const isDate = params.some(p => /^VALUE=DATE$/i.test(p)) || /^\d{8}$/.test(v);
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if(!m) return null;
  const [,Y,M,D,h,mi,,z] = m;
  if(isDate || h==null) return {day:Y+"-"+M+"-"+D,time:null,allDay:true};
  if(z) {
    // UTC → Ortszeit des Geräts
    const d = new Date(Date.UTC(+Y,+M-1,+D,+h,+mi));
    return {day:VY.dayString(d),time:String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"),allDay:false};
  }
  // Mit TZID oder ohne Zeitzone: Uhrzeit so übernehmen, wie sie im Kalender steht
  return {day:Y+"-"+M+"-"+D,time:h+":"+mi,allDay:false};
}

function durationMinutes(iso) {
  const m = String(iso||"").match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
  if(!m) return null;
  return (+m[1]||0)*1440+(+m[2]||0)*60+(+m[3]||0);
}

// Dienstart am Titel erkennen (FD/SD/ND, Früh, Spät, Nacht, Frei, Urlaub …)
function kindFromTitle(title) {
  const t = String(title||"").toLowerCase().normalize("NFC");
  const w = t.replace(/[^a-zäöüß0-9]+/g," ").trim();
  const words = w.split(" ");
  const has = re => re.test(w);
  if(has(/\b(frei|freizeit|frei tag|ruhetag|urlaub|ul|ue|ausgleich|zeitausgleich|az|fza|krank|ku)\b/)) return "frei";
  if(has(/\b(nacht\w*|nd|night)\b/) || (words.length<=2 && words[0]==="n")) return "nacht";
  if(has(/\b(spät\w*|spaet\w*|sd|late)\b/) || (words.length<=2 && words[0]==="s")) return "spaet";
  if(has(/\b(früh\w*|frueh\w*|fd|early)\b/) || (words.length<=2 && words[0]==="f")) return "frueh";
  if(has(/\b(mittel\w*|zwischen\w*|md|zd|tag\w*dienst|td|bereitschaft\w*|rufbereitschaft|bd|rb|dienst|schicht)\b/)) return "sonder";
  return null;
}

function buildImportRows(events) {
  const from = VY.daysAgo(60), until = addDays(VY.localDate(),400);
  const byDay = new Map();
  for(const e of events) {
    if(!e.DTSTART || e.status==="CANCELLED") continue;
    const start = e.DTSTART;
    if(start.day<from || start.day>until) continue;
    const title = e.summary || "";
    let kind = kindFromTitle(title);
    let startT = start.time, endT = null, minutes = null;
    if(!start.allDay) {
      if(e.DTEND && e.DTEND.time) {
        endT = e.DTEND.time;
        const dayDiff = Math.round((new Date(e.DTEND.day+"T12:00:00")-new Date(start.day+"T12:00:00"))/864e5);
        minutes = dayDiff*1440+toMin(endT)-toMin(startT);
      } else if(e.duration) {
        minutes = durationMinutes(e.duration);
        if(minutes!=null) endT = fromMin(toMin(startT)+minutes);
      }
    }
    let sure = !!kind;
    if(!kind) {
      // Ohne passenden Titel: nur Termine, die wie ein Dienst aussehen (3–13 Stunden)
      if(start.allDay || minutes==null || minutes<180 || minutes>780) continue;
      kind = guessKind(startT,endT);
    }
    if(start.allDay && kind!=="frei") {
      // Ganztägig, aber mit Dienst-Titel: Standardzeiten der Dienstart verwenden
      startT = null; endT = null;
    }
    if(kind==="frei") { startT = null; endT = null; }
    const row = {day:start.day,kind,start:startT,end:endT,title,sure,repeat:!!e.rrule};
    const old = byDay.get(start.day);
    // Pro Tag ein Dienst: echte Dienste vor „frei“, sichere vor geratenen
    const rank = r => (r.kind==="frei" ? 0 : 2)+(r.sure ? 1 : 0);
    if(!old || rank(row)>rank(old)) byDay.set(start.day,row);
  }
  return [...byDay.values()].sort((a,b) => a.day<b.day ? -1 : 1)
    .map(r => ({...r,checked:r.sure && !r.repeat,exists:state.plan.has(r.day)}));
}

function renderImport(total) {
  const box = $("spImport");
  if(!box) return;
  box.classList.remove("hidden");
  box.replaceChildren();
  if(!importRows.length) {
    box.append(el("p",{class:"muted"},"In der Datei ("+total+" Termine) wurden keine Dienste gefunden. "+
      "Tipp: In Supershift die Schichten mit Kürzeln wie F, S, N oder Früh, Spät, Nacht benennen und erneut exportieren."),
      el("button",{type:"button",class:"btn secondary full",onclick:closeImport},"Schließen"));
    return;
  }
  const count = () => importRows.filter(r => r.checked).length;
  const saveBtn = el("button",{type:"button",class:"btn full",onclick:saveImport});
  const update = () => {
    const n = count();
    saveBtn.textContent = n ? n+" Dienste übernehmen" : "Nichts ausgewählt";
    saveBtn.disabled = !n;
  };
  const replacing = importRows.filter(r => r.exists).length;
  box.append(
    el("h3",{},"Vorschau: "+importRows.length+" Tage gefunden"),
    el("p",{class:"muted small-note"},"Aus "+total+" Kalenderterminen. Haken = wird übernommen. "+
      "Unsichere Einträge (nur an der Uhrzeit erkannt) sind nicht angehakt."+
      (replacing ? " "+replacing+" Tage haben schon einen Eintrag und werden ersetzt." : "")),
    el("div",{class:"sp-import-list",role:"group","aria-label":"Gefundene Dienste"},
      importRows.map((r,i) => {
        const k = KINDS[r.kind];
        const box2 = el("input",{type:"checkbox",checked:r.checked,onchange:e => { importRows[i].checked = e.target.checked; update(); }});
        const times = r.kind!=="frei" ? " "+(r.start || timesFor(r.kind)?.[0])+"–"+(r.end || timesFor(r.kind)?.[1]) : "";
        return el("label",{class:"sp-import-row k-"+r.kind},
          box2,
          el("span",{},el("strong",{},WD[weekdayOf(r.day)]+" "+shortDate(r.day)+" · "+k.icon+" "+k.label+times),
            el("small",{},(r.title ? "„"+r.title+"“" : "ohne Titel")+(r.sure ? "" : " · an der Uhrzeit erkannt")+
              (r.repeat ? " · Serientermin, bitte prüfen" : "")+(r.exists ? " · ersetzt Eintrag" : ""))));
      })),
    saveBtn,
    el("button",{type:"button",class:"btn secondary full",onclick:closeImport},"Abbrechen"));
  update();
  box.scrollIntoView({behavior:"smooth",block:"start"});
}

function closeImport() {
  importRows = [];
  $("spImport")?.classList.add("hidden");
  $("spImport")?.replaceChildren();
}

async function saveImport() {
  const uid = VY.uid;
  if(!uid) return;
  const now = new Date().toISOString();
  const rows = importRows.filter(r => r.checked).map(r => {
    const def = timesFor(r.kind);
    return {user_id:uid,day:r.day,kind:r.kind,
      start_time:r.kind==="frei" ? null : (r.start || def?.[0] || null),
      end_time:r.kind==="frei" ? null : (r.end || def?.[1] || null),
      updated_at:now};
  });
  if(!rows.length) return;
  for(let i=0;i<rows.length;i+=200) {
    const {error} = await db.from("shift_plan").upsert(rows.slice(i,i+200),{onConflict:"user_id,day"});
    if(error) { msg("spMessage","Import fehlgeschlagen: "+errText(error)+(i ? " ("+i+" Tage wurden schon gespeichert.)" : "")); return; }
    for(const r of rows.slice(i,i+200)) state.plan.set(r.day,r);
  }
  closeImport();
  state.start = mondayOf(rows.find(r => r.day>=VY.localDate())?.day || rows[0].day);
  msg("spMessage","✓ "+rows.length+" Dienste importiert.");
  renderAll();
}
