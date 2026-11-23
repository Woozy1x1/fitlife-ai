import {$,VY,db,errText,msg} from "../lib/basis.js";
import {KINDS,state,timesFor} from "./kern.js";
import {renderAll} from "./start.js";
import {writeNightWindows} from "./tageswechsel.js";

// -----------------------------------
// Einstellungen (Mehr)
// -----------------------------------

export function setupSettings() {
  if(!$("shiftMode")) return;
  $("shiftSave").addEventListener("click",saveSettings);
  $("shiftMode").addEventListener("change",() => $("shiftDetails").classList.toggle("hidden",!$("shiftMode").checked));
}

export function renderSettings() {
  if(!$("shiftMode")) return;
  $("shiftMode").checked = state.mode;
  $("shiftQuiet").checked = state.quiet;
  if($("shiftAutoday")) $("shiftAutoday").checked = state.autoday;
  if($("shiftQuietWork")) $("shiftQuietWork").checked = state.quietWork;
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
  const row = {user_id:uid,shift_mode:$("shiftMode").checked,shift_quiet:$("shiftQuiet").checked,shift_times:times,
    shift_autoday:$("shiftAutoday")?.checked!==false,shift_quiet_work:!!$("shiftQuietWork")?.checked};
  $("shiftSave").disabled = true;
  const {error} = await db.from("user_goals").upsert(row,{onConflict:"user_id"});
  $("shiftSave").disabled = false;
  if(error) { msg("shiftMessage","Speichern fehlgeschlagen: "+errText(error)); return; }
  state.mode = row.shift_mode; state.quiet = row.shift_quiet; state.times = times;
  state.autoday = row.shift_autoday; state.quietWork = row.shift_quiet_work;
  writeNightWindows();
  msg("shiftMessage",state.mode
    ? "✓ Gespeichert. Trag jetzt unten deinen Dienstplan ein."
    : "✓ Gespeichert. Schichtdienst ist ausgeschaltet.");
  renderAll();
  if(state.mode) $("shiftPlanCard")?.scrollIntoView({behavior:"smooth",block:"start"});
}
