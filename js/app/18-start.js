// VYORA AI – Automatisch aktualisieren, Passwort, App-Installation, Erweiterungen
// Teil 18 von 18. Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Automatisch aktualisieren
// Beim Zurückkehren in die App (z. B. als installierte App im
// Hintergrund) und alle 15 Minuten, solange sie sichtbar ist.
// Höchstens alle 3 Minuten, damit Oura nicht unnötig abgefragt wird.
// -----------------------------------

const AUTO_MIN_GAP = 3*60*1000;
const AUTO_INTERVAL = 15*60*1000;
let autoDay = localDate();
let autoBusy = false;

function appReady() {
  return !!currentUserId && consentConfirmedFor===currentUserId;
}

async function autoRefresh() {
  if(document.hidden || autoBusy || !appReady()) return;

  // Über Mitternacht offen geblieben: alles für den neuen Tag laden,
  // aber nicht, während gerade etwas eingetippt oder gedehnt wird.
  if(localDate()!==autoDay) {
    const typing = document.activeElement &&
      /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if(!typing && !stretchTimer && !scanStream) {
      location.reload();
      return;
    }
  }

  flushQueue();
  if(Date.now()-lastTrackerLoad < AUTO_MIN_GAP) return;

  autoBusy = true;
  try {
    lastTrackerLoad = Date.now();
    loadWater();
    loadVeg();
    scheduleInsights();
    vyEmit("refresh");
    await loadMetrics();
    if(ouraConnected) await loadSleep(true);
  } catch(_error) {
    // still: der nächste Versuch kommt beim nächsten Öffnen
  } finally {
    autoBusy = false;
  }
}

document.addEventListener("visibilitychange",() => {
  if(document.visibilityState==="visible") autoRefresh();
});
window.addEventListener("pageshow",event => {
  if(event.persisted) autoRefresh();
});
window.addEventListener("online",autoRefresh);
setInterval(autoRefresh,AUTO_INTERVAL);

$("loginForm").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const {error} =
      await supabase.auth.signInWithPassword({
        email:$("email").value.trim(),
        password:$("password").value
      });

    if(error) {
      return message(
        "Anmeldung fehlgeschlagen: "+
        error.message
      );
    }

    message("");
    await refreshUI();
  }
);

$("registerButton").addEventListener(
  "click",
  async () => {
    const email =
      $("email").value.trim();

    const password =
      $("password").value;

    if(!email || password.length<6) {
      return message(
        "Bitte E-Mail und Passwort mit mindestens 6 Zeichen eingeben."
      );
    }

    const {error} =
      await supabase.auth.signUp({
        email,
        password,
        options:{
          emailRedirectTo:
            "https://woozy1x1.github.io/fitlife-ai/"
        }
      });

    message(
      error
        ? "Registrierung fehlgeschlagen: "+
          error.message
        : "Registrierung gestartet. Bitte prüfe deine E-Mails."
    );

    await refreshUI();
  }
);

$("logoutButton").addEventListener(
  "click",
  async () => {
    const {error} =
      await supabase.auth.signOut();

    if(error) {
      return message(error.message);
    }

    currentUserId = null;
    nutritionData = [];
    sleepData = [];
    ++nutritionLoadCounter;
    ++foodSearchCounter;
    resetTrainingAndHealth();
    resetTrackerAndPlans();

    message("Erfolgreich abgemeldet.");
    await refreshUI();
  }
);

$("ouraButton").addEventListener(
  "click",
  async () => {
    const button = $("ouraButton");
    button.disabled = true;

    try {
      const result =
        await authenticatedRequest("start");

      const target =
        result.url ||
        result.authorization_url;

      if(!target) {
        throw new Error(
          "Keine Weiterleitungsadresse erhalten."
        );
      }

      const url = new URL(target);

      if(
        url.protocol!=="https:" ||
        url.hostname!=="cloud.ouraring.com"
      ) {
        throw new Error(
          "Unerwartete Oura-Adresse."
        );
      }

      location.assign(url.href);

    } catch(error) {
      ouraMessage(error.message);
    } finally {
      button.disabled = false;
    }
  }
);

$("sleepButton").addEventListener(
  "click",
  loadSleep
);

const hour = new Date().getHours();

$("greeting").textContent =
  hour<11 ? "Morgen" :
  hour<18 ? "Tag" :
  "Abend";

supabase.auth.onAuthStateChange(event => {
  // Link aus der "Passwort vergessen"-E-Mail geöffnet
  if(event==="PASSWORD_RECOVERY") {
    $("resetCard").classList.remove("hidden");
    window.scrollTo({top:0});
  }
  setTimeout(refreshUI,0);
});

// -----------------------------------
// Passwort vergessen / neues Passwort
// -----------------------------------

