// VYORA AI – Wochenrückblick und Verläufe
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Wochenrückblick & Verläufe
// Nur beschreibend: Durchschnitt, Anzahl, Verlauf.
// Keine Grenzwerte, keine Bewertung (siehe MDR-Hinweis).
// -----------------------------------

let insights = {workouts:[],nutrition:[],health:[],measures:[]};
let insightsTimer = null;
let insightsCounter = 0;
let trendKey = "weight";
let trendDays = 30;

const TREND_DEFS = {
  weight:{label:"Gewicht"},
  bp:{label:"Blutdruck"},
  pulse:{label:"Puls"},
  glucose:{label:"Blutzucker"},
  sleep:{label:"Schlaf"}
};

function daysAgo(n) {
  const d = shiftedNow();
  d.setHours(12,0,0,0);
  d.setDate(d.getDate()-n);
  return dayString(d);
}

function resetInsights() {
  insights = {workouts:[],nutrition:[],health:[],measures:[]};
  ++insightsCounter;
  clearTimeout(insightsTimer);
  renderInsights();
}

function scheduleInsights() {
  clearTimeout(insightsTimer);
  insightsTimer = setTimeout(loadInsights,600);
}

async function loadInsights() {
  if(!currentUserId) return;
  const requestId = ++insightsCounter;
  const userId = currentUserId;
  const since14 = daysAgo(13);
  const since90 = daysAgo(89);
  const since90ts = new Date(since90+"T00:00:00").toISOString();

  try {
    const [w,n,h,m] = await Promise.all([
      supabase.from("workout_entries").select("entry_date,notes")
        .eq("user_id",userId).gte("entry_date",since14).limit(1000),
      supabase.from("nutrition_entries").select("entry_date,calories")
        .eq("user_id",userId).gte("entry_date",since14).limit(1500),
      supabase.from("health_entries").select("entry_date,weight_kg,systolic,diastolic,pulse,created_at")
        .eq("user_id",userId).gte("entry_date",since90).limit(600),
      supabase.from("measurements").select("kind,measured_at,systolic,diastolic,pulse,glucose_mg_dl")
        .eq("user_id",userId).in("kind",["bp","glucose"]).gte("measured_at",since90ts)
        .order("measured_at",{ascending:true}).limit(2000)
    ]);
    if(requestId!==insightsCounter || userId!==currentUserId) return;
    for(const r of [w,n,h,m]) if(r.error) throw r.error;
    insights = {
      workouts:w.data||[],
      nutrition:n.data||[],
      health:h.data||[],
      measures:m.data||[]
    };
    renderInsights();
  } catch(_error) {
    // Rückblick ist ein Extra – bei Fehlern bleibt der letzte Stand stehen.
  }
}

function renderInsights() {
  renderWeek();
  renderTrend();
}

// --- Wochenrückblick ---

function avg(values) {
  const v = values.filter(x => Number.isFinite(x));
  return v.length ? v.reduce((a,b) => a+b,0)/v.length : null;
}

function inWindow(day,from,to) { return day>=from && day<=to; }

// Schlafdauer in Minuten je Tag: Oura (Hauptschlaf), sonst Apple/selbst eingetragen
function sleepMinutesByDay() {
  const map = new Map();
  (metricsData||[]).forEach(m => {
    if(m.sleep_minutes==null) return;
    if(!map.has(m.day) || m.source==="apple_health") map.set(m.day,Number(m.sleep_minutes));
  });
  (trackerData?.sleep||[]).forEach(s => {
    const sec = Number(s.total_sleep_duration);
    if(!s.day || !Number.isFinite(sec)) return;
    const prev = map.get("oura:"+s.day)||0;
    map.set("oura:"+s.day,prev+sec/60);
  });
  // Oura hat Vorrang, wenn vorhanden
  for(const [k,v] of [...map]) {
    if(k.startsWith("oura:")) { map.set(k.slice(5),v); map.delete(k); }
  }
  return map;
}

function stepsByDay() {
  const map = new Map();
  (metricsData||[]).forEach(m => {
    if(m.steps!=null && m.source==="apple_health") map.set(m.day,Number(m.steps));
  });
  (trackerData?.activity||[]).forEach(a => {
    if(a.day && Number.isFinite(Number(a.steps))) map.set(a.day,Number(a.steps));
  });
  return map;
}

function deltaText(now,before,format,unit="") {
  if(now==null || before==null) return before==null && now!=null ? "Vorwoche: keine Daten" : "";
  const diff = now-before;
  if(Math.abs(diff)<1e-9) return "wie Vorwoche";
  return (diff>0 ? "▲ +" : "▼ −")+format(Math.abs(diff))+unit+" vs. Vorwoche";
}

