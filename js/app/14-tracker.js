// VYORA AI – Tracker: Oura Ring und Apple Health
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Tracker (aktuell: Oura Ring)
// Jeder Tracker liefert dieselbe Struktur,
// damit später weitere Geräte dazukommen können.
// -----------------------------------

const TRACKERS = {
  oura: { name:"Oura Ring", action:"details" }
};

let trackerData = null;     // { source, sleep, readiness, activity, heartrate, workouts }
let trackerCounter = 0;

const HR_SOURCES = {
  awake:"wach", rest:"Ruhe", sleep:"Schlaf",
  session:"Session", live:"live", workout:"Training"
};

function hm(seconds) {
  const s = Number(seconds);
  if(!Number.isFinite(s) || s<=0) return "–";
  const total = Math.round(s/60);
  const h = Math.floor(total/60);
  const m = total%60;
  return h+" h "+String(m).padStart(2,"0")+" min";
}

function clock(iso) {
  if(!iso) return "–";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "–"
    : d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
}

function pct(part,total) {
  return total>0 ? Math.round(part/total*100) : 0;
}

async function loadTrackerDetails(userId) {
  const requestId = ++trackerCounter;

  try {
    const result = await authenticatedRequest(TRACKERS.oura.action);
    if(currentUserId!==userId || requestId!==trackerCounter) return;

    trackerData = {
      source:TRACKERS.oura.name,
      sleep:Array.isArray(result.sleep) ? result.sleep : [],
      readiness:Array.isArray(result.readiness) ? result.readiness : [],
      activity:Array.isArray(result.activity) ? result.activity : [],
      heartrate:result.heartrate || {latest:null,points:[]},
      workouts:Array.isArray(result.workouts) ? result.workouts : []
    };
  } catch(error) {
    if(currentUserId!==userId || requestId!==trackerCounter) return;
    trackerData = null;
    ouraMessage("Detaildaten konnten nicht geladen werden: "+error.message);
  }

  renderTracker();
  renderInsights();
}

// Hauptschlaf pro Nacht: der längste Schlaf eines Tages
function mainSleeps() {
  if(!trackerData) return [];
  const byDay = new Map();
  trackerData.sleep.forEach(s => {
    if(!s.day || !Number(s.total_sleep_duration)) return;
    if(s.type==="rest" || s.type==="deleted") return;
    const cur = byDay.get(s.day);
    if(!cur || Number(s.total_sleep_duration)>Number(cur.total_sleep_duration)) {
      byDay.set(s.day,s);
    }
  });
  return [...byDay.values()].sort((a,b)=>a.day.localeCompare(b.day));
}

function latestOf(list) {
  return list.length ? [...list].sort((a,b)=>
    String(a.day).localeCompare(String(b.day))).pop() : null;
}

// Minuten seit 18:00 Uhr – so liegen Einschlafzeiten
// vor und nach Mitternacht richtig nebeneinander.
function bedtimeMinutes(iso) {
  const d = new Date(iso);
  if(isNaN(d.getTime())) return null;
  return ((d.getHours()*60+d.getMinutes()) - 18*60 + 1440) % 1440;
}

function minutesToClock(m) {
  const t = (Math.round(m) + 18*60) % 1440;
  return String(Math.floor(t/60)).padStart(2,"0")+":"+
    String(t%60).padStart(2,"0");
}

function kv(value,label) {
  const box = document.createElement("div");
  box.className = "kv";
  const s = document.createElement("strong");
  s.textContent = value;
  const l = document.createElement("small");
  l.textContent = label;
  box.append(s,l);
  return box;
}

const CONTRIBUTOR_NAMES = {
  total_sleep:"Gesamtschlaf", efficiency:"Effizienz",
  restfulness:"Ruhe im Schlaf", rem_sleep:"REM-Schlaf",
  deep_sleep:"Tiefschlaf", latency:"Einschlafdauer",
  timing:"Schlafzeitpunkt"
};

