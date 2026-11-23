// VYORA AI – Offline-Speicher und Push-Erinnerungen
// Teil 2 von 18. Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Offline eintragen
// Ohne Internet werden neue Einträge auf diesem Gerät vorgemerkt
// (nur für das angemeldete Konto) und automatisch übertragen,
// sobald wieder Verbindung besteht. Jeder Eintrag bekommt vorher
// eine feste ID – so wird nichts doppelt gespeichert.
// -----------------------------------

const OFFLINE_MSG = "📴 Offline gespeichert – wird automatisch übertragen, sobald du wieder online bist.";
const offlineKey = uid => "vyora_offline_"+uid;
const CONSENT_OK_KEY = "vyora_consent_ok";
let offlineFlushing = false;

function isNetworkError(error) {
  const text = String(error?.message || error || "");
  return !navigator.onLine ||
    /failed to fetch|networkerror|load failed|network request failed|fetch failed|internet connection appears/i.test(text);
}

function readQueue(uid) {
  if(!uid) return [];
  try { return JSON.parse(localStorage.getItem(offlineKey(uid))||"[]"); }
  catch(_error) { return []; }
}

function writeQueue(uid,queue) {
  try {
    if(queue.length) localStorage.setItem(offlineKey(uid),JSON.stringify(queue));
    else localStorage.removeItem(offlineKey(uid));
  } catch(_error) {}
  renderOfflineBanner();
}

function renderOfflineBanner() {
  const box = $("offlineBanner");
  if(!box) return;
  const waiting = readQueue(currentUserId).length;
  const offline = !navigator.onLine;
  box.classList.toggle("hidden",!offline && !waiting);
  box.textContent = offline
    ? "📴 Du bist offline. Neue Einträge werden auf diesem Gerät vorgemerkt und automatisch übertragen."+
      (waiting ? " Wartend: "+waiting+"." : "")
    : "⏳ "+waiting+(waiting===1 ? " Eintrag wird" : " Einträge werden")+" übertragen ...";
}

// Speichert sofort – oder merkt den Eintrag vor, wenn keine Verbindung besteht.
// opts.onConflict: Schlüssel für "überschreiben statt neu" (z. B. "user_id,day").
async function saveOrQueue(table,row,opts={}) {
  const uid = currentUserId;
  const item = {table,row:{...row},onConflict:opts.onConflict||"id",t:Date.now()};
  if(!opts.onConflict && !item.row.id) item.row.id = crypto.randomUUID();

  if(navigator.onLine) {
    const {error} = opts.onConflict
      ? await supabase.from(table).upsert(item.row,{onConflict:opts.onConflict})
      : await supabase.from(table).insert(item.row);
    if(!error) return {queued:false};
    if(!isNetworkError(error)) throw error;
  }

  const queue = readQueue(uid);
  if(opts.onConflict) {
    // gleicher Tag/Schlüssel: nur den neuesten Stand behalten
    const keys = opts.onConflict.split(",");
    for(let i=queue.length-1;i>=0;i--) {
      if(queue[i].table===table && keys.every(k => String(queue[i].row[k])===String(item.row[k]))) queue.splice(i,1);
    }
  }
  queue.push(item);
  while(queue.length>500) queue.shift();
  writeQueue(uid,queue);
  return {queued:true};
}

async function flushQueue() {
  const uid = currentUserId;
  if(!uid || offlineFlushing || !navigator.onLine) { renderOfflineBanner(); return; }
  let queue = readQueue(uid);
  if(!queue.length) { renderOfflineBanner(); return; }

  offlineFlushing = true;
  let sent = 0, dropped = 0;
  renderOfflineBanner();
  try {
    while(queue.length && uid===currentUserId) {
      const item = queue[0];
      const {error} = item.onConflict==="id"
        ? await supabase.from(item.table).upsert(item.row,{onConflict:"id",ignoreDuplicates:true})
        : await supabase.from(item.table).upsert(item.row,{onConflict:item.onConflict});
      if(error) {
        if(isNetworkError(error)) break;
        dropped += 1; // z. B. ungültiger Wert – nicht endlos wiederholen
      } else {
        sent += 1;
      }
      queue.shift();
      writeQueue(uid,queue);
    }
  } finally {
    offlineFlushing = false;
  }

  if(uid!==currentUserId) return;
  renderOfflineBanner();
  if(sent || dropped) {
    message(dropped
      ? "✓ "+sent+" vorgemerkte Einträge übertragen. "+dropped+" konnten nicht gespeichert werden."
      : "✓ "+sent+(sent===1 ? " vorgemerkter Eintrag" : " vorgemerkte Einträge")+" übertragen.");
    loadNutrition(); loadTraining(); loadHealth(); loadMeasurements();
    loadMetrics(); loadWater(); loadVeg(); loadWellbeing(); scheduleInsights();
  }
}

