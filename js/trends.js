// VYORA AI – Zusammenhänge, Tagesansicht, Erholung und Tipp des Tages
//
// Alles hier ist beschreibend: Vergleiche aus deinen eigenen Einträgen,
// keine Ursachen, keine Bewertung, keine Diagnose. Allgemeine Tipps sind
// als solche gekennzeichnet und nennen ihre Quelle.

let VY = null;
let db = null;
let $ = null;

const state = {data:null,load:0,dayLoad:0,tab:"links"};

function el(tag,props={},...children) {
  const node = document.createElement(tag);
  for(const [key,value] of Object.entries(props||{})) {
    if(value==null || value===false) continue;
    if(key==="class") node.className = value;
    else if(key.startsWith("on")) node.addEventListener(key.slice(2),value);
    else node.setAttribute(key,value===true ? "" : value);
  }
  for(const child of children.flat()) {
    if(child==null || child===false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const de = (n,d=1) => Number(n).toLocaleString("de-DE",{maximumFractionDigits:d});
const avg = list => list.length ? list.reduce((a,b) => a+b,0)/list.length : null;
const hm = min => Math.floor(min/60)+":"+String(Math.round(min%60)).padStart(2,"0")+" h";

function addDays(day,n) {
  const d = new Date(day+"T12:00:00");
  d.setDate(d.getDate()+n);
  return VY.dayString(d);
}

function fmtDate(day) {
  const d = new Date(day+"T12:00:00");
  return d.toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"});
}

export function init(api) {
  VY = api;
  db = api.supabase;
  $ = api.$;

  setupTabs();
  setupDayView();

  VY.on("user",() => { state.data = null; setTimeout(loadAll,1500); });
  VY.on("reset",resetAll);
  VY.on("refresh",() => { renderRecovery(); renderTip(); });
  VY.on("training",() => setTimeout(renderRecoverySoon,500));
  if(VY.uid) setTimeout(loadAll,1500);
}

function resetAll() {
  state.data = null;
  state.load++; state.dayLoad++;
  for(const id of ["linksBox","dayBox","recoveryBox","tipBox"]) $(id)?.replaceChildren();
}

// -----------------------------------
// Daten (letzte 90 Tage)
// -----------------------------------

async function loadAll() {
  const uid = VY.uid;
  if(!uid) return;
  const id = ++state.load;
  const since = VY.daysAgo(89);
  const q = p => p.then(r => r.error ? [] : (r.data||[])).catch(() => []);
  const [metrics,well,workouts,water,veg] = await Promise.all([
    q(db.from("daily_metrics").select("day,source,sleep_minutes,steps,resting_hr").eq("user_id",uid).gte("day",since).limit(1000)),
    q(db.from("wellbeing_log").select("day,mood,energy,stress").eq("user_id",uid).gte("day",since).limit(400)),
    q(db.from("workout_entries").select("entry_date").eq("user_id",uid).gte("entry_date",since).limit(5000)),
    q(db.from("water_log").select("day,glasses").eq("user_id",uid).gte("day",since).limit(400)),
    q(db.from("veg_log").select("day,portions").eq("user_id",uid).gte("day",since).limit(400))
  ]);
  if(id!==state.load || uid!==VY.uid) return;

  // Schlaf und Schritte: eigene Einträge, Apple Health und (falls verbunden) Oura
  const sleep = new Map(), steps = new Map(), rhr = new Map();
  for(const m of metrics) {
    if(m.sleep_minutes!=null && (!sleep.has(m.day) || m.source==="apple_health")) sleep.set(m.day,Number(m.sleep_minutes));
    if(m.steps!=null) steps.set(m.day,Number(m.steps));
    if(m.resting_hr!=null) rhr.set(m.day,Number(m.resting_hr));
  }
  for(const [d,v] of VY.sleepMinutesByDay()) sleep.set(d,v);
  for(const [d,v] of VY.stepsByDay()) steps.set(d,v);

  state.data = {
    sleep,steps,rhr,
    well:new Map(well.map(w => [w.day,w])),
    train:new Set(workouts.map(w => w.entry_date)),
    water:new Map(water.map(w => [w.day,Number(w.glasses)||0])),
    veg:new Map(veg.map(v => [v.day,Number(v.portions)||0]))
  };
  renderLinks();
  renderRecovery();
  renderTip();
}

// -----------------------------------
// Zusammenhänge
// -----------------------------------

function setupTabs() {
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

function renderLinks() {
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

// -----------------------------------
// Tagesansicht
// -----------------------------------

function setupDayView() {
  const input = $("dayViewDate");
  if(!input) return;
  input.value = VY.localDate();
  input.max = VY.localDate();
  input.addEventListener("change",loadDay);
  $("dayPrev")?.addEventListener("click",() => { input.value = addDays(input.value||VY.localDate(),-1); loadDay(); });
  $("dayNext")?.addEventListener("click",() => {
    const next = addDays(input.value||VY.localDate(),1);
    if(next<=VY.localDate()) { input.value = next; loadDay(); }
  });
}

const MEALS = {breakfast:"Frühstück",lunch:"Mittagessen",dinner:"Abendessen",snack:"Snack"};
const MOOD = ["","😣","🙁","😐","🙂","😄"];

async function loadDay() {
  const uid = VY.uid;
  const box = $("dayBox");
  if(!uid || !box) return;
  const day = $("dayViewDate").value || VY.localDate();
  const id = ++state.dayLoad;
  box.replaceChildren(el("p",{class:"muted"},"Wird geladen ..."));
  const from = new Date(day+"T00:00:00"), to = new Date(day+"T00:00:00");
  to.setDate(to.getDate()+1);
  const q = p => p.then(r => r.error ? [] : (r.data||[])).catch(() => []);
  const [food,water,veg,train,meas,meds,intakes,sym,well,metr] = await Promise.all([
    q(db.from("nutrition_entries").select("meal_type,food_name,calories,protein,fiber_g").eq("user_id",uid).eq("entry_date",day).limit(200)),
    q(db.from("water_log").select("glasses").eq("user_id",uid).eq("day",day)),
    q(db.from("veg_log").select("portions").eq("user_id",uid).eq("day",day)),
    q(db.from("workout_entries").select("exercise,sets,reps,weight_kg").eq("user_id",uid).eq("entry_date",day).limit(200)),
    q(db.from("measurements").select("kind,measured_at,systolic,diastolic,pulse,glucose_mg_dl,insulin_units")
      .eq("user_id",uid).gte("measured_at",from.toISOString()).lt("measured_at",to.toISOString()).limit(200)),
    q(db.from("medications").select("id,name").eq("user_id",uid)),
    q(db.from("medication_intakes").select("medication_id,slot,taken_at").eq("user_id",uid).eq("day",day)),
    q(db.from("symptom_log").select("symptom,intensity,note").eq("user_id",uid).eq("day",day)),
    q(db.from("wellbeing_log").select("mood,energy,stress,note").eq("user_id",uid).eq("day",day)),
    q(db.from("daily_metrics").select("source,sleep_minutes,steps").eq("user_id",uid).eq("day",day))
  ]);
  if(id!==state.dayLoad || uid!==VY.uid) return;
  box.replaceChildren();

  const section = (icon,title,lines) => {
    if(!lines.length) return;
    box.append(el("div",{class:"day-sec"},
      el("h3",{},icon+" "+title),
      el("ul",{},lines.map(l => el("li",{},l)))));
  };

  const w = well[0];
  section("🌿","Befinden",w ? [
    "Stimmung "+MOOD[w.mood||0]+" · Energie "+(w.energy ?? "–")+"/5 · Stress "+(w.stress ?? "–")+"/5",
    w.note || null].filter(Boolean) : []);

  const sleepMin = VY.sleepMinutesByDay().get(day) ?? metr.find(m => m.sleep_minutes!=null)?.sleep_minutes;
  const stepsN = VY.stepsByDay().get(day) ?? metr.find(m => m.steps!=null)?.steps;
  section("😴","Schlaf & Bewegung",[
    sleepMin!=null ? "Schlaf in der Nacht zum "+new Date(day+"T12:00:00").toLocaleDateString("de-DE")+": "+hm(Number(sleepMin)) : null,
    stepsN!=null ? de(stepsN,0)+" Schritte" : null].filter(Boolean));

  if(food.length) {
    const kcal = food.reduce((a,f) => a+Number(f.calories||0),0);
    const prot = food.reduce((a,f) => a+Number(f.protein||0),0);
    section("🥗","Ernährung · "+de(kcal,0)+" kcal · "+de(prot,0)+" g Eiweiß",
      food.map(f => (MEALS[f.meal_type]||"")+": "+f.food_name+" · "+de(f.calories,0)+" kcal"));
  }
  const glasses = water[0]?.glasses, portions = veg[0]?.portions;
  section("💧","Trinken & Obst/Gemüse",[
    glasses!=null ? glasses+" Gläser Wasser" : null,
    portions!=null ? portions+" Portionen Obst & Gemüse" : null].filter(Boolean));

  section("🏋️","Training",train.map(t => t.exercise+(t.sets ? " · "+t.sets+"×"+(t.reps ?? "–") : "")+
    (Number(t.weight_kg) ? " · "+de(t.weight_kg)+" kg" : "")));

  const clock = iso => new Date(iso).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
  const unit = VY.glucoseUnit==="mmol_l";
  section("🩺","Messungen",meas.sort((a,b) => a.measured_at.localeCompare(b.measured_at)).map(m =>
    clock(m.measured_at)+" · "+(m.kind==="bp" ? "Blutdruck "+m.systolic+"/"+m.diastolic+(m.pulse ? " · Puls "+m.pulse : "") :
      m.kind==="glucose" ? "Blutzucker "+(unit ? de(m.glucose_mg_dl/18.0182) +" mmol/l" : de(m.glucose_mg_dl,0)+" mg/dl") :
      "Insulin "+de(m.insulin_units)+" IE")));

  const medName = idm => meds.find(m => m.id===idm)?.name || "Medikament";
  section("💊","Medikamente abgehakt",intakes.sort((a,b) => String(a.slot).localeCompare(String(b.slot)))
    .map(i => String(i.slot).slice(0,5)+" · "+medName(i.medication_id)));

  section("📝","Symptome",sym.map(s => s.symptom+" · Stärke "+s.intensity+"/10"+(s.note ? " · "+s.note : "")));

  if(!box.children.length) box.append(el("p",{class:"muted"},"Für "+fmtDate(day)+" gibt es keine Einträge."));
  else box.prepend(el("p",{class:"muted"},fmtDate(day)));
}

// -----------------------------------
// Erholung heute (Training)
// -----------------------------------

let recoveryTimer = null;
function renderRecoverySoon() {
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(renderRecovery,800);
}

function renderRecovery() {
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

// -----------------------------------
// Tipp des Tages (Heute)
// -----------------------------------

const TIPS = [
  {k:"move",t:"150 bis 300 Minuten mäßige Bewegung pro Woche – etwa zügiges Gehen – empfiehlt die WHO Erwachsenen. Auch kurze Einheiten zählen.",s:"WHO-Bewegungsempfehlungen 2020"},
  {k:"strength",t:"An mindestens 2 Tagen pro Woche Muskeln kräftigen – das empfiehlt die WHO zusätzlich zur Ausdauerbewegung.",s:"WHO-Bewegungsempfehlungen 2020"},
  {k:"sit",t:"Lange Sitzzeiten regelmäßig unterbrechen: aufstehen, ein paar Schritte gehen, dehnen.",s:"WHO-Bewegungsempfehlungen 2020"},
  {k:"veg",t:"5 Portionen Obst und Gemüse am Tag – zum Beispiel 3 Portionen Gemüse und 2 Portionen Obst.",s:"DGE: Gut essen und trinken (2024)"},
  {k:"water",t:"Wasser oder ungesüßter Tee sind die besten Durstlöscher. Etwa 1,5 Liter am Tag sind eine gute Orientierung, bei Hitze und Sport mehr.",s:"DGE: Gut essen und trinken (2024)"},
  {k:"fiber",t:"Mindestens 30 g Ballaststoffe am Tag – zum Beispiel aus Vollkorn, Hülsenfrüchten, Gemüse, Obst und Nüssen.",s:"DGE-Referenzwerte"},
  {k:"legumes",t:"Hülsenfrüchte wie Linsen, Bohnen oder Kichererbsen einmal pro Woche oder öfter: viel Eiweiß und Ballaststoffe.",s:"DGE: Gut essen und trinken (2024)"},
  {k:"sleep",t:"Erwachsenen wird empfohlen, regelmäßig mindestens 7 Stunden zu schlafen. Feste Zeiten – auch am Wochenende – helfen dem inneren Rhythmus.",s:"American Academy of Sleep Medicine / Sleep Research Society"},
  {k:"screen",t:"Eine ruhige Stunde vor dem Schlafen ohne helle Bildschirme kann das Einschlafen erleichtern.",s:"Deutsche Gesellschaft für Schlafforschung und Schlafmedizin"},
  {k:"protein",t:"Eiweiß über den Tag verteilt (z. B. zu jeder Mahlzeit) unterstützt den Muskelaufbau beim Krafttraining.",s:"International Society of Sports Nutrition"},
  {k:"breath",t:"Langsames Atmen – etwa 6 Atemzüge pro Minute – hilft vielen, zur Ruhe zu kommen. Probier die Atemübung unter „Gesundheit“.",s:"allgemeine Entspannungsempfehlung"},
  {k:"sugar",t:"Zuckergesüßte Getränke möglichst selten – Wasser ist die beste Wahl.",s:"DGE: Gut essen und trinken (2024)"},
  {k:"outdoor",t:"Tageslicht am Morgen hilft dem Schlaf-Wach-Rhythmus. Ein kurzer Spaziergang nach dem Aufstehen reicht oft schon.",s:"Deutsche Gesellschaft für Schlafforschung und Schlafmedizin"}
];

function pickTip() {
  const d = state.data;
  const today = VY.localDate();
  const yesterday = addDays(today,-1);
  const hour = new Date().getHours();
  // Passend zum Tag, wenn sich etwas anbietet – sonst täglich wechselnd
  if(d) {
    if((d.water.get(today) ?? 0)<3 && hour>=14) return TIPS.find(t => t.k==="water");
    if((d.veg.get(yesterday) ?? 5)<3) return TIPS.find(t => t.k==="veg");
    const s = d.sleep.get(today);
    if(s!=null && s<420) return TIPS.find(t => t.k==="sleep");
    const stepsY = d.steps.get(yesterday);
    if(stepsY!=null && stepsY<5000) return TIPS.find(t => t.k==="move");
  }
  const n = Math.floor(new Date(today+"T12:00:00").getTime()/864e5);
  return TIPS[n%TIPS.length];
}

function renderTip() {
  const box = $("tipBox");
  if(!box || !VY.uid) return;
  const tip = pickTip();
  box.replaceChildren(
    el("p",{},tip.t),
    el("small",{class:"muted"},"Allgemeiner Tipp · Quelle: "+tip.s));
}