function renderWeek() {
  if(!$("weekCard")) return;
  const curFrom = daysAgo(6), curTo = localDate();
  const prevFrom = daysAgo(13), prevTo = daysAgo(7);
  const hm = v => Math.floor(v/60)+":"+String(Math.round(v%60)).padStart(2,"0")+" h";
  const de = v => Math.round(v).toLocaleString("de-DE");

  // Schlaf
  const sleep = sleepMinutesByDay();
  const sl = (a,b) => avg([...sleep].filter(([d]) => inWindow(d,a,b)).map(([,v]) => v));
  const s1 = sl(curFrom,curTo), s0 = sl(prevFrom,prevTo);
  $("wkSleep").textContent = s1==null ? "–" : hm(s1);
  $("wkSleepDelta").textContent = deltaText(s1,s0,v => Math.round(v)+" min");

  // Training: Tage mit mindestens einem Eintrag
  const tdays = (a,b) => new Set(insights.workouts
    .filter(x => inWindow(x.entry_date,a,b)).map(x => x.entry_date)).size;
  const t1 = tdays(curFrom,curTo), t0 = tdays(prevFrom,prevTo);
  $("wkTrain").textContent = t1+" / 7";
  $("wkTrainDelta").textContent = t1===t0
    ? "wie Vorwoche"
    : (t1>t0 ? "▲ +" : "▼ −")+Math.abs(t1-t0)+" vs. Vorwoche";

  // Kalorien: Ø der Tage mit Einträgen
  const kc = (a,b) => {
    const per = new Map();
    insights.nutrition.filter(x => inWindow(x.entry_date,a,b)).forEach(x =>
      per.set(x.entry_date,(per.get(x.entry_date)||0)+(Number(x.calories)||0)));
    return per.size ? avg([...per.values()]) : null;
  };
  const k1 = kc(curFrom,curTo), k0 = kc(prevFrom,prevTo);
  $("wkKcal").textContent = k1==null ? "–" : de(k1);
  $("wkKcalDelta").textContent = deltaText(k1,k0,de," kcal");

  // Schritte
  const steps = stepsByDay();
  const st = (a,b) => avg([...steps].filter(([d]) => inWindow(d,a,b)).map(([,v]) => v));
  const p1 = st(curFrom,curTo), p0 = st(prevFrom,prevTo);
  $("wkSteps").textContent = p1==null ? "–" : de(p1);
  $("wkStepsDelta").textContent = deltaText(p1,p0,de);
}

// --- Verläufe (eigenes SVG, keine fremde Bibliothek) ---

function trendSeries(key) {
  const fromDay = daysAgo(trendDays-1);
  const t = (iso) => new Date(iso).getTime();
  const noon = d => new Date(d+"T12:00:00").getTime();
  const s1 = [], s2 = [];

  if(key==="weight") {
    insights.health.filter(h => h.weight_kg!=null && h.entry_date>=fromDay)
      .forEach(h => s1.push([noon(h.entry_date),Number(h.weight_kg)]));
    return {s1,s2,unit:"kg",l1:"Gewicht",fmt:v => v.toLocaleString("de-DE",{maximumFractionDigits:1})};
  }
  if(key==="bp" || key==="pulse") {
    insights.measures.filter(m => m.kind==="bp" && m.measured_at>=fromDay).forEach(m => {
      if(key==="bp" && m.systolic!=null) { s1.push([t(m.measured_at),m.systolic]); s2.push([t(m.measured_at),m.diastolic]); }
      if(key==="pulse" && m.pulse!=null) s1.push([t(m.measured_at),m.pulse]);
    });
    insights.health.filter(h => h.entry_date>=fromDay).forEach(h => {
      if(key==="bp" && h.systolic!=null) { s1.push([noon(h.entry_date),h.systolic]); s2.push([noon(h.entry_date),h.diastolic]); }
      if(key==="pulse" && h.pulse!=null) s1.push([noon(h.entry_date),h.pulse]);
    });
    return key==="bp"
      ? {s1,s2,unit:"mmHg",l1:"oberer Wert",l2:"unterer Wert",fmt:v => String(Math.round(v))}
      : {s1,s2,unit:"/min",l1:"Puls",fmt:v => String(Math.round(v))};
  }
  if(key==="glucose") {
    const mmol = checkSettings.unit==="mmol_l";
    insights.measures.filter(m => m.kind==="glucose" && m.glucose_mg_dl!=null && m.measured_at>=fromDay)
      .forEach(m => s1.push([t(m.measured_at),mmol ? Number(m.glucose_mg_dl)/MMOL_FACTOR : Number(m.glucose_mg_dl)]));
    return {s1,s2,unit:mmol ? "mmol/l" : "mg/dl",l1:"Blutzucker",
      fmt:v => mmol ? v.toLocaleString("de-DE",{maximumFractionDigits:1}) : String(Math.round(v))};
  }
  // Schlafdauer
  [...sleepMinutesByDay()].filter(([d]) => d>=fromDay)
    .forEach(([d,v]) => s1.push([noon(d),v/60]));
  return {s1,s2,unit:"h",l1:"Schlafdauer",fmt:v => v.toLocaleString("de-DE",{maximumFractionDigits:1})};
}

