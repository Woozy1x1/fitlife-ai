import {addDays,avg,de,el,hm,state} from "./kern.js";
import {loadDay} from "./tagesansicht.js";
import {$,VY} from "../lib/basis.js";

// -----------------------------------
// Zusammenhänge
// -----------------------------------

export function setupTabs() {
  const tabs = $("trendsTabs");
  if(!tabs) return;
  tabs.addEventListener("click",event => {
    const b = event.target.closest("button[data-tab]");
    if(!b) return;
    state.tab = b.dataset.tab;
    for(const x of tabs.querySelectorAll("button")) x.setAttribute("aria-selected",String(x===b));
    $("linksPanel").classList.toggle("hidden",state.tab!=="links");
    $("dayPanel").classList.toggle("hidden",state.tab!=="day");
    if(state.tab==="day") loadDay();
  });
}

// Vergleicht den Durchschnitt eines Wertes an zwei Gruppen von Tagen.
function compare(days,inA,inB,value) {
  const a = [], b = [];
  for(const d of days) {
    const v = value(d);
    if(v==null || !Number.isFinite(v)) continue;
    const ga = inA(d), gb = inB(d);
    if(ga===true) a.push(v); else if(gb===true) b.push(v);
  }
  return {a:avg(a),b:avg(b),na:a.length,nb:b.length};
}

export function renderLinks() {
  const box = $("linksBox");
  if(!box) return;
  box.replaceChildren();
  const d = state.data;
  if(!d) return;

  const today = VY.localDate();
  const days = [];
  for(let i=89;i>=0;i--) days.push(addDays(today,-i));
  const W = (day,key) => d.well.get(day)?.[key] ?? null;
  const filled = new Set([...d.well.keys()]).size;

  const findings = [];
  const add = (r,ok,text) => {
    if(r.na>=5 && r.nb>=5 && r.a!=null && r.b!=null) findings.push({...r,ok,text});
  };

  // Schlaf (Nacht zum Tag) → Energie und Stimmung am selben Tag
  const longSleep = day => d.sleep.has(day) ? d.sleep.get(day)>=420 : null;
  add(compare(days,x => longSleep(x)===true,x => longSleep(x)===false,x => W(x,"energy")),0.3,
    r => "Nach Nächten mit mindestens 7 Stunden Schlaf lag deine Energie im Schnitt bei "+de(r.a)+
      " – sonst bei "+de(r.b)+" (Skala 1–5).");
  add(compare(days,x => longSleep(x)===true,x => longSleep(x)===false,x => W(x,"mood")),0.3,
    r => "Deine Stimmung war nach mindestens 7 Stunden Schlaf im Schnitt "+de(r.a)+", sonst "+de(r.b)+".");

  // Training → Stimmung, Stress, Schlaf in der folgenden Nacht
  const trained = x => d.train.has(x);
  const trackedDay = x => d.well.has(x) || d.sleep.has(addDays(x,1));
  add(compare(days,x => trained(x),x => !trained(x) && trackedDay(x),x => W(x,"mood")),0.3,
    r => "An Trainingstagen lag deine Stimmung im Schnitt bei "+de(r.a)+", an anderen Tagen bei "+de(r.b)+".");
  add(compare(days,x => trained(x),x => !trained(x) && trackedDay(x),x => d.sleep.get(addDays(x,1)) ?? null),15,
    r => "Nach Trainingstagen hast du im Schnitt "+hm(r.a)+" geschlafen, sonst "+hm(r.b)+".");

  // Stress → Schlaf in der folgenden Nacht
  add(compare(days,x => W(x,"stress")!=null && W(x,"stress")>=4,x => W(x,"stress")!=null && W(x,"stress")<=2,
    x => d.sleep.get(addDays(x,1)) ?? null),15,
    r => "Nach Tagen mit viel Stress (4–5) hast du im Schnitt "+hm(r.a)+" geschlafen, nach ruhigen Tagen (1–2) "+hm(r.b)+".");

  // Schritte → Stimmung
  const stepVals = [...d.steps.values()].sort((a,b) => a-b);
  if(stepVals.length>=10) {
    const median = stepVals[Math.floor(stepVals.length/2)];
    add(compare(days,x => d.steps.has(x) && d.steps.get(x)>=median,x => d.steps.has(x) && d.steps.get(x)<median,x => W(x,"mood")),0.3,
      r => "An Tagen mit mindestens "+de(median,0)+" Schritten lag deine Stimmung bei "+de(r.a)+", an ruhigeren Tagen bei "+de(r.b)+".");
  }

  // Trinken und Obst/Gemüse → Energie
  add(compare(days,x => d.water.has(x) && d.water.get(x)>=6,x => d.water.has(x) && d.water.get(x)<6,x => W(x,"energy")),0.3,
    r => "An Tagen mit mindestens 6 Gläsern Wasser lag deine Energie im Schnitt bei "+de(r.a)+", sonst bei "+de(r.b)+".");
  add(compare(days,x => d.veg.has(x) && d.veg.get(x)>=5,x => d.veg.has(x) && d.veg.get(x)<5,x => W(x,"energy")),0.3,
    r => "An Tagen mit 5 Portionen Obst und Gemüse lag deine Energie bei "+de(r.a)+", sonst bei "+de(r.b)+".");

  if(!findings.length) {
    box.append(el("p",{class:"muted"},
      "Noch zu wenig Daten für Vergleiche. Sobald du an mindestens 14 Tagen eingetragen hast – zum Beispiel "+
      "den Check-in „Wie geht's dir heute?“ und deinen Schlaf –, zeigt VYORA hier, was dir auffallen könnte. "+
      "Bisher: "+filled+" Check-in"+(filled===1 ? "" : "s")+" in 90 Tagen."));
    return;
  }

  for(const f of findings) {
    const clear = Math.abs(f.a-f.b)>=f.ok;
    box.append(el("div",{class:"link-row"+(clear ? "" : " faint")},
      el("p",{},clear ? f.text(f) : f.text(f)+" Kaum ein Unterschied."),
      el("small",{class:"muted"},f.na+" gegenüber "+f.nb+" Tagen")));
  }
  box.append(el("p",{class:"muted small-note"},
    "Das sind Beobachtungen aus deinen eigenen Einträgen der letzten 90 Tage – Zusammenhänge, keine Ursachen. "+
    "Viele Dinge beeinflussen sich gegenseitig. VYORA bewertet nichts und stellt keine Diagnosen."));
}
