// VYORA AI – Wochenrückblick, Verläufe, Tagesziele und Bedarfsrechner
// Teil 7 von 18. Alle Teile teilen sich einen gemeinsamen Bereich
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

// -----------------------------------
// Tagesziele
// -----------------------------------

let userGoals = {kcal:null,protein_g:null,steps:null,water_glasses:null};
let todayTotals = {calories:0,protein:0};
let todaySteps = null;
let goalsLoadCounter = 0;
const GOAL_CIRCLE = 169.65;

function goalsMessage(text) {
  $("goalsMessage").textContent = text || "";
}

function setGoalRing(fillId,value,goal) {
  const fill = $(fillId);
  const share = goal ? Math.min(1,Math.max(0,value/goal)) : 0;
  fill.style.strokeDashoffset =
    String(GOAL_CIRCLE*(1-share));
  fill.closest(".goal").classList.toggle(
    "done",
    !!goal && value>=goal
  );
}

function wholeNumber(value) {
  return Math.round(Number(value)||0)
    .toLocaleString("de-DE");
}

function renderGoals() {
  const g = userGoals;
  renderWater();

  $("homeCalories").textContent =
    wholeNumber(todayTotals.calories);
  $("goalKcalText").textContent = g.kcal
    ? "von "+wholeNumber(g.kcal)+" kcal"
    : "kcal";
  setGoalRing("goalKcalFill",todayTotals.calories,g.kcal);

  $("goalProteinValue").textContent =
    wholeNumber(todayTotals.protein);
  $("goalProteinText").textContent = g.protein_g
    ? "von "+wholeNumber(g.protein_g)+" g Eiweiß"
    : "g Eiweiß";
  setGoalRing("goalProteinFill",todayTotals.protein,g.protein_g);

  const hasSteps = todaySteps!==null;
  $("goalStepsValue").textContent = hasSteps
    ? (todaySteps>=10000
        ? (Math.floor(todaySteps/100)/10).toLocaleString("de-DE")+"k"
        : wholeNumber(todaySteps))
    : "–";
  $("goalStepsText").textContent = g.steps
    ? "von "+wholeNumber(g.steps)+" Schritten"
    : hasSteps ? "Schritte" : "Schritte (Tracker)";
  setGoalRing("goalStepsFill",hasSteps ? todaySteps : 0,g.steps);
}

function fillGoalsForm() {
  if($("goalWaterInput")) $("goalWaterInput").value = userGoals.water_glasses ?? "";
  $("goalKcalInput").value = userGoals.kcal ?? "";
  $("goalProteinInput").value = userGoals.protein_g ?? "";
  $("goalStepsInput").value = userGoals.steps ?? "";
}

// -----------------------------------
// Bedarf automatisch berechnen
// Grundumsatz: Mifflin-St Jeor; Gesamtbedarf: × PAL (DGE);
// Eiweiß: 1,6 g/kg (Morton et al. 2018). Nur Schätzung, keine Diagnose.
// -----------------------------------

let calcProfile = null;   // gespeicherte Angaben aus user_goals
let autoGoalsBusy = false;

function calcMessage(text) { if($("calcMessage")) $("calcMessage").textContent = text || ""; }

function calcNeeds({sex,age,height,weight,pal,goal}) {
  const sexTerm = sex==="m" ? 5 : sex==="f" ? -161 : -78;
  const bmr = 10*weight + 6.25*height - 5*age + sexTerm;
  const tdee = bmr*pal;
  let target = tdee;
  if(goal==="lose") target = Math.max(bmr, tdee - Math.min(500, tdee*0.2));
  if(goal==="gain") target = tdee + Math.min(350, tdee*0.1);
  // Eiweiß bei starkem Übergewicht auf Normalgewicht (BMI 25) beziehen
  const bmi = weight/((height/100)**2);
  const refWeight = bmi>=30 ? 25*(height/100)**2 : weight;
  const protein = 1.6*refWeight;
  const round10 = v => Math.round(v/10)*10;
  const round5 = v => Math.round(v/5)*5;
  return {
    bmr:round10(bmr),
    tdee:round10(tdee),
    kcal:Math.min(6000,Math.max(800,round10(target))),
    protein_g:Math.min(400,Math.max(10,round5(protein)))
  };
}

function latestWeightKg() {
  const w = typeof latestWith==="function" ? latestWith("weight_kg") : null;
  return w ? Number(w.weight_kg) : null;
}

