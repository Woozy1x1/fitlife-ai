// VYORA AI – Grundlagen: Verbindung zu Supabase, Hilfsfunktionen, Navigation
// Teil 1 von 18. Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// Die Supabase-Bibliothek lädt 00-supabase.js (fest im Repository, Version fixiert).
const createClient = globalThis.__vyoraCreateClient;
delete globalThis.__vyoraCreateClient;

const SUPABASE_URL =
  "https://uukjvrmxrxbhueqarjpp.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_PsUKAdDVjsQ3MAmCAFqKvg_1lo8yljP";

const OURA_FUNCTION =
  SUPABASE_URL + "/functions/v1/oura-connect";

const FOOD_FUNCTION =
  SUPABASE_URL + "/functions/v1/food-search";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = id => document.getElementById(id);

let currentUserId = null;
let refreshCounter = 0;
let sleepData = [];
let nutritionData = [];
let loadingSleep = false;
let ouraConnected = false;
let appleConnected = false;

// Symbol und Name passend zum verbundenen Gerät:
// Oura Ring 💍, Apple Watch ⌚, beide, oder noch keins.
function trackerIdentity() {
  if(ouraConnected && appleConnected) {
    return {icon:"💍⌚",title:"Deine Tracker",name:"Oura Ring",short:"vom Oura Ring"};
  }
  if(ouraConnected) {
    return {icon:"💍",title:"Dein Oura Ring",name:"Oura Ring",short:"vom Oura Ring"};
  }
  if(appleConnected) {
    return {icon:"⌚",title:"Deine Apple Watch",name:"Apple Watch",short:"aus Apple Health"};
  }
  return {icon:"🔗",title:"Tracker verbinden",name:"Tracker",short:"vom Tracker"};
}

function renderTrackerIdentity() {
  const t = trackerIdentity();
  $("trackerTitle").textContent = t.icon+" "+t.title;
  $("trackerCardTitle").textContent = (ouraConnected ? "💍" : t.icon)+" Heute auf einen Blick";
  $("trackerWorkoutTitle").textContent = (ouraConnected ? "💍 Vom Oura Ring" : t.icon+" Vom Tracker")+" erkannte Workouts";

  // Woher kommt der Schlafwert auf der Startseite?
  const manualOnly = !ouraConnected && typeof latestSleepMetric==="function" &&
    latestSleepMetric()?.source==="manual";
  $("miniSleepSrc").textContent = sleepData.length
    ? "vom Oura Ring"
    : manualOnly ? "selbst eingetragen" : t.short;

  if(!ouraConnected) {
    $("ouraDot").classList.toggle("connected",appleConnected);
    $("ouraStatus").textContent = appleConnected
      ? "✓ Apple Health verbunden (per Kurzbefehl)"
      : "Noch kein Tracker verbunden";
  } else if(appleConnected) {
    $("ouraStatus").textContent = "✓ Oura Ring und Apple Health verbunden";
  }
}
let lastTrackerLoad = 0;
let selectedFood = null;
let foodSearchCounter = 0;
let nutritionLoadCounter = 0;
let workoutData = [];
let healthData = [];
let workoutLoadCounter = 0;
let healthLoadCounter = 0;
let lastTimeCounter = 0;

const DEFAULT_EXERCISES = [
  "Liegestütze","Klimmzüge","Dips","Kniebeugen",
  "Ausfallschritte","Plank (Sekunden)","Australian Pull-ups",
  "Pike Push-ups","Beinheben","Bankdrücken","Kreuzheben",
  "Schulterdrücken","Rudern","Bizepscurls","Laufen (Minuten)"
];

const mealNames = {
  breakfast:"Frühstück",
  lunch:"Mittagessen",
  dinner:"Abendessen",
  snack:"Snack"
};

// Schichtarbeit: Der Tag kann erst um 1–6 Uhr beginnen (Einstellung in „Mehr“).
let dayStartHour = Math.min(6,Math.max(0,
  Math.round(Number(localStorage.getItem("vyora_day_start"))||0)));

function shiftedNow() {
  return new Date(Date.now()-dayStartHour*3600000);
}

function localDate() {
  const d = shiftedNow();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

$("nutritionDate").value = localDate();
$("trainingDate").value = localDate();
$("healthDate").value = localDate();

function message(text) {
  $("message").textContent = text || "";
}

function nutritionMessage(text) {
  $("nutritionMessage").textContent = text || "";
}

function ouraMessage(text) {
  $("ouraMessage").textContent = text || "";
}

function foodMessage(text) {
  $("foodSearchMessage").textContent = text || "";
}

function switchView(id) {
  // Kamera aus, wenn die Ernährung verlassen wird.
  if(id!=="nutritionView") {
    try { stopScanner(); } catch(_error) {}
  }

  document.querySelectorAll(".view").forEach(view => {
    view.classList.toggle("active",view.id===id);
  });

  document.querySelectorAll(".bottom-nav button")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.view===id
      );
    });

  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll(".bottom-nav button")
  .forEach(button => {
    button.addEventListener("click",() => {
      switchView(button.dataset.view);
    });
  });