window.addEventListener("online",() => { renderOfflineBanner(); flushQueue(); });
window.addEventListener("offline",renderOfflineBanner);

// -----------------------------------
// Push-Erinnerungen
// Abo wird im Browser erzeugt; der Server sendet zur gewählten Zeit.
// -----------------------------------

const PUSH_FUNCTION = SUPABASE_URL + "/functions/v1/push-reminders";
const REMINDERS = [
  {kind:"bp",label:"🩺 Blutdruck messen",def:"08:00"},
  {kind:"glucose",label:"🩸 Blutzucker messen",def:"07:30"},
  {kind:"training",label:"🏋️ Training",def:"18:00"},
  {kind:"sleep",label:"😴 Schlaf eintragen",def:"09:00"},
  {kind:"water",label:"💧 Wasser trinken",def:"14:00"},
  {kind:"weekly",label:"📊 Wochenrückblick",def:"18:00",weekly:true}
];
let remindCounter = 0;

function remindMessage(text) { if($("remindMessage")) $("remindMessage").textContent = text || ""; }

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isIosBrowserTab() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.navigator.standalone===true ||
    window.matchMedia?.("(display-mode: standalone)").matches;
  return ios && !standalone;
}

function renderReminderRows(saved={}) {
  const list = $("remindList");
  if(!list) return;
  list.replaceChildren();
  REMINDERS.forEach(r => {
    const row = document.createElement("div");
    row.className = "remind-row";
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = "rem-"+r.kind;
    box.checked = !!saved[r.kind]?.enabled;
    const span = document.createElement("span");
    span.textContent = r.label;
    label.append(box,span);
    const time = document.createElement("input");
    time.type = "time";
    time.id = "remt-"+r.kind;
    time.value = saved[r.kind]?.at_time ? String(saved[r.kind].at_time).slice(0,5) : r.def;
    time.setAttribute("aria-label","Uhrzeit für "+r.label.replace(/^\S+\s/,""));
    row.append(label,time);
    // Wochentage: alle an = jeden Tag; beim Wochenrückblick genau ein Tag
    const days = saved[r.kind]?.days?.length ? saved[r.kind].days.map(Number) : (r.weekly ? [7] : [1,2,3,4,5,6,7]);
    const picker = document.createElement("div");
    picker.className = "day-picker remind-days";
    picker.id = "remd-"+r.kind;
    picker.setAttribute("role",r.weekly ? "radiogroup" : "group");
    picker.setAttribute("aria-label",(r.weekly ? "Wochentag für " : "Wochentage für ")+r.label.replace(/^\S+\s/,""));
    WEEKDAYS.forEach((name,i) => {
      const l = document.createElement("label");
      const input = document.createElement("input");
      input.type = r.weekly ? "radio" : "checkbox";
      input.name = "remd-"+r.kind;
      input.value = String(i+1);
      input.checked = days.includes(i+1);
      const t = document.createElement("span");
      t.textContent = name;
      l.append(input,t);
      picker.append(l);
    });
    list.append(row,picker);
  });
}

async function currentPushSub() {
  if(!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch(_e) { return null; }
}

async function renderPushStatus() {
  if(!$("pushStatus")) return;
  const sub = await currentPushSub();
  let text, canEnable = false;
  if(!pushSupported()) {
    text = "Dieser Browser unterstützt keine Benachrichtigungen.";
  } else if(isIosBrowserTab()) {
    text = "Auf dem iPhone: Erst „Teilen → Zum Home-Bildschirm“ wählen und VYORA von dort öffnen. Dann kannst du Erinnerungen erlauben.";
  } else if(Notification.permission==="denied") {
    text = "Benachrichtigungen sind in den Browser-Einstellungen blockiert. Erlaube sie dort für diese Seite.";
  } else if(sub) {
    text = "✓ Benachrichtigungen auf diesem Gerät aktiv.";
  } else {
    text = "Auf diesem Gerät noch nicht aktiviert.";
    canEnable = true;
  }
  $("pushStatus").textContent = text;
  $("pushEnable").classList.toggle("hidden",!canEnable);
  $("pushTest").classList.toggle("hidden",!sub);
  $("pushOff").classList.toggle("hidden",!sub);
}

function resetReminders() {
  ++remindCounter;
  renderReminderRows({});
  remindMessage("");
}

async function loadReminders() {
  if(!currentUserId) return;
  const requestId = ++remindCounter;
  const userId = currentUserId;
  renderPushStatus();
  const {data,error} = await supabase
    .from("reminders")
    .select("kind,at_time,enabled,days")
    .eq("user_id",userId);
  if(requestId!==remindCounter || userId!==currentUserId || error) return;
  renderReminderRows(Object.fromEntries((data||[]).map(r => [r.kind,r])));
}

function keyToBytes(b64) {
  const s = b64.replace(/-/g,"+").replace(/_/g,"/");
  const bin = atob(s+"===".slice((s.length+3)%4));
  return Uint8Array.from(bin,c => c.charCodeAt(0));
}

$("pushEnable")?.addEventListener("click",async () => {
  if(!currentUserId) return;
  const button = $("pushEnable");
  button.disabled = true;
  try {
    const permission = await Notification.requestPermission();
    if(permission!=="granted") throw new Error("Benachrichtigungen wurden nicht erlaubt.");
    const res = await fetch(PUSH_FUNCTION+"?action=key",{method:"POST"});
    const {publicKey} = await res.json();
    if(!publicKey) throw new Error("Server-Schlüssel fehlt.");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:keyToBytes(publicKey)
    });
    const j = sub.toJSON();
    const {error} = await supabase.from("push_subscriptions").upsert({
      user_id:currentUserId,
      endpoint:j.endpoint,
      p256dh:j.keys.p256dh,
      auth:j.keys.auth
    },{onConflict:"endpoint"});
    if(error) throw error;
    remindMessage("✓ Aktiviert. Wähle jetzt deine Erinnerungen und speichere sie.");
  } catch(error) {
    remindMessage("Aktivieren fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
    renderPushStatus();
  }
});