$("forgotButton").addEventListener("click",async () => {
  const email = $("email").value.trim();
  if(!email) {
    message("Bitte zuerst deine E-Mail-Adresse oben eintragen.");
    $("email").focus();
    return;
  }

  $("forgotButton").disabled = true;
  const {error} = await supabase.auth.resetPasswordForEmail(email,{
    redirectTo:APP_URL
  });
  $("forgotButton").disabled = false;

  // Aus Datenschutzgründen nicht verraten, ob es das Konto gibt.
  message(error && error.status===429
    ? "Zu viele Anfragen. Bitte warte ein paar Minuten."
    : "Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link zum Zurücksetzen geschickt. Schau auch im Spam-Ordner nach.");
});

$("resetForm").addEventListener("submit",async event => {
  event.preventDefault();
  const pw = $("newPassword").value;
  const msg = text => { $("resetMessage").textContent = text; };

  if(pw.length<8) return msg("Bitte mindestens 8 Zeichen verwenden.");
  if(pw!==$("newPassword2").value) return msg("Die Passwörter stimmen nicht überein.");

  $("resetSave").disabled = true;
  const {error} = await supabase.auth.updateUser({password:pw});
  $("resetSave").disabled = false;

  if(error) return msg("Speichern fehlgeschlagen: "+error.message);

  $("resetForm").reset();
  msg("");
  $("resetCard").classList.add("hidden");
  message("✓ Neues Passwort gespeichert.");
});

refreshUI();

// -----------------------------------
// App-Installation (PWA)
// Der Service Worker speichert nur App-Dateien
// (keine persönlichen Daten), damit VYORA schnell
// startet und auch bei schlechtem Netz öffnet.
// -----------------------------------

let installPrompt = null;

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone===true;

function setupInstallCard() {
  if(isStandalone()) {
    $("installCard").classList.add("hidden");
    return;
  }

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);

  if(installPrompt) {
    $("installButton").classList.remove("hidden");
    $("installCard").classList.remove("hidden");
  } else if(ios) {
    $("installText").textContent =
      "So legst du VYORA auf deinen Startbildschirm: In Safari unten auf "+
      "„Teilen“ tippen (Quadrat mit Pfeil) und dann "+
      "„Zum Home-Bildschirm“ wählen.";
    $("installCard").classList.remove("hidden");
  }
}

window.addEventListener("beforeinstallprompt",event => {
  event.preventDefault();
  installPrompt = event;
  setupInstallCard();
});

window.addEventListener("appinstalled",() => {
  installPrompt = null;
  $("installCard").classList.add("hidden");
});

$("installButton").addEventListener("click",async () => {
  if(!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  $("installButton").classList.add("hidden");
  await prompt.prompt();
  setupInstallCard();
});

setupInstallCard();

if(
  "serviceWorker" in navigator &&
  location.protocol==="https:"
) {
  navigator.serviceWorker
    .register("./sw.js",{scope:"./"})
    .catch(() => {});
}

// -----------------------------------
// Erweiterungs-Module (js/plus.js)
// Neue Funktionen liegen in eigenen Dateien. Sie bekommen über VY
// gezielt Zugriff auf die App und werden über Ereignisse informiert
// ("user", "reset", "refresh", "training", "measures").
// -----------------------------------

function vyEmit(name,detail) {
  for(const fn of (vyEmit.hooks?.[name]||[])) {
    try { fn(detail); } catch(error) { console.error("VYORA-Modul",name,error); }
  }
}

const VY = {
  supabase,
  $,
  get uid() { return currentUserId; },
  get dayStartHour() { return dayStartHour; },
  setDayStartHour(h) {
    dayStartHour = Math.min(6,Math.max(0,Math.round(Number(h))||0));
    try { localStorage.setItem("vyora_day_start",String(dayStartHour)); } catch(_e) {}
  },
  localDate,
  daysAgo,
  dayString,
  saveOrQueue,
  switchView,
  get workoutData() { return workoutData; },
  get healthData() { return healthData; },
  get metricsData() { return metricsData; },
  get measureData() { return measureData; },
  get trackerData() { return trackerData; },
  get glucoseUnit() { return checkSettings?.unit==="mmol_l" ? "mmol_l" : "mg_dl"; },
  get goals() { return userGoals; },
  sleepMinutesByDay,
  stepsByDay,
  get nutritionDate() { return $("nutritionDate")?.value || localDate(); },
  reloadNutrition: () => loadNutrition(),
  searchFoods: async query => (await fetchFoodProducts(query)).map(normalizeFood).filter(Boolean),
  on(name,fn) {
    vyEmit.hooks = vyEmit.hooks || {};
    (vyEmit.hooks[name] = vyEmit.hooks[name] || []).push(fn);
  },
  refresh: () => refreshUI()
};

// Startwerte erst setzen, wenn alle Teile geladen sind
$("measureTime").value = nowForInput();
setTimeout(openViewFromHash,0);

import("../plus.js?v=5c720a4a41")
  .then(mod => mod.init(VY))
  .catch(error => console.error("VYORA-Erweiterung konnte nicht geladen werden",error));