function renderCalcResult(r,profile,auto=false) {
  const box = $("calcResult");
  if(!box) return;
  box.replaceChildren();
  const rows = [
    ["Grundumsatz", wholeNumber(r.bmr)+" kcal"],
    ["Tagesbedarf", wholeNumber(r.tdee)+" kcal"],
    [profile.goal==="lose" ? "Ziel (abnehmen)" : profile.goal==="gain" ? "Ziel (aufbauen)" : "Ziel (halten)",
      wholeNumber(r.kcal)+" kcal"],
    ["Eiweiß", wholeNumber(r.protein_g)+" g"]
  ];
  rows.forEach(([label,value]) => {
    const row = document.createElement("div");
    row.className = "calc-row";
    const a = document.createElement("span"); a.textContent = label;
    const b = document.createElement("strong"); b.textContent = value;
    row.append(a,b);
    box.append(row);
  });
  const note = document.createElement("p");
  note.className = "muted small-note";
  note.textContent = (auto ? "Automatisch angepasst" : "Berechnet")+
    " mit "+String(profile.weight).replace(".",",")+" kg. Schätzung ±10 % – prüf nach 2–3 Wochen deinen Verlauf.";
  box.append(note);
  box.classList.remove("hidden");
}

function fillCalcForm() {
  if(!$("calcForm")) return;
  const p = calcProfile || {};
  $("calcSex").value = p.sex || "";
  $("calcBirthYear").value = p.birth_year ?? "";
  $("calcHeight").value = p.height ?? "";
  $("calcPal").value = p.pal ? Number(p.pal).toFixed(1) : "1.4";
  if(!$("calcPal").value) $("calcPal").value = "1.4";
  $("calcGoal").value = p.goal || "keep";
  const latest = latestWeightKg();
  $("calcWeight").value = latest ?? p.weight ?? "";
}

function readCalcForm() {
  const sex = $("calcSex").value;
  if(!["m","f","x"].includes(sex)) throw new Error("Bitte wähle die Formel (Mann, Frau oder Mittelwert).");
  const year = Number($("calcBirthYear").value);
  const thisYear = new Date().getFullYear();
  if(!Number.isInteger(year) || year<1900 || year>thisYear) throw new Error("Bitte ein gültiges Geburtsjahr eingeben.");
  const age = thisYear - year;
  if(age<18) throw new Error("Die Berechnung ist für Erwachsene ab 18 gedacht. Bitte lass dir deinen Bedarf ärztlich oder von einer Ernährungsfachkraft einschätzen.");
  const height = Number($("calcHeight").value);
  if(!(height>=120 && height<=230)) throw new Error("Größe bitte zwischen 120 und 230 cm.");
  const weight = Math.round(Number(String($("calcWeight").value).replace(",","."))*10)/10;
  if(!(weight>=30 && weight<=300)) throw new Error("Gewicht bitte zwischen 30 und 300 kg.");
  const pal = Number($("calcPal").value);
  if(!(pal>=1.2 && pal<=2.4)) throw new Error("Bitte deine Aktivität wählen.");
  const goal = $("calcGoal").value;
  if(!["lose","keep","gain"].includes(goal)) throw new Error("Bitte ein Ziel wählen.");
  return {sex,birth_year:year,age,height,weight,pal,goal};
}

