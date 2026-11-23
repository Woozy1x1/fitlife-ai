// VYORA AI – Einführung, Wasser, 5 am Tag, Wohlbefinden und Atemübung
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Einführung beim ersten Start (3 Schritte)
// Ob sie gezeigt wurde, steht im Konto (user_goals.tour_done_at),
// nicht im Browser – so erscheint sie nur einmal.
// -----------------------------------

const TOUR = [
  {icon:"☀️",title:"Willkommen bei VYORA",
   text:"Auf „Heute“ siehst du auf einen Blick deinen Schlaf, deine Tagesziele, Wasser und deine Woche im Vergleich zur Vorwoche."},
  {icon:"✍️",title:"Eintragen geht schnell",
   text:"Unten wechselst du zwischen Ernährung (mit Barcode-Scanner), Training (mit Calisthenics-Programm und Dehnen) und Gesundheit (Blutdruck, Blutzucker, Schlaf, Verläufe)."},
  {icon:"🔗",title:"Tracker & Ziele",
   text:"Unter „Mehr“ verbindest du deinen Oura Ring oder Apple Health und legst deine Tagesziele fest. Alles ist freiwillig – du kannst auch alles selbst eintragen."}
];
let tourStep = 0;

function renderTourStep() {
  const s = TOUR[tourStep];
  $("tourIcon").textContent = s.icon;
  $("tourTitle").textContent = s.title;
  $("tourText").textContent = s.text;
  $("tourDots").replaceChildren(...TOUR.map((_,i) => {
    const dot = document.createElement("i");
    if(i===tourStep) dot.className = "on";
    return dot;
  }));
  const last = tourStep===TOUR.length-1;
  $("tourNext").textContent = last ? "Ziele festlegen" : "Weiter";
  $("tourSkip").textContent = last ? "Los geht’s" : "Überspringen";
}

function openTour() {
  const dialog = $("tourDialog");
  if(!dialog || dialog.open || typeof dialog.showModal!=="function") return;
  tourStep = 0;
  renderTourStep();
  dialog.showModal();
  $("tourNext").focus();
}

async function finishTour(goToGoals) {
  $("tourDialog").close();
  if(goToGoals) $("goGoals").click();
  if(!currentUserId) return;
  try {
    await supabase.from("user_goals").upsert({
      user_id:currentUserId,
      tour_done_at:new Date().toISOString()
    },{onConflict:"user_id"});
  } catch(_error) {}
}

$("tourNext")?.addEventListener("click",() => {
  if(tourStep<TOUR.length-1) { tourStep += 1; renderTourStep(); }
  else finishTour(true);
});
$("tourSkip")?.addEventListener("click",() => finishTour(false));
// Esc schließt die Einführung ebenfalls endgültig
$("tourDialog")?.addEventListener("cancel",event => {
  event.preventDefault();
  finishTour(false);
});

// -----------------------------------
// Wasser: Gläser à 250 ml pro Tag
// Speichern nacheinander (nie zwei gleichzeitig), damit schnelles
// Tippen keine Werte überschreibt.
// -----------------------------------

const WATER_ML = 250;
let waterDay = localDate();
let waterGlasses = 0;
let waterLoadCounter = 0;
let waterSaving = Promise.resolve();

function renderWater() {
  if(!$("goalWaterValue")) return; // ältere Seite ohne Wasser-Ring
  if(waterDay!==localDate()) { waterDay = localDate(); waterGlasses = 0; }
  const goal = userGoals.water_glasses;
  $("goalWaterValue").textContent = String(waterGlasses);
  $("goalWaterText").textContent = goal ? "von "+goal+" Gläsern" : "Gläser Wasser";
  setGoalRing("goalWaterFill",waterGlasses,goal);
  $("waterInfo").textContent = "💧 "+waterGlasses+(waterGlasses===1 ? " Glas" : " Gläser")+" · "+
    (waterGlasses*WATER_ML/1000).toLocaleString("de-DE",{minimumFractionDigits:1,maximumFractionDigits:2})+" l";
  $("waterMinus").disabled = waterGlasses<=0;
}

function resetWater() {
  ++waterLoadCounter;
  waterGlasses = 0;
  waterDay = localDate();
  renderWater();
}

async function loadWater() {
  if(!currentUserId) return;
  const requestId = ++waterLoadCounter;
  const userId = currentUserId;
  const day = localDate();
  const {data,error} = await supabase
    .from("water_log")
    .select("glasses")
    .eq("user_id",userId)
    .eq("day",day)
    .maybeSingle();
  if(requestId!==waterLoadCounter || userId!==currentUserId || error) return;
  waterDay = day;
  waterGlasses = Number(data?.glasses)||0;
  renderWater();
}

