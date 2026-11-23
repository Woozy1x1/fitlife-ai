// VYORA AI – Schlaf selbst eintragen
// Teil 3 von 18. Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Tageswerte ohne Oura: Schlaf selbst eintragen
// und Apple Health per iPhone-Kurzbefehl
// -----------------------------------

const IMPORT_FUNCTION =
  SUPABASE_URL + "/functions/v1/health-import";
const SLEEP_QUALITY = {5:"sehr gut",4:"gut",3:"mittel",2:"schlecht",1:"sehr schlecht"};

let metricsData = [];
let metricsCounter = 0;

function msMessage(text) { $("msMessage").textContent = text || ""; }
function appleMessage(text) { $("appleMessage").textContent = text || ""; }

function hoursText(minutes) {
  const m = Math.round(Number(minutes)||0);
  return Math.floor(m/60)+" h "+String(m%60).padStart(2,"0")+" min";
}

function latestSleepMetric() {
  return metricsData
    .filter(x => x.sleep_minutes!==null && x.sleep_minutes!==undefined)
    .sort((a,b) => b.day.localeCompare(a.day) ||
      (a.source==="apple_health" ? -1 : 1))[0] || null;
}

// Startseite ohne Oura: Schlafdauer statt Schlafscore.
// Der Ring zeigt die Dauer im Verhältnis zu 8 Stunden.
function renderSleepFallback() {
  if(sleepData.length) return;
  const last = latestSleepMetric();

  if(!last) {
    $("scoreLabel").textContent = "Schlafscore";
    $("scoreSource").textContent =
      "Verbinde einen Tracker oder trag deinen Schlaf unter „Gesundheit“ ein.";
    return;
  }

  const hours = Number(last.sleep_minutes)/60;
  $("mainScore").textContent =
    (Math.round(hours*10)/10).toLocaleString("de-DE");
  $("miniSleep").textContent = hoursText(last.sleep_minutes);
  $("scoreLabel").textContent = "Std. Schlaf";
  $("scoreDate").textContent = formatDate(last.day);
  $("scoreRating").textContent = last.sleep_quality
    ? "Gefühlt: "+SLEEP_QUALITY[last.sleep_quality]
    : "Letzte Nacht";
  $("scoreSource").textContent = last.source==="apple_health"
    ? "Aus Apple Health. Der Ring zeigt die Dauer im Verhältnis zu 8 Stunden; empfohlen sind mindestens 7."
    : "Selbst eingetragen. Der Ring zeigt die Dauer im Verhältnis zu 8 Stunden; empfohlen sind mindestens 7.";
  setScoreVisual(Math.min(100,Number(last.sleep_minutes)/480*100));
}

function renderMetricsList() {
  const list = $("metricsList");
  list.replaceChildren();
  if(!metricsData.length) return;

  const head = document.createElement("div");
  head.className = "day-head";
  head.textContent = "Deine letzten Tage";
  list.append(head);

  metricsData.slice(0,14).forEach(m => {
    const row = document.createElement("div");
    row.className = "meal-row";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    const parts = [];
    if(m.sleep_minutes!=null) parts.push("Schlaf "+hoursText(m.sleep_minutes));
    if(m.steps!=null) parts.push(Number(m.steps).toLocaleString("de-DE")+" Schritte");
    if(m.resting_hr!=null) parts.push("Ruhepuls "+m.resting_hr);
    if(m.active_kcal!=null) parts.push(m.active_kcal+" aktive kcal");
    title.textContent = formatDate(m.day)+" · "+(parts.join(" · ")||"–");
    const small = document.createElement("small");
    small.textContent = (m.source==="apple_health" ? "Apple Health" : "Selbst eingetragen")+
      (m.sleep_quality ? " · "+SLEEP_QUALITY[m.sleep_quality] : "")+
      (m.bedtime && m.waketime ? " · "+clock(m.bedtime)+"–"+clock(m.waketime) : "");
    info.append(title,small);
    row.append(info,deleteButton(
      "Tageswert löschen vom "+formatDate(m.day),
      () => deleteMetric(m)
    ));
    list.append(row);
  });
}

function applyMetrics() {
  renderInsights();
  renderMetricsList();
  renderSleepFallback();
  renderTrackerIdentity();
  // Schritte für die Tagesziele, wenn kein Oura-Tracker liefert
  if(!trackerData) {
    const today = metricsData.find(m =>
      m.day===localDate() && m.source==="apple_health" && m.steps!=null);
    todaySteps = today ? Number(today.steps) : null;
    renderGoals();
  }
}

function resetMetrics() {
  metricsData = [];
  appleConnected = false;
  ouraConnected = false;
  renderTrackerIdentity();
  ++metricsCounter;
  $("manualSleepForm").reset();
  $("msDay").value = localDate();
  $("appleKeyBox").classList.add("hidden");
  $("appleKey").value = "";
  msMessage("");
  appleMessage("");
  renderMetricsList();
}

async function loadMetrics() {
  if(!currentUserId) return;
  const requestId = ++metricsCounter;
  const userId = currentUserId;
  const since = new Date();
  since.setDate(since.getDate()-30);

  const {data,error} = await supabase
    .from("daily_metrics")
    .select("day,source,sleep_minutes,sleep_quality,bedtime,waketime,steps,resting_hr,active_kcal")
    .eq("user_id",userId)
    .gte("day",dayString(since))
    .order("day",{ascending:false})
    .limit(120);

  if(requestId!==metricsCounter || userId!==currentUserId) return;
  if(error) {
    msMessage("Tageswerte konnten nicht geladen werden: "+error.message);
    return;
  }
  metricsData = data||[];
  applyMetrics();
}

