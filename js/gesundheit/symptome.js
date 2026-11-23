import {state} from "./zustand.js?v=5c0fb232ee";
import {$,VY,db,delButton,el,errText,fmtDate,fmtDay,msg} from "../lib/basis.js?v=5c0fb232ee";

// -----------------------------------
// Symptom-Tagebuch
// -----------------------------------

export function setupSymptoms() {
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

export async function loadSymptoms() {
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