function svgEl(name,attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg",name);
  for(const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
  return el;
}

function renderTrend() {
  if(!$("trendCard")) return;
  const pick = $("trendPick");
  if(!pick.children.length) {
    Object.entries(TREND_DEFS).forEach(([key,def]) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio"; input.name = "trendPick"; input.value = key;
      input.checked = key===trendKey;
      input.addEventListener("change",() => { trendKey = key; renderTrend(); });
      const span = document.createElement("span");
      span.textContent = def.label; span.style.padding = "10px 14px";
      label.append(input,span); pick.append(label);
    });
    [[30,"30 Tage"],[90,"90 Tage"]].forEach(([days,text]) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio"; input.name = "trendRange"; input.value = String(days);
      input.checked = days===trendDays;
      input.addEventListener("change",() => { trendDays = days; renderTrend(); });
      const span = document.createElement("span");
      span.textContent = text; span.style.padding = "8px 14px";
      label.append(input,span); $("trendRange").append(label);
    });
  }

  const box = $("trendBox");
  box.replaceChildren();
  const s = trendSeries(trendKey);
  const sortT = a => a.sort((x,y) => x[0]-y[0]);
  sortT(s.s1); sortT(s.s2);

  if(s.s1.length<2) {
    $("trendInfo").textContent = s.s1.length===1
      ? "Erst ein Wert in diesem Zeitraum – ab zwei Werten erscheint der Verlauf."
      : "Noch keine Werte in diesem Zeitraum.";
    return;
  }

  const W = 320, Hh = 170, L = 34, R = 8, T = 10, B = 22;
  const t1 = Date.now(), t0 = t1-trendDays*86400000;
  const all = [...s.s1,...s.s2].map(p => p[1]);
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = Math.max((hi-lo)*0.12,hi*0.02,1);
  lo -= pad; hi += pad;
  const x = tt => L+(Math.min(Math.max(tt,t0),t1)-t0)/(t1-t0)*(W-L-R);
  const y = v => T+(1-(v-lo)/(hi-lo))*(Hh-T-B);

  const svg = svgEl("svg",{viewBox:"0 0 "+W+" "+Hh,class:"trend-chart",role:"img"});
  for(let i=0;i<=3;i++) {
    const v = lo+(hi-lo)*i/3, yy = y(v);
    svg.append(svgEl("line",{x1:L,x2:W-R,y1:yy,y2:yy,class:"grid"}));
    const tx = svgEl("text",{x:L-4,y:yy+3,"text-anchor":"end"});
    tx.textContent = s.fmt(v); svg.append(tx);
  }
  const dlabel = ms => new Date(ms).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
  [[t0,"start"],[t1,"end"]].forEach(([tt,anchor]) => {
    const tx = svgEl("text",{x:anchor==="start" ? L : W-R,y:Hh-6,"text-anchor":anchor});
    tx.textContent = dlabel(tt); svg.append(tx);
  });

  [[s.s1,"l1","d1"],[s.s2,"l2","d2"]].forEach(([pts,lc,dc]) => {
    if(!pts.length) return;
    svg.append(svgEl("polyline",{points:pts.map(p => x(p[0]).toFixed(1)+","+y(p[1]).toFixed(1)).join(" "),class:lc}));
    if(pts.length<=60) pts.forEach(p => svg.append(svgEl("circle",{cx:x(p[0]).toFixed(1),cy:y(p[1]).toFixed(1),r:2.6,class:dc})));
  });

  const a1 = avg(s.s1.map(p => p[1])), a2 = avg(s.s2.map(p => p[1]));
  const last = s.s1[s.s1.length-1];
  const summary = s.s2.length
    ? "Ø "+s.fmt(a1)+"/"+s.fmt(a2)+" "+s.unit+" · "+s.s1.length+" Werte · zuletzt "+s.fmt(last[1])+"/"+s.fmt(s.s2[s.s2.length-1][1])
    : "Ø "+s.fmt(a1)+" "+s.unit+" · "+s.s1.length+" Werte · zuletzt "+s.fmt(last[1])+" "+s.unit;
  svg.setAttribute("aria-label",TREND_DEFS[trendKey].label+", letzte "+trendDays+" Tage. "+summary);
  box.append(svg);

  if(s.s2.length) {
    const leg = document.createElement("div");
    leg.className = "trend-legend";
    const a = document.createElement("span"); a.innerHTML = "<i></i>"; a.append(s.l1);
    const b = document.createElement("span"); b.innerHTML = '<i class="b"></i>'; b.append(s.l2);
    leg.append(a,b); box.append(leg);
  }
  $("trendInfo").textContent = summary;
}
