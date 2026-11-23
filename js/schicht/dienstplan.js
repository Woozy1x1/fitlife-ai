import {$,VY,db,el,errText,msg} from "../lib/basis.js";
import {onImportFile} from "./import-ics.js";
import {KINDS,WD,addDays,mondayOf,shiftOn,shiftText,shortDate,state,timesFor,toMin,weekdayOf} from "./kern.js";
import {renderAll} from "./start.js";
import {writeNightWindows} from "./tageswechsel.js";

// -----------------------------------
// Dienstplan (4 Wochen)
// -----------------------------------

export function setupPlan() {
  if(!$("shiftPlanCard")) return;
  const move = days => { state.start = addDays(state.start || mondayOf(VY.localDate()),days); state.selected = null; renderPlan(); };
  $("spPrev").addEventListener("click",() => move(-28));
  $("spNext").addEventListener("click",() => move(28));
  $("spCopy").addEventListener("click",copyWeek);
  $("spImportBtn")?.addEventListener("click",() => $("spImportFile").click());
  $("spImportFile")?.addEventListener("change",onImportFile);
}

export function renderPlan() {
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

export function guessKind(s,e) {
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
  writeNightWindows();
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
  writeNightWindows();
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
