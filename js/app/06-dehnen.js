// VYORA AI – Dehnen und Beweglichkeit
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Dehnen & Beweglichkeit: geführte Routinen
// side:true = je Seite (wird als links/rechts nacheinander geführt)
// -----------------------------------

const STRETCH_ROUTINES = {
  after:{label:"Nach dem Training",level:"Leicht",steps:[
    {name:"Brust am Türrahmen",s:30,side:true,how:"Unterarm an den Türrahmen, Ellbogen auf Schulterhöhe. Oberkörper sanft wegdrehen."},
    {name:"Hüftbeuger im Ausfallschritt",s:30,side:true,how:"Hinteres Knie am Boden (Kissen drunter). Hüfte langsam nach vorne schieben, Oberkörper aufrecht."},
    {name:"Oberschenkel-Rückseite",s:30,side:true,how:"Ferse auf eine Stufe, Bein fast gestreckt. Mit geradem Rücken aus der Hüfte nach vorne neigen."},
    {name:"Waden an der Wand",s:30,side:true,how:"Hände an die Wand, hinteres Bein gestreckt, Ferse bleibt am Boden."},
    {name:"Kindhaltung",s:45,how:"Auf die Fersen setzen, Arme lang nach vorne, Stirn Richtung Boden. Ruhig in den Rücken atmen."}
  ]},
  morning:{label:"Ganzkörper sanft",level:"Leicht",steps:[
    {name:"Nacken seitlich",s:20,side:true,how:"Ohr langsam Richtung Schulter sinken lassen. Schultern bleiben locker unten."},
    {name:"Katze-Kuh",s:45,how:"Vierfüßlerstand. Rücken im Atemrhythmus rund machen und sanft durchhängen lassen."},
    {name:"Brustöffner",s:30,how:"Im Stand Hände hinter dem Rücken verschränken, Schulterblätter zusammen, Brust leicht heben."},
    {name:"Seitdehnung im Stand",s:20,side:true,how:"Einen Arm über den Kopf strecken und den Oberkörper sanft zur Seite neigen."},
    {name:"Vorbeuge im Sitzen",s:45,how:"Beine lang nach vorne, Knie dürfen gebeugt sein. Mit geradem Rücken nach vorne neigen."},
    {name:"Liegender Drehsitz",s:30,side:true,how:"Rückenlage, ein Knie zur anderen Seite sinken lassen, Blick zur Gegenseite, Schultern bleiben am Boden."},
    {name:"Kindhaltung",s:45,how:"Auf die Fersen setzen, Arme lang nach vorne, ruhig atmen."}
  ]},
  hips:{label:"Hüfte & Rücken",level:"Mittel",steps:[
    {name:"Knie zur Brust",s:45,how:"Rückenlage, beide Knie umfassen und sanft zur Brust ziehen. Unterer Rücken entspannt."},
    {name:"Figur-4 (Po)",s:40,side:true,how:"Rückenlage, Knöchel aufs andere Knie legen, das untere Bein zur Brust ziehen."},
    {name:"Schmetterling",s:45,how:"Sitzen, Fußsohlen zusammen, Knie sinken lassen. Aufrecht bleiben, nicht drücken."},
    {name:"Hüftbeuger im Ausfallschritt",s:40,side:true,how:"Hinteres Knie am Boden, Po anspannen, Hüfte nach vorne schieben."},
    {name:"Katze-Kuh",s:45,how:"Vierfüßlerstand, Wirbelsäule im Atemrhythmus rund und lang machen."},
    {name:"Liegender Drehsitz",s:40,side:true,how:"Rückenlage, Knie zur Seite sinken lassen, Schultern bleiben am Boden."},
    {name:"Kindhaltung",s:60,how:"Auf die Fersen setzen, Arme lang, in den unteren Rücken atmen."}
  ]},
  mobility:{label:"Beweglichkeit",level:"Schwer",steps:[
    {name:"Tiefe Hocke",s:45,how:"Füße schulterbreit, so tief wie möglich hocken, Fersen am Boden (sonst etwas unterlegen). Ellbogen schieben die Knie sanft nach außen."},
    {name:"Weltbeste Dehnung",s:40,side:true,how:"Tiefer Ausfallschritt, gleiche Hand innen neben den Fuß, dann den anderen Arm zur Decke aufdrehen."},
    {name:"Taube",s:45,side:true,how:"Vorderes Bein angewinkelt vor dem Körper, hinteres lang nach hinten. Hüfte gerade, Oberkörper langsam absenken."},
    {name:"Couch-Stretch",s:40,side:true,how:"Hinteres Knie an der Wand oder am Sofa, Fußrücken hoch angelehnt, vorderer Fuß aufgestellt. Po anspannen, aufrichten."},
    {name:"Grätsche vorbeugen",s:45,how:"Im Sitzen Beine weit grätschen, Zehen zur Decke, mit geradem Rücken nach vorne laufen."},
    {name:"Schulter über Kopf",s:30,side:true,how:"Unterarm über Kopf an den Türrahmen, Brust sanft nach vorne durchschieben."},
    {name:"Brücke (Wirbelsäule)",s:30,how:"Rückenlage, Füße aufgestellt, Hüfte hoch und Brust Richtung Kinn schieben. Nur wenn es sich gut anfühlt."}
  ]}
};
const STRETCH_PREP = 5;