$("remindSave")?.addEventListener("click",async () => {
  if(!currentUserId) return;
  const button = $("remindSave");
  button.disabled = true;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
    const rows = REMINDERS.map(r => {
      const time = $("remt-"+r.kind).value || r.def;
      if(!/^\d{2}:\d{2}$/.test(time)) throw new Error("Bitte gültige Uhrzeiten wählen.");
      const days = [...document.querySelectorAll("#remd-"+r.kind+" input:checked")].map(i => Number(i.value));
      if(!days.length) throw new Error("Bitte für „"+r.label.replace(/^\S+\s/,"")+"“ mindestens einen Tag wählen.");
      return {
        user_id:currentUserId, kind:r.kind, at_time:time, tz,
        enabled:$("rem-"+r.kind).checked, updated_at:new Date().toISOString(),
        days:days.length===7 ? null : days
      };
    });
    const {error} = await supabase.from("reminders").upsert(rows,{onConflict:"user_id,kind"});
    if(error) throw error;
    const count = rows.filter(r => r.enabled).length;
    const sub = await currentPushSub();
    remindMessage(count
      ? "✓ "+count+(count===1 ? " Erinnerung" : " Erinnerungen")+" gespeichert."+
        (sub ? "" : " Tipp: Erlaube oben noch Benachrichtigungen auf diesem Gerät.")
      : "✓ Gespeichert – alle Erinnerungen sind aus.");
  } catch(error) {
    remindMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});

$("pushTest")?.addEventListener("click",async () => {
  const button = $("pushTest");
  button.disabled = true;
  try {
    const {data} = await supabase.auth.getSession();
    const res = await fetch(PUSH_FUNCTION+"?action=test",{
      method:"POST",
      headers:{Authorization:"Bearer "+(data?.session?.access_token||""),apikey:SUPABASE_KEY}
    });
    const result = await res.json();
    if(!res.ok || !result.ok) throw new Error(result.error || "Nicht zugestellt");
    remindMessage("✓ Test gesendet – die Benachrichtigung sollte gleich erscheinen.");
  } catch(error) {
    remindMessage("Test fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});

$("pushOff")?.addEventListener("click",async () => {
  const sub = await currentPushSub();
  if(sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint",sub.endpoint);
    try { await sub.unsubscribe(); } catch(_e) {}
  }
  remindMessage("Benachrichtigungen auf diesem Gerät ausgeschaltet.");
  renderPushStatus();
});

// Tippen auf eine Benachrichtigung öffnet den passenden Bereich
// Öffnet einen Bereich, z. B. "#healthView" oder mit Unterbereich
// "#healthView/messen" (so öffnen auch Benachrichtigungen die passende Stelle).
function openView(value) {
  const [id,sub] = String(value||"").split("/");
  if(!id || !document.getElementById(id)?.classList.contains("view")) return;
  switchView(id);
  if(sub) vyEmit("subview",{view:id,sub});
}
function openViewFromHash() {
  openView((location.hash||"").slice(1));
}
navigator.serviceWorker?.addEventListener("message",event => {
  if(event.data?.type==="open-view") openView(event.data.view);
});
window.addEventListener("hashchange",openViewFromHash);