function changeWater(step) {
  if(!currentUserId) return;
  if(waterDay!==localDate()) { waterDay = localDate(); waterGlasses = 0; }
  const next = Math.min(40,Math.max(0,waterGlasses+step));
  if(next===waterGlasses) return;
  waterGlasses = next;
  renderWater();
  if(step>0) try { navigator.vibrate && navigator.vibrate(30); } catch(_e) {}

  const userId = currentUserId, day = waterDay, value = next;
  waterSaving = waterSaving.then(async () => {
    try {
      await saveOrQueue("water_log",{
        user_id:userId, day, glasses:value, updated_at:new Date().toISOString()
      },{onConflict:"user_id,day"});
    } catch(error) {
      if(userId===currentUserId) {
        $("homeNutritionInfo").textContent = "Wasser konnte nicht gespeichert werden: "+error.message;
      }
    }
  }).catch(() => {});
}

$("waterPlus")?.addEventListener("click",() => changeWater(1));
$("waterMinus")?.addEventListener("click",() => changeWater(-1));

// -----------------------------------
// "5 am Tag": Portionen Obst & Gemüse (Richtwert DGE)
// -----------------------------------

const VEG_GOAL = 5;
let vegDay = localDate();
let vegPortions = 0;
let vegLoadCounter = 0;
let vegSaving = Promise.resolve();

function renderVeg() {
  if(!$("vegInfo")) return;
  if(vegDay!==localDate()) { vegDay = localDate(); vegPortions = 0; }
  $("vegInfo").textContent = "🥦 "+vegPortions+"/"+VEG_GOAL+" Obst & Gemüse"+(vegPortions>=VEG_GOAL ? " ✓" : "");
  $("vegInfo").setAttribute("aria-label",vegPortions+" von "+VEG_GOAL+" Portionen Obst und Gemüse heute");
  $("vegMinus").disabled = vegPortions<=0;
}

function resetVeg() {
  ++vegLoadCounter;
  vegPortions = 0;
  vegDay = localDate();
  renderVeg();
}

async function loadVeg() {
  if(!currentUserId || !$("vegInfo")) return;
  const requestId = ++vegLoadCounter;
  const userId = currentUserId;
  const day = localDate();
  const {data,error} = await supabase
    .from("veg_log")
    .select("portions")
    .eq("user_id",userId)
    .eq("day",day)
    .maybeSingle();
  if(requestId!==vegLoadCounter || userId!==currentUserId || error) return;
  vegDay = day;
  vegPortions = Number(data?.portions)||0;
  renderVeg();
}

function changeVeg(step) {
  if(!currentUserId) return;
  if(vegDay!==localDate()) { vegDay = localDate(); vegPortions = 0; }
  const next = Math.min(20,Math.max(0,vegPortions+step));
  if(next===vegPortions) return;
  vegPortions = next;
  renderVeg();
  if(step>0) try { navigator.vibrate && navigator.vibrate(30); } catch(_e) {}
  const userId = currentUserId, day = vegDay, value = next;
  vegSaving = vegSaving.then(async () => {
    try {
      await saveOrQueue("veg_log",{
        user_id:userId, day, portions:value, updated_at:new Date().toISOString()
      },{onConflict:"user_id,day"});
    } catch(error) {
      if(userId===currentUserId) {
        $("homeNutritionInfo").textContent = "Obst & Gemüse konnte nicht gespeichert werden: "+error.message;
      }
    }
  }).catch(() => {});
}

$("vegPlus")?.addEventListener("click",() => changeVeg(1));
$("vegMinus")?.addEventListener("click",() => changeVeg(-1));

// -----------------------------------
// Wohlbefinden-Tagebuch (Stimmung, Energie, Stress)
// Nur Selbstbeobachtung – keine Bewertung, keine Diagnose.
// -----------------------------------

const MOOD_EMOJI = ["","😣","🙁","😐","🙂","😄"];
let wellRows = new Map();
let wellLoadCounter = 0;

function wellMessage(text) { if($("wellMessage")) $("wellMessage").textContent = text || ""; }

function setRadio(name,value) {
  document.querySelectorAll('input[name="'+name+'"]').forEach(i => { i.checked = value!=null && i.value===String(value); });
}
function readRadio(name) {
  const v = document.querySelector('input[name="'+name+'"]:checked')?.value;
  return v ? Number(v) : null;
}