async function saveCalcGoals(profile,result) {
  const {error} = await supabase.from("user_goals").upsert({
    user_id:currentUserId,
    kcal:result.kcal,
    protein_g:result.protein_g,
    calc_sex:profile.sex,
    calc_birth_year:profile.birth_year,
    calc_height_cm:profile.height,
    calc_pal:profile.pal,
    calc_goal:profile.goal,
    calc_weight_kg:profile.weight,
    auto_goals:true,
    updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(error) throw error;
  calcProfile = {...profile, auto:true};
  userGoals = {...userGoals, kcal:result.kcal, protein_g:result.protein_g};
  fillGoalsForm();
  renderGoals();
}

$("calcForm")?.addEventListener("submit",async event => {
  event.preventDefault();
  if(!currentUserId) return;
  const button = $("calcSave");
  button.disabled = true;
  try {
    const profile = readCalcForm();
    const result = calcNeeds(profile);
    calcMessage("Wird gespeichert ...");
    await saveCalcGoals(profile,result);
    renderCalcResult(result,profile);
    calcMessage("✓ Als Tagesziel übernommen. Bei neuem Gewicht rechnet VYORA automatisch neu.");
  } catch(error) {
    calcMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

// Richtwerte (Schritte 7.000, Wasser 6 Gläser) ins Formular übernehmen
$("goalsUseGuide")?.addEventListener("click",() => {
  $("goalStepsInput").value = 7000;
  if($("goalWaterInput")) $("goalWaterInput").value = 6;
  goalsMessage("Schritte 7.000 und 6 Gläser Wasser eingetragen – tippe auf „Ziele speichern“.");
});

// Neu rechnen, wenn ein neueres Gewicht da ist oder ein neues Lebensjahr begonnen hat
async function maybeAutoGoals() {
  const p = calcProfile;
  if(!currentUserId || !p?.auto || autoGoalsBusy) return;
  if(!p.sex || !p.birth_year || !p.height || !p.pal || !p.goal) return;
  const latest = latestWeightKg();
  const weight = latest ?? p.weight;
  if(!weight) return;
  const age = new Date().getFullYear() - p.birth_year;
  if(age<18) return;
  const profile = {...p, weight, age};
  const result = calcNeeds(profile);
  if(result.kcal===userGoals.kcal && result.protein_g===userGoals.protein_g &&
     Number(weight)===Number(p.weight)) return;
  autoGoalsBusy = true;
  try {
    await saveCalcGoals(profile,result);
    if($("calcWeight")) $("calcWeight").value = weight;
    renderCalcResult(result,profile,true);
  } catch(_error) {
    // still: beim nächsten Laden erneut versuchen
  } finally {
    autoGoalsBusy = false;
  }
}

async function loadGoals() {
  if(!currentUserId) return;
  const requestId = ++goalsLoadCounter;
  const userId = currentUserId;

  try {
    const {data,error} = await supabase
      .from("user_goals")
      .select("kcal,protein_g,steps,water_glasses,tour_done_at,bp_per_day,glucose_per_day,insulin_per_day,glucose_unit,calc_sex,calc_birth_year,calc_height_cm,calc_pal,calc_goal,calc_weight_kg,auto_goals")
      .eq("user_id",userId)
      .maybeSingle();

    if(requestId!==goalsLoadCounter || userId!==currentUserId) return;
    if(error) throw error;

    userGoals = {
      kcal:data?.kcal ?? null,
      protein_g:data?.protein_g ?? null,
      steps:data?.steps ?? null,
      water_glasses:data?.water_glasses ?? null
    };
    checkSettings = {
      bp:Number(data?.bp_per_day)||0,
      glucose:Number(data?.glucose_per_day)||0,
      insulin:Number(data?.insulin_per_day)||0,
      unit:data?.glucose_unit==="mmol_l" ? "mmol_l" : "mg_dl"
    };
    calcProfile = data?.calc_sex ? {
      sex:data.calc_sex, birth_year:data.calc_birth_year, height:data.calc_height_cm,
      pal:Number(data.calc_pal), goal:data.calc_goal,
      weight:data.calc_weight_kg==null ? null : Number(data.calc_weight_kg),
      auto:data.auto_goals===true
    } : null;
    fillGoalsForm();
    fillCalcForm();
    renderGoals();
    maybeAutoGoals();
    if(!data?.tour_done_at) openTour();
    fillCheckForm();
    renderChecklist();
    renderMeasureList();
  } catch(error) {
    if(requestId===goalsLoadCounter) {
      goalsMessage("Ziele konnten nicht geladen werden: "+error.message);
    }
  }
}

function readGoal(id,min,max,label) {
  const raw = $(id).value.trim();
  if(raw==="") return null;
  const value = Math.round(Number(raw));
  if(!Number.isFinite(value) || value<min || value>max) {
    throw new Error(
      label+" muss zwischen "+min.toLocaleString("de-DE")+
      " und "+max.toLocaleString("de-DE")+" liegen."
    );
  }
  return value;
}

$("goalsForm").addEventListener("submit",async event => {
  event.preventDefault();
  if(!currentUserId) return;

  const button = $("saveGoals");
  button.disabled = true;

  try {
    const goals = {
      kcal:readGoal("goalKcalInput",800,6000,"Kalorien"),
      protein_g:readGoal("goalProteinInput",10,400,"Eiweiß"),
      steps:readGoal("goalStepsInput",1000,50000,"Schritte"),
      water_glasses:$("goalWaterInput") ? readGoal("goalWaterInput",1,20,"Wasser") : userGoals.water_glasses
    };

    goalsMessage("Ziele werden gespeichert ...");

    const manualChange = goals.kcal!==userGoals.kcal || goals.protein_g!==userGoals.protein_g;
    const keepAuto = !!calcProfile?.auto && !manualChange;

    const {error} = await supabase
      .from("user_goals")
      .upsert({
        user_id:currentUserId,
        ...goals,
        auto_goals:keepAuto,
        updated_at:new Date().toISOString()
      },{onConflict:"user_id"});

    if(error) throw error;

    userGoals = goals;
    if(calcProfile) calcProfile.auto = keepAuto;
    renderGoals();
    goalsMessage(calcProfile && !keepAuto && manualChange
      ? "✓ Ziele gespeichert. Die automatische Berechnung ist jetzt aus – du kannst sie oben wieder einschalten."
      : "✓ Ziele gespeichert.");
  } catch(error) {
    goalsMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});
