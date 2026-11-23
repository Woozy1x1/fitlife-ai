// VYORA AI – Tages-Checkliste und Messtagebuch (Blutdruck, Blutzucker, Insulin)
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Tages-Checkliste & Messtagebuch
// (Blutdruck, Blutzucker, Insulin – mit Uhrzeit)
// Nur speichern und anzeigen: keine Bewertung,
// keine Dosisberechnung.
// -----------------------------------

const MEASURE_KINDS = {
  bp:{icon:"🩺",name:"Blutdruck"},
  glucose:{icon:"🩸",name:"Blutzucker"},
  insulin:{icon:"💉",name:"Insulin"}
};
const GLUCOSE_CONTEXT = {
  nuechtern:"nüchtern",vor_essen:"vor dem Essen",
  nach_essen:"nach dem Essen",nacht:"vor dem Schlafen",sonstiges:""
};
const INSULIN_KIND = {
  mahlzeit:"zur Mahlzeit",korrektur:"Korrektur",basal:"Basal",
  misch:"Mischinsulin",sonstiges:""
};
const MMOL_FACTOR = 18.016;

let checkSettings = {bp:0,glucose:0,insulin:0,unit:"mg_dl"};
let measureData = [];
let measureKind = "bp";
let measureLoadCounter = 0;

function checkMessage(text) { $("checkMessage").textContent = text || ""; }
function measureMessage(text) { $("measureMessage").textContent = text || ""; }

function localDayOf(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : dayString(d);
}

function nowForInput() {
  const d = new Date();
  d.setSeconds(0,0);
  return dayString(d)+"T"+
    String(d.getHours()).padStart(2,"0")+":"+
    String(d.getMinutes()).padStart(2,"0");
}

function glucoseText(mgdl) {
  const v = Number(mgdl);
  return checkSettings.unit==="mmol_l"
    ? (Math.round(v/MMOL_FACTOR*10)/10).toLocaleString("de-DE")+" mmol/l"
    : Math.round(v).toLocaleString("de-DE")+" mg/dl";
}

function fillCheckForm() {
  $("setBp").value = String(checkSettings.bp);
  $("setGlucose").value = String(checkSettings.glucose);
  $("setInsulin").value = String(checkSettings.insulin);
  $("setUnit").value = checkSettings.unit;
  const mmol = checkSettings.unit==="mmol_l";
  $("mGlucoseLabel").textContent =
    "Blutzucker ("+(mmol ? "mmol/l" : "mg/dl")+")";
  $("mGlucose").placeholder = mmol ? "z. B. 6,1" : "z. B. 110";
}

function selectMeasureKind(kind) {
  measureKind = kind;
  document.querySelectorAll("#measureCard .seg button").forEach(b => {
    b.setAttribute("aria-selected",String(b.dataset.kind===kind));
  });
  document.querySelectorAll("#measureForm [data-group]").forEach(g => {
    g.classList.toggle("hidden",g.dataset.group!==kind);
  });
}

document.querySelectorAll("#measureCard .seg button").forEach(button => {
  button.addEventListener("click",() => selectMeasureKind(button.dataset.kind));
});

function renderChecklist() {
  const list = $("checkList");
  list.replaceChildren();
  const today = localDate();
  const active = Object.keys(MEASURE_KINDS)
    .filter(kind => checkSettings[kind]>0);

  $("checkHint").classList.toggle("hidden",active.length>0);

  active.forEach(kind => {
    const target = checkSettings[kind];
    const done = measureData.filter(m =>
      m.kind===kind && localDayOf(m.measured_at)===today).length;

    const row = document.createElement("div");
    row.className = "check-row"+(done>=target ? " complete" : "");

    const icon = document.createElement("div");
    icon.className = "check-icon";
    icon.textContent = MEASURE_KINDS[kind].icon;

    const main = document.createElement("div");
    main.className = "check-main";
    const title = document.createElement("strong");
    title.textContent = MEASURE_KINDS[kind].name;
    const ticks = document.createElement("div");
    ticks.className = "check-ticks";
    ticks.setAttribute("aria-hidden","true");
    for(let i=0;i<target;i++) {
      const tick = document.createElement("span");
      tick.className = "tick"+(i<done ? " on" : "");
      tick.textContent = "✓";
      ticks.append(tick);
    }
    const count = document.createElement("small");
    count.className = "check-count";
    count.textContent = Math.min(done,target)+" von "+target+
      (done>target ? " (+"+(done-target)+")" : "");
    ticks.removeAttribute("aria-hidden");
    ticks.setAttribute("aria-label",count.textContent+" erledigt");
    ticks.append(count);
    main.append(title,ticks);

    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "+ Eintragen";
    add.setAttribute("aria-label",MEASURE_KINDS[kind].name+" eintragen");
    add.addEventListener("click",() => {
      selectMeasureKind(kind);
      $("measureTime").value = nowForInput();
      $("measureCard").scrollIntoView({behavior:"smooth",block:"start"});
    });

    row.append(icon,main,add);
    list.append(row);
  });
}