let stretchKey = "after";
let stretchPlan = [];
let stretchIndex = 0;
let stretchLeft = 0;
let stretchPhase = "prep";
let stretchTimer = null;
let stretchPaused = false;
let stretchWake = null;
let stretchDoneKey = null;

function stretchMessage(text) { $("stretchMessage").textContent = text || ""; }

function expandStretch(key) {
  const out = [];
  STRETCH_ROUTINES[key].steps.forEach(step => {
    if(step.side) {
      out.push({...step,name:step.name+" – links"});
      out.push({...step,name:step.name+" – rechts"});
    } else {
      out.push(step);
    }
  });
  return out;
}

function stretchMinutes(key) {
  const plan = expandStretch(key);
  const seconds = plan.reduce((sum,s) => sum+s.s+STRETCH_PREP,0);
  return Math.max(1,Math.round(seconds/60));
}

function mmss(seconds) {
  return Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
}

function renderStretchPicker() {
  const box = $("stretchPick");
  box.replaceChildren();
  Object.entries(STRETCH_ROUTINES).forEach(([key,r]) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "stretchPick";
    input.value = key;
    input.checked = key===stretchKey;
    input.disabled = !!stretchTimer;
    input.addEventListener("change",() => {
      stretchKey = key;
      renderStretchPreview();
    });
    const span = document.createElement("span");
    span.textContent = r.label;
    span.style.padding = "10px 14px";
    label.append(input,span);
    box.append(label);
  });
  renderStretchPreview();
}

function renderStretchPreview() {
  const r = STRETCH_ROUTINES[stretchKey];
  $("stretchInfo").textContent =
    r.level+" · ca. "+stretchMinutes(stretchKey)+" Minuten · "+r.steps.length+" Übungen";
  const list = $("stretchList");
  list.replaceChildren();
  r.steps.forEach(step => {
    const li = document.createElement("li");
    li.textContent = step.name+" – "+step.s+" Sek."+(step.side ? " je Seite" : "");
    list.append(li);
  });
}

function showStretchStep() {
  const step = stretchPlan[stretchIndex];
  const prep = stretchPhase==="prep";
  $("stretchStep").classList.toggle("prep",prep);
  $("stretchCount").textContent = prep
    ? "Gleich – Übung "+(stretchIndex+1)+" von "+stretchPlan.length
    : "Übung "+(stretchIndex+1)+" von "+stretchPlan.length+" · halten";
  $("stretchName").textContent = step.name;
  $("stretchHow").textContent = step.how;
  $("stretchTime").textContent = mmss(stretchLeft);
  const total = prep ? STRETCH_PREP : step.s;
  $("stretchBar").style.width = (100*(1-stretchLeft/total))+"%";
}

function buzz(pattern) {
  try { if(navigator.vibrate) navigator.vibrate(pattern); } catch(_e) {}
}