$("goNutrition").addEventListener("click",() => {
  switchView("nutritionView");
});

function setConnected(connected) {
  ouraConnected = connected;
  $("ouraDot").classList.toggle("connected",connected);

  $("ouraStatus").textContent = connected
    ? "✓ Oura Ring verbunden"
    : "Noch kein Tracker verbunden";

  $("ouraButton").classList.remove("hidden");

  $("ouraButton").textContent = connected
    ? "Erneut verbinden"
    : "Oura Ring verbinden";

  $("sleepButton").classList.toggle(
    "hidden",
    !connected
  );
  renderTrackerIdentity();
}

async function authenticatedRequest(action) {
  const {data,error} =
    await supabase.auth.getSession();

  if(error || !data.session) {
    throw new Error("Bitte erneut anmelden.");
  }

  const response = await fetch(
    OURA_FUNCTION+"?action="+encodeURIComponent(action),
    {
      method:"POST",
      headers:{
        Authorization:
          "Bearer "+data.session.access_token,
        apikey:SUPABASE_KEY,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({})
    }
  );

  const result = await response.json();

  if(!response.ok) {
    throw new Error(
      result.error || "HTTP "+response.status
    );
  }

  return result;
}

function formatDate(day) {
  if(!day) return "–";

  const d = new Date(day+"T12:00:00");

  return isNaN(d.getTime())
    ? day
    : d.toLocaleDateString("de-DE",{
        day:"2-digit",
        month:"short"
      });
}

function renderChart(id) {
  const box = $(id);
  box.replaceChildren();

  if(!sleepData.length) {
    box.textContent =
      "Noch keine Schlafdaten verfügbar.";
    return;
  }

  sleepData.slice(-7).forEach(item => {
    const column = document.createElement("div");
    column.className = "chart-column";

    const value = document.createElement("span");
    value.className = "chart-value";
    value.textContent = item.score;

    const track = document.createElement("div");
    track.className = "chart-track";

    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height = item.score+"%";
    track.append(bar);

    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = formatDate(item.day);

    column.append(value,track,label);
    box.append(column);
  });
}

function renderSleep() {
  renderChart("homeChart");
  renderChart("sleepChart");

  const list = $("sleepList");
  list.replaceChildren();

  sleepData.slice().reverse().forEach(item => {
    const row = document.createElement("div");
    row.className = "meal-row";

    const date = document.createElement("span");
    date.textContent = formatDate(item.day);

    const score = document.createElement("strong");
    score.textContent = item.score;

    row.append(date,score);
    list.append(row);
  });

  if(!sleepData.length) {
    list.textContent =
      "Keine Schlafscores für die letzten 7 Tage.";

    $("mainScore").textContent = "–";
    $("miniSleep").textContent = "–";
    $("scoreDate").textContent = "Letzte Messung";
    $("scoreRating").textContent = "Noch keine Daten";
    setScoreVisual(null);
    renderSleepFallback();
    return;
  }

  $("scoreLabel").textContent = "Schlafscore";
  $("scoreSource").textContent =
    "Dein zuletzt erfasster Schlafscore vom Oura Ring.";
  renderTrackerIdentity();

  const latest = sleepData[sleepData.length-1];

  $("mainScore").textContent = latest.score;
  $("miniSleep").textContent = latest.score;
  $("scoreDate").textContent = formatDate(latest.day);

  $("scoreRating").textContent =
    latest.score>=85 ? "Sehr gut" :
    latest.score>=70 ? "Gut erholt" :
    latest.score>=60 ? "Ausbaufähig" :
    "Erholung beachten";

  setScoreVisual(latest.score);
}

// Ring und "Sonne" auf der Startseite.
function setScoreVisual(score) {
  const value = Number.isFinite(Number(score))
    ? Math.max(0,Math.min(100,Number(score)))
    : 0;
  $("scoreCircle").style.strokeDashoffset =
    452.39*(1-value/100);
  $("heroCard").style.setProperty("--score",String(value));
}

async function loadSleep(quiet=false) {
  if(loadingSleep) return;

  loadingSleep = true;
  const userId = currentUserId;

  $("sleepButton").disabled = true;
  if(!quiet) ouraMessage("Schlafdaten werden geladen ...");

  try {
    const result = await authenticatedRequest("daily");

    if(currentUserId!==userId) return;

    sleepData = (
      Array.isArray(result.data) ? result.data : []
    )
      .filter(x =>
        typeof x.day==="string" &&
        x.score!==null &&
        x.score!==undefined &&
        Number.isFinite(Number(x.score)) &&
        Number(x.score)>=0 &&
        Number(x.score)<=100
      )
      .map(x => ({
        day:x.day,
        score:Number(x.score),
        contributors:
          x.contributors && typeof x.contributors==="object"
            ? x.contributors : null
      }))
      .sort((a,b) => a.day.localeCompare(b.day));

    renderSleep();
    lastTrackerLoad = Date.now();
    ouraMessage("✓ Aktualisiert um "+
      new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})+" Uhr.");

    // Detaildaten erst NACH "daily" laden (nicht gleichzeitig),
    // damit sich zwei Token-Erneuerungen nicht in die Quere kommen.
    await loadTrackerDetails(userId);

  } catch(e) {
    if(currentUserId===userId) {
      ouraMessage("Fehler: "+e.message);
    }
  } finally {
    loadingSleep = false;
    $("sleepButton").disabled = false;
  }
}