function measureSummary(m) {
  if(m.kind==="bp") {
    return "RR "+m.systolic+"/"+m.diastolic+" mmHg"+
      (m.pulse ? " · Puls "+m.pulse : "");
  }
  if(m.kind==="glucose") {
    const ctx = GLUCOSE_CONTEXT[m.glucose_context] || "";
    return "Blutzucker "+glucoseText(m.glucose_mg_dl)+(ctx ? " · "+ctx : "");
  }
  const parts = [
    "Insulin "+Number(m.insulin_units).toLocaleString("de-DE")+" IE"
  ];
  if(INSULIN_KIND[m.insulin_kind]) parts.push(INSULIN_KIND[m.insulin_kind]);
  if(m.insulin_name) parts.push(m.insulin_name);
  if(m.carbs_ke!==null && m.carbs_ke!==undefined) {
    parts.push(Number(m.carbs_ke).toLocaleString("de-DE")+" KE");
  }
  return parts.join(" · ");
}

function renderMeasureList() {
  const list = $("measureList");
  list.replaceChildren();

  if(!measureData.length) {
    list.textContent = "Noch keine Einträge in den letzten 7 Tagen.";
    return;
  }

  let lastDay = "";
  measureData.forEach(m => {
    const day = localDayOf(m.measured_at);
    if(day!==lastDay) {
      lastDay = day;
      const head = document.createElement("div");
      head.className = "day-head";
      head.textContent = day===localDate() ? "Heute" : formatDate(day);
      list.append(head);
    }

    const row = document.createElement("div");
    row.className = "meal-row";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = MEASURE_KINDS[m.kind].icon+" "+
      clock(m.measured_at)+" · "+measureSummary(m);
    const details = document.createElement("small");
    details.textContent = m.notes || "";
    info.append(title,details);
    row.append(info,deleteButton(
      "Eintrag löschen: "+MEASURE_KINDS[m.kind].name+" "+clock(m.measured_at),
      () => deleteMeasurement(m.id)
    ));
    list.append(row);
  });
}

// Neuester Blutdruck aus Messtagebuch ODER Gesundheitswerten
function updateLatestBp() {
  const old = latestWith("systolic");
  const fresh = measureData.find(m => m.kind==="bp");
  const freshDay = fresh ? localDayOf(fresh.measured_at) : "";

  if(fresh && (!old || freshDay>=old.entry_date)) {
    $("latestBp").textContent = fresh.systolic+"/"+fresh.diastolic;
    $("latestBpDate").textContent =
      formatDate(freshDay)+" "+clock(fresh.measured_at)+" · mmHg";
  } else if(old) {
    $("latestBp").textContent = old.systolic+"/"+old.diastolic;
    $("latestBpDate").textContent = formatDate(old.entry_date)+" · mmHg";
  } else {
    $("latestBp").textContent = "–";
    $("latestBpDate").textContent = "Noch keine Daten";
  }
}

function resetMeasurements() {
  measureData = [];
  ++measureLoadCounter;
  checkSettings = {bp:0,glucose:0,insulin:0,unit:"mg_dl"};
  $("measureForm").reset();
  $("measureTime").value = nowForInput();
  selectMeasureKind("bp");
  fillCheckForm();
  renderChecklist();
  renderMeasureList();
  checkMessage("");
  measureMessage("");
}

async function loadMeasurements() {
  if(!currentUserId) return;
  const requestId = ++measureLoadCounter;
  const userId = currentUserId;

  const since = new Date();
  since.setDate(since.getDate()-6);
  since.setHours(0,0,0,0);

  const {data,error} = await supabase
    .from("measurements")
    .select("id,kind,measured_at,systolic,diastolic,pulse,glucose_mg_dl,glucose_context,insulin_units,insulin_kind,insulin_name,carbs_ke,notes")
    .eq("user_id",userId)
    .gte("measured_at",since.toISOString())
    .order("measured_at",{ascending:false})
    .limit(300);

  if(requestId!==measureLoadCounter || userId!==currentUserId) return;

  if(error) {
    measureMessage("Messtagebuch konnte nicht geladen werden: "+error.message);
    return;
  }

  measureData = data||[];
  renderChecklist();
  renderMeasureList();
  updateLatestBp();
  scheduleInsights();
  vyEmit("measures");
}