async function keepAwake(on) {
  try {
    if(on && "wakeLock" in navigator && !stretchWake) {
      stretchWake = await navigator.wakeLock.request("screen");
    } else if(!on && stretchWake) {
      await stretchWake.release();
      stretchWake = null;
    }
  } catch(_e) { stretchWake = null; }
}

function stretchTick() {
  if(stretchPaused) return;
  stretchLeft -= 1;
  if(stretchLeft>0) { showStretchStep(); return; }

  if(stretchPhase==="prep") {
    stretchPhase = "hold";
    stretchLeft = stretchPlan[stretchIndex].s;
    buzz(150);
    showStretchStep();
    return;
  }
  nextStretch();
}

function nextStretch() {
  stretchIndex += 1;
  if(stretchIndex>=stretchPlan.length) {
    finishStretch();
    return;
  }
  stretchPhase = "prep";
  stretchLeft = STRETCH_PREP;
  buzz([100,80,100]);
  showStretchStep();
}

function setStretchView(view) {
  $("stretchPreview").classList.toggle("hidden",view!=="preview");
  $("stretchRun").classList.toggle("hidden",view!=="run");
  $("stretchDone").classList.toggle("hidden",view!=="done");
}

function startStretch(key) {
  if(STRETCH_ROUTINES[key]) stretchKey = key;
  stopStretchTimer();
  stretchPlan = expandStretch(stretchKey);
  stretchIndex = 0;
  stretchPhase = "prep";
  stretchLeft = STRETCH_PREP;
  stretchPaused = false;
  stretchDoneKey = null;
  $("stretchPause").textContent = "Pause";
  stretchMessage("");
  setStretchView("run");
  showStretchStep();
  stretchTimer = setInterval(stretchTick,1000);
  keepAwake(true);
  renderStretchPicker();
}

function stopStretchTimer() {
  clearInterval(stretchTimer);
  stretchTimer = null;
  keepAwake(false);
}

function finishStretch() {
  stopStretchTimer();
  buzz([200,100,200,100,300]);
  stretchDoneKey = stretchKey;
  setStretchView("done");
  renderStretchPicker();
}

function resetStretch() {
  stopStretchTimer();
  stretchDoneKey = null;
  stretchMessage("");
  setStretchView("preview");
  renderStretchPicker();
}

$("stretchStart").addEventListener("click",() => startStretch(stretchKey));
$("stretchPause").addEventListener("click",() => {
  stretchPaused = !stretchPaused;
  $("stretchPause").textContent = stretchPaused ? "Fortsetzen" : "Pause";
  $("stretchCount").textContent = stretchPaused
    ? "Pausiert"
    : $("stretchCount").textContent;
  if(!stretchPaused) showStretchStep();
});
$("stretchSkip").addEventListener("click",() => {
  if(stretchPhase==="prep") {
    stretchPhase = "hold";
    stretchLeft = stretchPlan[stretchIndex].s;
    showStretchStep();
  } else {
    nextStretch();
  }
});
$("stretchStop").addEventListener("click",resetStretch);

$("stretchLog").addEventListener("click",async () => {
  if(!currentUserId || !stretchDoneKey) return;
  const button = $("stretchLog");
  button.disabled = true;
  try {
    const r = STRETCH_ROUTINES[stretchDoneKey];
    const {error} = await supabase.from("workout_entries").insert({
      user_id:currentUserId,
      entry_date:localDate(),
      exercise:("Dehnen: "+r.label+" (Minuten)").slice(0,120),
      sets:1,
      reps:stretchMinutes(stretchDoneKey),
      weight_kg:null,
      notes:"Dehnen · "+r.level
    });
    if(error) throw error;
    if($("trainingDate").value===localDate()) loadTraining();
    stretchDoneKey = null;
    setStretchView("preview");
    stretchMessage("✓ Im Trainingstagebuch gespeichert.");
  } catch(error) {
    stretchMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});

$("caliStretch").addEventListener("click",() => {
  startStretch("after");
  $("stretchCard").scrollIntoView({behavior:"smooth",block:"start"});
});

document.addEventListener("visibilitychange",() => {
  if(document.visibilityState==="visible" && stretchTimer) keepAwake(true);
});

renderStretchPicker();