async function deleteMetric(m) {
  if(!confirm("Diesen Tageswert wirklich löschen?")) return;
  const {error} = await supabase
    .from("daily_metrics")
    .delete()
    .eq("user_id",currentUserId)
    .eq("day",m.day)
    .eq("source",m.source);
  if(error) {
    msMessage("Löschen fehlgeschlagen: "+error.message);
    return;
  }
  await loadMetrics();
  msMessage("Eintrag gelöscht.");
}

$("manualSleepForm").addEventListener("submit",async event => {
  event.preventDefault();
  if(!currentUserId) return;
  const button = $("msSave");
  button.disabled = true;

  try {
    const day = $("msDay").value;
    if(!day) throw new Error("Bitte das Datum wählen.");
    if(day>localDate()) throw new Error("Das Datum liegt in der Zukunft.");

    // Aufstehen am gewählten Tag; ins Bett am Vortag,
    // wenn die Bettzeit später als die Aufstehzeit ist.
    const wake = new Date(day+"T"+$("msWake").value);
    let bed = new Date(day+"T"+$("msBed").value);
    if(bed>=wake) bed = new Date(bed.getTime()-24*3600*1000);
    const minutes = Math.round((wake-bed)/60000);
    if(!Number.isFinite(minutes) || minutes<30 || minutes>1080) {
      throw new Error("Bitte prüfe die Uhrzeiten (zwischen 30 Minuten und 18 Stunden).");
    }

    const quality = $("msQuality").value;
    const saved = await saveOrQueue("daily_metrics",{
        user_id:currentUserId,
        day,
        source:"manual",
        sleep_minutes:minutes,
        sleep_quality:quality ? Number(quality) : null,
        bedtime:bed.toISOString(),
        waketime:wake.toISOString(),
        updated_at:new Date().toISOString()
      },{onConflict:"user_id,day,source"});
    if(saved.queued) { msMessage(OFFLINE_MSG); return; }

    await loadMetrics();
    msMessage("✓ Schlaf gespeichert: "+hoursText(minutes)+".");
  } catch(error) {
    msMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});

// --- Apple Health: persönlicher Import-Schlüssel ---

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2,"0")).join("");
}

function newImportKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  return "vy_"+b64;
}

async function loadAppleStatus() {
  if(!currentUserId) return;
  $("appleUrl").textContent = IMPORT_FUNCTION;
  const {data,error} = await supabase
    .from("import_tokens")
    .select("created_at,last_used_at")
    .eq("user_id",currentUserId)
    .maybeSingle();

  if(error) {
    $("appleStatus").textContent = "Status konnte nicht geladen werden.";
    return;
  }
  const has = !!data;
  appleConnected = has;
  renderTrackerIdentity();
  $("appleCreate").textContent = has
    ? "Neuen Schlüssel erstellen (alter wird ungültig)"
    : "Import-Schlüssel erstellen";
  $("appleDelete").classList.toggle("hidden",!has);
  $("appleStatus").textContent = !has
    ? "Noch nicht verbunden."
    : data.last_used_at
      ? "✓ Verbunden · letzte Übertragung "+
        new Date(data.last_used_at).toLocaleString("de-DE")
      : "Schlüssel erstellt am "+new Date(data.created_at).toLocaleDateString("de-DE")+
        " · noch keine Übertragung";
}

$("appleCreate").addEventListener("click",async () => {
  if(!currentUserId) return;
  const key = newImportKey();
  const button = $("appleCreate");
  button.disabled = true;
  try {
    const {error} = await supabase
      .from("import_tokens")
      .upsert({
        user_id:currentUserId,
        token_hash:await sha256Hex(key),
        created_at:new Date().toISOString(),
        last_used_at:null
      },{onConflict:"user_id"});
    if(error) throw error;
    $("appleKey").value = key;
    $("appleKeyBox").classList.remove("hidden");
    appleMessage("✓ Schlüssel erstellt. Kopiere ihn jetzt in deinen Kurzbefehl – er wird später nicht mehr angezeigt.");
    await loadAppleStatus();
  } catch(error) {
    appleMessage("Erstellen fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});

$("appleCopy").addEventListener("click",async () => {
  try {
    await navigator.clipboard.writeText($("appleKey").value);
    appleMessage("✓ Kopiert.");
  } catch(_error) {
    $("appleKey").select();
    appleMessage("Bitte den markierten Schlüssel selbst kopieren.");
  }
});

$("appleDelete").addEventListener("click",async () => {
  if(!confirm("Verbindung zu Apple Health trennen? Der Kurzbefehl funktioniert danach nicht mehr. Bereits übertragene Werte bleiben, bis du sie löschst.")) return;
  const {error} = await supabase
    .from("import_tokens")
    .delete()
    .eq("user_id",currentUserId);
  if(error) {
    appleMessage("Trennen fehlgeschlagen: "+error.message);
    return;
  }
  $("appleKeyBox").classList.add("hidden");
  $("appleKey").value = "";
  appleMessage("Verbindung getrennt.");
  await loadAppleStatus();
});

$("msDay").value = localDate();