$("measureForm").addEventListener("submit",async event => {
  event.preventDefault();
  if(!currentUserId) return;

  const button = $("saveMeasure");
  button.disabled = true;

  try {
    const when = new Date($("measureTime").value);
    if(isNaN(when.getTime())) throw new Error("Bitte Datum und Uhrzeit angeben.");
    if(when.getTime()>Date.now()+5*60000) {
      throw new Error("Der Zeitpunkt liegt in der Zukunft.");
    }

    const row = {
      user_id:currentUserId,
      kind:measureKind,
      measured_at:when.toISOString(),
      notes:$("mNotes").value.trim().slice(0,300) || null
    };

    if(measureKind==="bp") {
      row.systolic = optionalNumber("mSys",50,260,"Blutdruck oben",true);
      row.diastolic = optionalNumber("mDia",30,180,"Blutdruck unten",true);
      row.pulse = optionalNumber("mPulse",25,250,"Puls",true);
      if(row.systolic===null || row.diastolic===null) {
        throw new Error("Bitte beide Blutdruckwerte eintragen.");
      }
    } else if(measureKind==="glucose") {
      const mmol = checkSettings.unit==="mmol_l";
      const value = mmol
        ? optionalNumber("mGlucose",0.6,38.8,"Blutzucker",false)
        : optionalNumber("mGlucose",10,700,"Blutzucker",false);
      if(value===null) throw new Error("Bitte den Blutzuckerwert eintragen.");
      row.glucose_mg_dl = Math.round((mmol ? value*MMOL_FACTOR : value)*10)/10;
      row.glucose_context = $("mContext").value;
    } else {
      const units = optionalNumber("mUnits",0.5,200,"Einheiten",false);
      if(units===null) throw new Error("Bitte die Insulin-Einheiten eintragen.");
      row.insulin_units = Math.round(units*10)/10;
      row.insulin_kind = $("mInsulinKind").value;
      row.insulin_name = $("mInsulinName").value.trim().slice(0,60) || null;
      row.carbs_ke = optionalNumber("mKe",0,50,"KE/BE",false);
    }

    measureMessage("Wird gespeichert ...");
    const saved = await saveOrQueue("measurements",row);

    // Felder leeren, Art und Insulinname behalten
    ["mSys","mDia","mPulse","mGlucose","mUnits","mKe","mNotes"]
      .forEach(id => { $(id).value = ""; });
    $("measureTime").value = nowForInput();
    if(saved.queued) { measureMessage(OFFLINE_MSG); return; }

    await loadMeasurements();
    measureMessage("✓ "+MEASURE_KINDS[row.kind].name+" gespeichert.");
  } catch(error) {
    measureMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});

async function deleteMeasurement(id) {
  if(!confirm("Diesen Eintrag wirklich löschen?")) return;
  const {error} = await supabase
    .from("measurements")
    .delete()
    .eq("id",id)
    .eq("user_id",currentUserId);
  if(error) {
    measureMessage("Löschen fehlgeschlagen: "+error.message);
    return;
  }
  await loadMeasurements();
  measureMessage("Eintrag gelöscht.");
}

$("checkForm").addEventListener("submit",async event => {
  event.preventDefault();
  if(!currentUserId) return;
  const button = $("saveCheck");
  button.disabled = true;

  try {
    const next = {
      bp:Number($("setBp").value)||0,
      glucose:Number($("setGlucose").value)||0,
      insulin:Number($("setInsulin").value)||0,
      unit:$("setUnit").value==="mmol_l" ? "mmol_l" : "mg_dl"
    };

    const {error} = await supabase
      .from("user_goals")
      .upsert({
        user_id:currentUserId,
        bp_per_day:next.bp,
        glucose_per_day:next.glucose,
        insulin_per_day:next.insulin,
        glucose_unit:next.unit,
        updated_at:new Date().toISOString()
      },{onConflict:"user_id"});
    if(error) throw error;

    checkSettings = next;
    fillCheckForm();
    renderChecklist();
    renderMeasureList();
    $("checkSettings").open = false;
    checkMessage("✓ Checkliste gespeichert.");
  } catch(error) {
    checkMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});