function renderSleepAnalysis() {
  const box = $("sleepAnalysis");
  box.replaceChildren();

  const nights = mainSleeps();
  const last = nights[nights.length-1];

  if(!last) {
    $("sleepSource").textContent = trackerData
      ? "Für die letzten 14 Tage liegen noch keine detaillierten Schlafdaten vor."
      : "Verbinde einen Tracker (z. B. Oura Ring), um deine Schlafanalyse zu sehen.";
    return;
  }

  $("sleepSource").textContent =
    "Quelle: "+trackerData.source+" · Nacht zum "+formatDate(last.day);

  // Kennzahlen der letzten Nacht
  const grid = document.createElement("div");
  grid.className = "kv-grid";
  grid.append(
    kv(hm(last.total_sleep_duration),"Schlafdauer"),
    kv(hm(last.time_in_bed),"Zeit im Bett"),
    kv(last.efficiency!=null ? last.efficiency+" %" : "–","Schlafeffizienz"),
    kv(last.latency!=null ? Math.round(last.latency/60)+" min" : "–","Einschlafdauer"),
    kv(clock(last.bedtime_start)+" – "+clock(last.bedtime_end),"Im Bett"),
    kv(last.lowest_heart_rate!=null ? last.lowest_heart_rate+" bpm" : "–","Niedrigste HF"),
    kv(last.average_hrv!=null ? Math.round(last.average_hrv)+" ms" : "–","Ø HRV"),
    kv(last.average_breath!=null ? number(last.average_breath)+" /min" : "–","Ø Atemfrequenz"),
    kv(last.average_heart_rate!=null ? Math.round(last.average_heart_rate)+" bpm" : "–","Ø HF im Schlaf")
  );
  box.append(grid);

  // Schlafphasen
  const phases = [
    ["Tiefschlaf",Number(last.deep_sleep_duration)||0,"#6b5cf0"],
    ["REM",Number(last.rem_sleep_duration)||0,"#c08bff"],
    ["Leichtschlaf",Number(last.light_sleep_duration)||0,"#6fd6e8"],
    ["Wach",Number(last.awake_time)||0,"#ffb866"]
  ];
  const total = phases.reduce((t,p)=>t+p[1],0);

  if(total>0) {
    const h = document.createElement("h3");
    h.textContent = "Schlafphasen";
    const bar = document.createElement("div");
    bar.className = "phase-bar";
    const legend = document.createElement("div");
    legend.className = "legend";

    phases.forEach(([name,sec,color]) => {
      const part = document.createElement("span");
      part.style.width = (sec/total*100)+"%";
      part.style.background = color;
      part.title = name;
      bar.append(part);

      const item = document.createElement("span");
      const dot = document.createElement("i");
      dot.style.background = color;
      item.append(dot, document.createTextNode(
        name+" "+hm(sec)+" ("+pct(sec,total)+" %)"
      ));
      legend.append(item);
    });

    box.append(h,bar,legend);
  }

  // Oura-Bewertung der einzelnen Faktoren (1–100)
  const latestScore = sleepData.length
    ? sleepData[sleepData.length-1] : null;

  if(latestScore && latestScore.contributors) {
    const h = document.createElement("h3");
    h.style.marginTop = "18px";
    h.textContent = "Was deinen Schlafscore ("+latestScore.score+") beeinflusst";
    box.append(h);

    Object.entries(CONTRIBUTOR_NAMES).forEach(([key,label]) => {
      const v = Number(latestScore.contributors[key]);
      if(!Number.isFinite(v)) return;

      const row = document.createElement("div");
      row.className = "contrib";
      const name = document.createElement("span");
      name.textContent = label;
      const track = document.createElement("div");
      track.className = "track";
      const fill = document.createElement("div");
      fill.className = "fill";
      fill.style.width = Math.max(0,Math.min(100,v))+"%";
      track.append(fill);
      const val = document.createElement("span");
      val.textContent = v;
      row.append(name,track,val);
      box.append(row);
    });
  }

  // 14-Tage-Auswertung
  if(nights.length>=3) {
    const avg = arr => arr.reduce((t,x)=>t+x,0)/arr.length;
    const durations = nights.map(n=>Number(n.total_sleep_duration));
    const beds = nights.map(n=>bedtimeMinutes(n.bedtime_start))
      .filter(x=>x!==null);
    const effs = nights.map(n=>Number(n.efficiency))
      .filter(Number.isFinite);
    const lats = nights.map(n=>Number(n.latency))
      .filter(Number.isFinite);
    const deepShare = nights.map(n =>
      pct(Number(n.deep_sleep_duration)||0, Number(n.total_sleep_duration)||0));

    const avgBed = beds.length ? avg(beds) : null;
    const spread = beds.length>1
      ? Math.sqrt(avg(beds.map(b=>(b-avgBed)**2))) : 0;

    const h = document.createElement("h3");
    h.style.marginTop = "18px";
    h.textContent = "Deine letzten "+nights.length+" Nächte";
    const grid2 = document.createElement("div");
    grid2.className = "kv-grid";
    grid2.append(
      kv(hm(avg(durations)),"Ø Schlafdauer"),
      kv(avgBed!==null ? minutesToClock(avgBed)+" Uhr" : "–","Ø Zubettgehen"),
      kv("± "+Math.round(spread)+" min","Schwankung Zubettgehen"),
      kv(effs.length ? Math.round(avg(effs))+" %" : "–","Ø Effizienz"),
      kv(lats.length ? Math.round(avg(lats)/60)+" min" : "–","Ø Einschlafdauer"),
      kv(Math.round(avg(deepShare))+" %","Ø Tiefschlaf-Anteil")
    );
    box.append(h,grid2);

    // Hinweise – beschreibend, keine Diagnose
    const tips = [];
    const avgH = avg(durations)/3600;
    if(avgH<7) {
      tips.push("Du schläfst im Schnitt "+hm(avg(durations))+
        ". Für Erwachsene werden meist 7–9 Stunden Schlaf empfohlen.");
    } else if(avgH>9.5) {
      tips.push("Du schläfst im Schnitt mehr als 9,5 Stunden.");
    }
    if(spread>60) {
      tips.push("Deine Zubettgehzeiten schwanken um etwa "+
        Math.round(spread)+" Minuten. Regelmäßige Schlafenszeiten "+
        "helfen vielen Menschen, schneller einzuschlafen.");
    }
    if(lats.length && avg(lats)/60>30) {
      tips.push("Du brauchst im Schnitt länger als 30 Minuten zum Einschlafen.");
    }
    if(effs.length && avg(effs)<85) {
      tips.push("Deine Schlafeffizienz liegt im Schnitt unter 85 %. "+
        "Du verbringst also relativ viel Zeit wach im Bett.");
    }
    if(!tips.length) {
      tips.push("Deine Schlafwerte der letzten Nächte wirken ausgeglichen. Weiter so!");
    }

    tips.forEach(text => {
      const p = document.createElement("div");
      p.className = "insight";
      p.textContent = text;
      box.append(p);
    });

    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "Diese Auswertung beschreibt deine Trackerdaten und "+
      "ist keine medizinische Diagnose. Bei anhaltenden Schlafproblemen "+
      "sprich bitte mit deiner Ärztin oder deinem Arzt.";
    box.append(note);
  }
}

