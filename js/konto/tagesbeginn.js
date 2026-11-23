import {$,VY,db,errText,msg} from "../lib/basis.js";

// -----------------------------------
// Schichtarbeit: Tagesbeginn
// -----------------------------------

export function setupDayStart() {
  if(!$("dayStartSelect")) return;
  $("dayStartSelect").value = String(VY.dayStartHour);
  $("dayStartSave").addEventListener("click",saveDayStart);
}

export async function syncDayStart() {
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
