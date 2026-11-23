import {state} from "../gesundheit/zustand.js";
import {$,VY,db,el,errText,fmtDate,fmtNum} from "../lib/basis.js";

// -----------------------------------
// Training: Fortschritt & Bestleistungen
// -----------------------------------

let prTimer = null;
export function schedulePrs() {
  clearTimeout(prTimer);
  prTimer = setTimeout(loadPrs,1500);
}

export async function loadPrs() {
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
