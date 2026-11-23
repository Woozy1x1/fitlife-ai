// VYORA AI – Grundlagen: Verbindung zu Supabase, Hilfsfunktionen, Navigation
// Alle Teile teilen sich einen gemeinsamen Bereich
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
// Oura Ring (Ring-Symbol), Apple Watch (Uhr), beide, oder noch keins.
function trackerIdentity() {
  if(ouraConnected && appleConnected) {
    return {icon:"ring",title:"Deine Tracker",name:"Oura Ring",short:"vom Oura Ring"};
  }
  if(ouraConnected) {
    return {icon:"ring",title:"Dein Oura Ring",name:"Oura Ring",short:"vom Oura Ring"};
  }
  if(appleConnected) {
    return {icon:"watch",title:"Deine Apple Watch",name:"Apple Watch",short:"aus Apple Health"};
  }
  return {icon:"link",title:"Tracker verbinden",name:"Tracker",short:"vom Tracker"};
}

// Setzt Text und Symbol einer Überschrift (<h2><svg class="ico">…</svg><span id>…</span>)
function setTitleWithIcon(id,icon,text) {
  const span = $(id);
  span.textContent = text;
  span.previousElementSibling?.querySelector("use")?.setAttribute("href","#i-"+icon);
}

function renderTrackerIdentity() {
  const t = trackerIdentity();
  setTitleWithIcon("trackerTitle",t.icon,t.title);
  setTitleWithIcon("trackerCardTitle",ouraConnected ? "ring" : t.icon,"Heute auf einen Blick");
  setTitleWithIcon("trackerWorkoutTitle",ouraConnected ? "ring" : t.icon,
    (ouraConnected ? "Vom Oura Ring" : "Vom Tracker")+" erkannte Workouts");

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

// Schichtdienst: Während eines Nachtdienstes (und kurz danach) zählt alles
// noch zum Tag, an dem der Dienst begonnen hat. Die Zeitfenster berechnet
// js/shift.js aus dem Dienstplan und legt sie auf diesem Gerät ab.
function nightShiftDay() {
  try {
    const list = JSON.parse(localStorage.getItem("vyora_night_days") || "[]");
    const now = Date.now();
    for(const w of Array.isArray(list) ? list : []) {
      if(w && now>=w.from && now<w.until && /^\d{4}-\d{2}-\d{2}$/.test(w.day)) return w.day;
    }
  } catch(_e) {}
  return null;
}

function shiftedNow() {
  const night = nightShiftDay();
  if(night) return new Date(night+"T23:00:00");
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