function renderHrChart() {
  const box = $("hrChart");
  box.replaceChildren();

  const points = trackerData?.heartrate?.points || [];
  if(points.length<2) {
    $("hrSource").textContent = trackerData
      ? "Dein Tracker hat in den letzten 24 Stunden keine Herzfrequenz übertragen."
      : "Noch keine Herzfrequenzdaten.";
    return;
  }

  const bpms = points.map(p=>p.bpm);
  const times = points.map(p=>new Date(p.timestamp).getTime());
  const min = Math.min(...bpms)-5, max = Math.max(...bpms)+5;
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const W = 600, H = 150, P = 24;

  const x = t => P+(t1===t0 ? 0 : (t-t0)/(t1-t0)*(W-2*P));
  const y = b => H-P-(b-min)/(max-min)*(H-2*P);

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS,"svg");
  svg.setAttribute("viewBox","0 0 "+W+" "+H);
  svg.setAttribute("preserveAspectRatio","none");
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","Herzfrequenz der letzten 24 Stunden");

  const line = document.createElementNS(NS,"polyline");
  line.setAttribute("points",
    points.map((p,i)=>x(times[i]).toFixed(1)+","+y(p.bpm).toFixed(1)).join(" "));
  line.setAttribute("fill","none");
  line.style.stroke = "var(--sun)";
  line.setAttribute("stroke-width","2");
  line.setAttribute("vector-effect","non-scaling-stroke");
  svg.append(line);

  [[Math.max(...bpms),"max"],[Math.min(...bpms),"min"]].forEach(([b]) => {
    const t = document.createElementNS(NS,"text");
    t.setAttribute("x","2");
    t.setAttribute("y",String(y(b)+4));
    t.style.fill = "var(--muted)";
    t.setAttribute("font-size","11");
    t.textContent = b;
    svg.append(t);
  });

  box.append(svg);

  const latest = trackerData.heartrate.latest;
  $("hrSource").textContent = "Quelle: "+trackerData.source+
    " · "+points.length+" Messpunkte · zuletzt "+
    latest.bpm+" bpm um "+clock(latest.timestamp)+" Uhr";
}