function number(value) {
  return Number(value||0).toLocaleString(
    "de-DE",
    {maximumFractionDigits:1}
  );
}

function renderNutrition() {
  const sum = field => nutritionData.reduce(
    (total,item) =>
      total+Number(item[field]||0),
    0
  );

  $("totalCalories").textContent =
    number(sum("calories"));

  $("totalProtein").textContent =
    number(sum("protein"));

  $("totalCarbs").textContent =
    number(sum("carbs"));

  $("totalFat").textContent =
    number(sum("fat"));

  if($("fiberInfo")) {
    const known = nutritionData.filter(item => item.fiber_g!=null);
    const missing = nutritionData.length-known.length;
    $("fiberInfo").textContent = !nutritionData.length ? "" :
      "🌾 Ballaststoffe: "+number(sum("fiber_g"))+" g"+
      (missing ? " (bei "+missing+(missing===1 ? " Eintrag" : " Einträgen")+" unbekannt)" : "")+
      " · Orientierung für Erwachsene (DGE): mindestens 30 g am Tag.";
  }

  if($("nutritionDate").value===localDate()) {
    todayTotals = {
      calories:sum("calories"),
      protein:sum("protein")
    };
    renderGoals();

    $("homeNutritionInfo").textContent =
      nutritionData.length+
      " Mahlzeit(en) heute eingetragen.";
  }

  const list = $("nutritionList");
  list.replaceChildren();

  if(!nutritionData.length) {
    list.textContent =
      "Für dieses Datum sind noch keine Mahlzeiten gespeichert.";
    return;
  }

  nutritionData.forEach(item => {
    const row = document.createElement("div");
    row.className = "meal-row";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.food_name;

    const details = document.createElement("small");
    details.textContent =
      mealNames[item.meal_type]+" · "+
      number(item.calories)+" kcal · "+
      "E "+number(item.protein)+" g · "+
      "KH "+number(item.carbs)+" g · "+
      "F "+number(item.fat)+" g";

    info.append(title,details);

    const del = document.createElement("button");
    del.textContent = "Löschen";
    del.setAttribute(
      "aria-label",
      "Mahlzeit löschen: "+item.food_name
    );

    del.addEventListener("click",() => {
      deleteMeal(item.id);
    });

    const again = document.createElement("button");
    again.type = "button";
    again.textContent = "Nochmal";
    again.classList.add("soft-btn");
    again.setAttribute(
      "aria-label",
      "Mahlzeit erneut eintragen: "+item.food_name
    );
    again.addEventListener("click",() => {
      repeatMeal(item);
    });

    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.append(again,del);

    row.append(info,actions);
    list.append(row);
  });
}

// Übernimmt eine gespeicherte Mahlzeit ins
// Formular. Die Menge steht im Namen, z. B.
// "Skyr (250 g)". Dann lassen sich die Werte
// beim Ändern der Menge neu umrechnen.
function repeatMeal(item) {
  const match = String(item.food_name||"")
    .match(/^(.*) \(([\d.,]+) g\)$/);

  const name = match
    ? match[1]
    : String(item.food_name||"");

  const amount = match
    ? Number(match[2].replace(/\./g,"").replace(",","."))
    : NaN;

  $("mealType").value = item.meal_type;

  if(Number.isFinite(amount) && amount>0) {
    const per100 = field =>
      Math.round(
        Number(item[field]||0)*100/amount*100
      )/100;

    selectedFood = {
      name,
      brand:"",
      code:"",
      calories:per100("calories"),
      protein:per100("protein"),
      carbs:per100("carbs"),
      fat:per100("fat"),
      fiber:item.fiber_g==null ? null : per100("fiber_g")
    };

    $("foodName").value = name;
    $("foodAmount").value = String(amount);
    calculateSelectedFood();

    $("selectedFoodInfo").textContent =
      "↻ Übernommen: "+name+
      ". Ändere bei Bedarf die Menge – die Nährwerte werden umgerechnet.";
  } else {
    selectedFood = null;
    $("foodName").value = name;
    $("foodAmount").value = "100";
    ["calories","protein","carbs","fat"].forEach(field => {
      $(field).value = String(Number(item[field]||0));
    });
    if($("fiber")) $("fiber").value = item.fiber_g==null ? "" : String(Number(item.fiber_g));
    $("selectedFoodInfo").textContent =
      "↻ Übernommen: "+name+". Bitte Werte prüfen.";
  }

  $("nutritionForm").scrollIntoView({
    behavior:"smooth",
    block:"start"
  });
}
