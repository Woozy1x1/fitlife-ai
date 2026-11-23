import {addDays,avg,el,hm,state} from "./kern.js";
import {$,VY} from "../lib/basis.js";

// -----------------------------------
// Erholung heute (Training)
// -----------------------------------

let recoveryTimer = null;
export function renderRecoverySoon() {
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(renderRecovery,800);
}

export function renderRecovery() {
  const box = $("recoveryBox");
  if(!box || !VY.uid) return;
  box.replaceChildren();
  const today = VY.localDate();
  const sleep = new Map([...(state.data?.sleep||[]),...VY.sleepMinutesByDay()]);
  const lastNight = sleep.get(today) ?? null;
  const prev = [];
  for(let i=1;i<=7;i++) { const v = sleep.get(addDays(today,-i)); if(v!=null) prev.push(v); }
  const sleepAvg = avg(prev);

  const rhrMap = state.data?.rhr || new Map();
  const rhrToday = rhrMap.get(today) ?? null;
  const rhrPrev = [];
  for(let i=1;i<=14;i++) { const v = rhrMap.get(addDays(today,-i)); if(v!=null) rhrPrev.push(v); }
  const rhrAvg = avg(rhrPrev);

  const train = state.data?.train || new Set();
  let trained3 = 0;
  for(let i=0;i<3;i++) if(train.has(addDays(today,-i))) trained3++;
  if(VY.workoutData?.length && !train.has(today) && $("trainingDate")?.value===today) trained3++;

  const well = state.data?.well.get(today);
  const readiness = [...(VY.trackerData?.readiness||[])].filter(r => r.day).sort((a,b) => a.day.localeCompare(b.day)).pop();

  const kv = (value,label,sub) => el("div",{class:"kv"},el("strong",{},value),el("small",{},label),sub ? el("small",{class:"kv-sub"},sub) : null);
  const diff = (a,b,fmt) => a==null || b==null ? null : (a-b>=0 ? "+" : "−")+fmt(Math.abs(a-b))+" ggü. Ø";
  box.append(el("div",{class:"kv-grid"},
    kv(lastNight!=null ? hm(lastNight) : "–","Schlaf letzte Nacht",diff(lastNight,sleepAvg,v => Math.round(v)+" min")),
    kv(rhrToday!=null ? Math.round(rhrToday)+" bpm" : (readiness?.score!=null ? String(readiness.score) : "–"),
      rhrToday!=null ? "Ruhepuls" : "Erholung (Oura)",
      rhrToday!=null ? diff(rhrToday,rhrAvg,v => Math.round(v)+" bpm") : null),
    kv(trained3+" / 3","Trainingstage zuletzt",well?.stress!=null ? "Stress heute "+well.stress+"/5" : null)));

  // Allgemeiner Hinweis – nur, wenn mehrere Zeichen auf einen anstrengenden Tag deuten
  const signs = [
    lastNight!=null && sleepAvg!=null && lastNight<sleepAvg-60,
    lastNight!=null && lastNight<360,
    rhrToday!=null && rhrAvg!=null && rhrToday>=rhrAvg+5,
    trained3>=3,
    well?.stress!=null && well.stress>=4,
    well?.energy!=null && well.energy<=2
  ].filter(Boolean).length;
  box.append(el("p",{class:"tip"},el("strong",{},"Allgemeiner Tipp: "),
    signs>=2
      ? "Heute kommen mehrere Dinge zusammen (z. B. wenig Schlaf, viel Stress oder viele Trainingstage am Stück). "+
        "Viele Trainingspläne sehen dann eine leichtere Einheit, Mobility oder einen Ruhetag vor. Hör auf deinen Körper."
      : "Erholung entsteht vor allem durch Schlaf, genug Essen und Pausen zwischen harten Einheiten. "+
        "Bei Schmerzen, Schwindel oder Krankheit lieber pausieren."));
  box.append(el("p",{class:"muted small-note"},"Nur deine eigenen Werte im Vergleich zu deinem Durchschnitt – keine Bewertung deiner Gesundheit."));
}