function renderTrackerWorkouts() {
  const card = $("trackerWorkoutCard");
  const list = $("trackerWorkouts");
  list.replaceChildren();

  const items = (trackerData?.workouts || [])
    .slice().sort((a,b)=>String(b.start_datetime).localeCompare(String(a.start_datetime)))
    .slice(0,10);

  card.classList.toggle("hidden",!items.length);
  if(!items.length) return;

  $("trackerWorkoutSource").textContent =
    "Quelle: "+trackerData.source+" · letzte 14 Tage";

  items.forEach(w => {
    const row = document.createElement("div");
    row.className = "meal-row";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    const name = String(w.activity||"Workout").replace(/_/g," ");
    title.textContent = name.charAt(0).toUpperCase()+name.slice(1);
    const details = document.createElement("small");
    const mins = (new Date(w.end_datetime)-new Date(w.start_datetime))/60000;
    details.textContent = formatDate(w.day)+" · "+
      (Number.isFinite(mins) && mins>0 ? Math.round(mins)+" min" : "–")+
      (w.calories ? " · "+Math.round(w.calories)+" kcal" : "")+
      (w.distance ? " · "+number(w.distance/1000)+" km" : "");
    info.append(title,details);
    row.append(info);
    list.append(row);
  });
}

function updateHomePulse() {
  const manual = latestWith("pulse");
  const live = trackerData?.heartrate?.latest;

  if(live) {
    $("homePulse").textContent = live.bpm;
    $("homePulseInfo").textContent = trackerData.source.split(" ")[0]+
      " · "+clock(live.timestamp);
  } else if(manual) {
    $("homePulse").textContent = manual.pulse;
    $("homePulseInfo").textContent =
      "Letzter Eintrag · "+formatDate(manual.entry_date);
  } else {
    $("homePulse").textContent = "–";
    $("homePulseInfo").textContent = "Noch keine Daten";
  }
}

function renderTracker() {
  const has = !!trackerData;
  $("trackerCard").classList.toggle("hidden",!has);

  if(has) {
    const today = localDate();
    const r = latestOf(trackerData.readiness);
    const a = trackerData.activity.find(x=>x.day===today) ||
      latestOf(trackerData.activity);
    const live = trackerData.heartrate.latest;
    const last = mainSleeps().pop();

    $("trackerCardSource").textContent = "Von deinem "+trackerData.source;
    $("trkHr").textContent = live ? live.bpm : "–";
    $("trkHrInfo").textContent = live
      ? "HF · "+clock(live.timestamp)+
        (HR_SOURCES[live.source] ? " · "+HR_SOURCES[live.source] : "")
      : "Aktuelle HF";
    $("trkReadiness").textContent = r && r.score!=null ? r.score : "–";
    todaySteps = a && a.day===today && a.steps!=null
      ? Number(a.steps) : null;
    renderGoals();
    $("trkSteps").textContent = a && a.steps!=null
      ? Number(a.steps).toLocaleString("de-DE") : "–";
    $("trkKcal").textContent = a && a.active_calories!=null
      ? Math.round(a.active_calories) : "–";
    $("trkLastNight").textContent = last
      ? "Letzte Nacht: "+hm(last.total_sleep_duration)+" Schlaf · "+
        "Effizienz "+(last.efficiency ?? "–")+" %"
      : "";
  }

  renderSleepAnalysis();
  renderHrChart();
  renderTrackerWorkouts();
  updateHomePulse();
}