function renderWellbeing() {
  if(!$("wellForm")) return;
  const today = wellRows.get(localDate());
  setRadio("wellMood",today?.mood);
  setRadio("wellEnergy",today?.energy);
  setRadio("wellStress",today?.stress);
  $("wellNote").value = today?.note || "";
  const week = $("wellWeek");
  week.replaceChildren();
  for(let i=6;i>=0;i--) {
    const day = daysAgo(i);
    const row = wellRows.get(day);
    const cell = document.createElement("div");
    const face = document.createElement("span");
    face.textContent = row?.mood ? MOOD_EMOJI[row.mood] : "·";
    const label = document.createElement("small");
    label.textContent = i===0 ? "heute" : new Date(day+"T12:00:00").toLocaleDateString("de-DE",{weekday:"short"});
    cell.title = row?.mood ? "Stimmung "+row.mood+" von 5" : "kein Check-in";
    cell.append(face,label);
    week.append(cell);
  }
}

function resetWellbeing() {
  ++wellLoadCounter;
  wellRows = new Map();
  wellMessage("");
  renderWellbeing();
}

async function loadWellbeing() {
  if(!currentUserId || !$("wellForm")) return;
  const requestId = ++wellLoadCounter;
  const userId = currentUserId;
  const {data,error} = await supabase
    .from("wellbeing_log")
    .select("day,mood,energy,stress,note")
    .eq("user_id",userId)
    .gte("day",daysAgo(6))
    .order("day",{ascending:true});
  if(requestId!==wellLoadCounter || userId!==currentUserId || error) return;
  wellRows = new Map((data||[]).map(r => [r.day,r]));
  renderWellbeing();
}

$("wellForm")?.addEventListener("submit",async event => {
  event.preventDefault();
  if(!currentUserId) return;
  const row = {
    user_id:currentUserId,
    day:localDate(),
    mood:readRadio("wellMood"),
    energy:readRadio("wellEnergy"),
    stress:readRadio("wellStress"),
    note:$("wellNote").value.trim().slice(0,500) || null,
    updated_at:new Date().toISOString()
  };
  if(row.mood==null && row.energy==null && row.stress==null && !row.note) {
    wellMessage("Wähl mindestens einen Wert aus oder schreib eine Notiz.");
    return;
  }
  const button = $("wellSave");
  button.disabled = true;
  try {
    const {queued} = await saveOrQueue("wellbeing_log",row,{onConflict:"user_id,day"});
    wellRows.set(row.day,row);
    renderWellbeing();
    wellMessage(queued ? "✓ Vorgemerkt – wird übertragen, sobald du wieder online bist." : "✓ Check-in gespeichert.");
  } catch(error) {
    wellMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});

// -----------------------------------
// Atemübung: 4 s ein, 6 s aus (ca. 6 Atemzüge pro Minute)
// Läuft nur im Browser, speichert nichts.
// -----------------------------------

const BREATH_IN = 4, BREATH_OUT = 6;
let breathTimer = null;

function stopBreathing(done=false) {
  if(breathTimer) clearInterval(breathTimer);
  breathTimer = null;
  if(!$("breathStart")) return;
  $("breathCircle").classList.remove("in");
  $("breathText").textContent = done ? "Fertig – gut gemacht." : "Bereit?";
  $("breathTime").textContent = "";
  $("breathStart").textContent = done ? "Noch einmal" : "Starten";
}

function startBreathing() {
  const minutes = Number(document.querySelector('input[name="breathMin"]:checked')?.value) || 3;
  const total = minutes*60;
  const started = Date.now();
  let phase = "";
  $("breathStart").textContent = "Beenden";
  const tick = () => {
    const elapsed = (Date.now()-started)/1000;
    if(elapsed>=total) { stopBreathing(true); return; }
    const inCycle = elapsed % (BREATH_IN+BREATH_OUT);
    const next = inCycle<BREATH_IN ? "in" : "out";
    if(next!==phase) {
      phase = next;
      const circle = $("breathCircle");
      circle.style.transitionDuration = (next==="in" ? BREATH_IN : BREATH_OUT)+"s";
      circle.classList.toggle("in",next==="in");
      $("breathText").textContent = next==="in" ? "Einatmen …" : "Ausatmen …";
    }
    const left = Math.ceil(total-elapsed);
    $("breathTime").textContent = "noch "+Math.floor(left/60)+":"+String(left%60).padStart(2,"0");
  };
  tick();
  breathTimer = setInterval(tick,250);
}

$("breathStart")?.addEventListener("click",() => {
  if(breathTimer) stopBreathing(false); else startBreathing();
});

$("goGoals").addEventListener("click",() => {
  switchView("moreView");
  setTimeout(() => {
    $("goalsCard").scrollIntoView({behavior:"smooth",block:"start"});
    $("goalKcalInput").focus({preventScroll:true});
  },50);
});

renderGoals();
