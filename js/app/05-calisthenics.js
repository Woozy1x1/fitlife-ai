// VYORA AI – Calisthenics: Programm, Schwierigkeit, Wochentage
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Calisthenics-Programm
// Stufen je Bewegung, von leicht nach schwer.
// unit "s" = Sekunden halten, sonst Wiederholungen.
// -----------------------------------

const CALI_PATTERNS = {
  push:{name:"Drücken",levels:[
    {name:"Wand-Liegestütze",min:8,max:15,how:"Hände schulterbreit an die Wand, Körper gerade wie ein Brett. Brust langsam zur Wand, dann wegdrücken."},
    {name:"Schräg-Liegestütze",min:8,max:12,how:"Hände auf eine stabile Arbeitsplatte oder Bank. Je niedriger die Ablage, desto schwerer."},
    {name:"Knie-Liegestütze",min:6,max:12,how:"Auf den Knien, Hände etwas breiter als die Schultern. Knie, Hüfte und Schultern bilden eine Linie."},
    {name:"Liegestütze",min:5,max:12,how:"Körper gestreckt, Bauch fest. Brust bis knapp über den Boden, Ellbogen etwa 45° vom Körper."},
    {name:"Enge Liegestütze",min:6,max:12,how:"Hände unter den Schultern, Ellbogen eng am Körper – trainiert stärker den Trizeps."},
    {name:"Archer-Liegestütze (je Seite)",min:3,max:8,how:"Hände sehr breit, zu einer Seite absenken, der andere Arm bleibt fast gestreckt."}
  ]},
  pull:{name:"Ziehen",levels:[
    {name:"Türrahmen-Rudern (je Arm)",min:8,max:15,how:"Türrahmen mit einer Hand greifen, Füße nah am Rahmen, nach hinten lehnen und dich heranziehen."},
    {name:"Rudern an hoher Stange",min:6,max:12,how:"Stabile Stange auf Brusthöhe (z. B. Spielplatz). Körper steil, Brust zur Stange ziehen."},
    {name:"Rudern an hüfthoher Stange",min:6,max:12,how:"Wie vorher, aber Stange tiefer – der Körper ist flacher und muss mehr ziehen."},
    {name:"Negative Klimmzüge",min:3,max:6,how:"Mit Hilfe (Stuhl) oben starten, dann 4–5 Sekunden kontrolliert ablassen."},
    {name:"Klimmzüge",min:3,max:8,how:"Aus dem Hang hochziehen, bis das Kinn über der Stange ist. Langsam ablassen."}
  ]},
  legs:{name:"Beine",levels:[
    {name:"Stuhl-Kniebeugen",min:8,max:15,how:"Vor einen Stuhl stellen, langsam hinsetzen, kurz antippen, wieder aufstehen. Knie zeigen in Richtung Zehen."},
    {name:"Kniebeugen",min:10,max:20,how:"Füße schulterbreit, Gewicht auf den Fersen, so tief wie bequem möglich, Rücken gerade."},
    {name:"Ausfallschritte rückwärts (je Bein)",min:6,max:12,how:"Einen großen Schritt nach hinten, hinteres Knie Richtung Boden, vorderes Bein drückt hoch. Festhalten ist erlaubt."},
    {name:"Bulgarische Split Squats (je Bein)",min:6,max:12,how:"Hinterer Fuß auf einem Stuhl, vorderes Bein beugt sich tief."},
    {name:"Pistol Squats mit Halt (je Bein)",min:3,max:8,how:"Auf einem Bein in die Hocke, dabei am Türrahmen festhalten."}
  ]},
  core:{name:"Rumpf",unit:"s",levels:[
    {name:"Knie-Plank",min:15,max:30,how:"Unterarme und Knie am Boden, Bauch fest, Rücken gerade. Sekunden halten."},
    {name:"Plank",min:20,max:45,how:"Auf Unterarmen und Zehen, Körper wie ein Brett. Nicht ins Hohlkreuz fallen."},
    {name:"Hollow Hold (Knie angezogen)",min:15,max:30,how:"Rückenlage, unterer Rücken drückt in den Boden, Schultern und angezogene Beine leicht anheben."},
    {name:"Hollow Hold",min:15,max:30,how:"Wie vorher, aber Beine gestreckt und Arme über dem Kopf."}
  ]},
  hinge:{name:"Hüfte & Po",levels:[
    {name:"Glute Bridge",min:10,max:20,how:"Rückenlage, Füße aufgestellt. Hüfte hochdrücken, oben kurz halten, langsam ablassen."},
    {name:"Einbeinige Glute Bridge (je Bein)",min:6,max:12,how:"Wie die Glute Bridge, aber ein Bein ist gestreckt in der Luft."},
    {name:"Einbeiniger Hip Thrust (je Bein)",min:6,max:12,how:"Schultern auf dem Sofa, ein Fuß am Boden, Hüfte hochdrücken."}
  ]}
};

const CALI_WORKOUTS = {
  A:["push","pull","legs","core"],
  B:["legs","push","pull","hinge"]
};
// Schwierigkeit: bestimmt Sätze, Pause, Zusatzübung und Startstufen.
// Die Stufen je Übung bleiben beim Wechsel erhalten.
const CALI_DIFF = {
  leicht:{label:"Leicht",sets:2,rest:60,extra:false,minutes:"15–20",
    start:{push:0,pull:0,legs:0,core:0,hinge:0},
    info:"2 Sätze pro Übung, 60 Sek. Pause, ca. 15–20 Minuten. Sanfter Einstieg mit den leichtesten Stufen."},
  mittel:{label:"Mittel",sets:3,rest:90,extra:false,minutes:"25–35",
    start:{push:2,pull:1,legs:1,core:1,hinge:0},
    info:"3 Sätze pro Übung, 90 Sek. Pause, ca. 25–35 Minuten. Für alle, die schon ein bisschen Sport machen."},
  schwer:{label:"Schwer",sets:4,rest:120,extra:true,minutes:"40–50",
    start:{push:3,pull:2,legs:2,core:1,hinge:1},
    info:"4 Sätze pro Übung, 2 Min. Pause, eine Zusatzübung, ca. 40–50 Minuten. Wenn du regelmäßig trainierst."}
};

function caliDiffKey() {
  return CALI_DIFF[program?.difficulty] ? program.difficulty : "mittel";
}
function caliDiff() { return CALI_DIFF[caliDiffKey()]; }
function caliSets() { return caliDiff().sets; }

function caliWorkout(workout) {
  const base = CALI_WORKOUTS[workout];
  return caliDiff().extra
    ? [...base, workout==="A" ? "hinge" : "core"]
    : base;
}

function renderDiffPicker(boxId,infoId,selected,onChange) {
  const box = $(boxId);
  box.replaceChildren();
  Object.entries(CALI_DIFF).forEach(([key,d]) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = boxId;
    input.value = key;
    input.checked = key===selected;
    input.addEventListener("change",() => onChange(key));
    const span = document.createElement("span");
    span.textContent = d.label;
    span.style.padding = "10px 16px";
    label.append(input,span);
    box.append(label);
  });
  $(infoId).textContent = CALI_DIFF[selected].info;
}

let caliSetupDiff = "leicht";
const WEEKDAYS = ["Mo","Di","Mi","Do","Fr","Sa","So"];

let program = null;        // gespeicherter Stand
let programLoadCounter = 0;
let caliWeekDone = new Set();
let caliForceToday = false;

function caliMessage(text) {
  $("caliMessage").textContent = text || "";
}

// 1 = Montag ... 7 = Sonntag
function isoWeekday(date) {
  const d = date.getDay();
  return d===0 ? 7 : d;
}

function dayString(date) {
  return date.getFullYear()+"-"+
    String(date.getMonth()+1).padStart(2,"0")+"-"+
    String(date.getDate()).padStart(2,"0");
}

function weekDates() {
  const now = new Date();
  now.setHours(12,0,0,0);
  const monday = new Date(now);
  monday.setDate(now.getDate()-(isoWeekday(now)-1));
  return Array.from({length:7},(_,i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate()+i);
    return d;
  });
}

function levelOf(key) {
  const max = CALI_PATTERNS[key].levels.length-1;
  const value = Math.round(Number(program?.levels?.[key]));
  return Number.isFinite(value) ? Math.min(max,Math.max(0,value)) : 0;
}

function renderDayPicker(selected) {
  const box = $("caliDays");
  box.replaceChildren();
  WEEKDAYS.forEach((name,index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = String(index+1);
    input.checked = selected.includes(index+1);
    input.setAttribute("aria-label",name);
    const span = document.createElement("span");
    span.textContent = name;
    label.append(input,span);
    box.append(label);
  });
}

function selectedDays() {
  return [...$("caliDays").querySelectorAll("input:checked")]
    .map(input => Number(input.value));
}

// Beim Ändern der Tage wird das Startniveau nicht gebraucht.
function setSetupMode(editing) {
  $("caliStartButton").textContent = editing
    ? "Trainingstage speichern"
    : "Programm starten";
  ["caliDiffHead","caliDiffSetup","caliDiffSetupInfo"].forEach(id =>
    $(id).classList.toggle("hidden",editing));
}

function resetProgram() {
  caliSetupDiff = "leicht";
  setSetupMode(false);
  $("caliDays").replaceChildren();
  program = null;
  ++programLoadCounter;
  caliWeekDone = new Set();
  caliForceToday = false;
  caliMessage("");
  renderProgram();
}

function renderProgram() {
  const has = !!program;
  $("caliSetup").classList.toggle("hidden",has);
  $("caliRun").classList.toggle("hidden",!has);

  if(!has) {
    if(!$("caliDays").children.length) renderDayPicker([1,3,5]);
    renderDiffPicker("caliDiffSetup","caliDiffSetupInfo",caliSetupDiff,key => {
      caliSetupDiff = key;
      $("caliDiffSetupInfo").textContent = CALI_DIFF[key].info;
    });
    return;
  }

  renderDiffPicker("caliDiffRun","caliDiffRunInfo",caliDiffKey(),changeDifficulty);
  if(!restTimerId) showRest(caliDiff().rest);

  // Wochenleiste
  const today = localDate();
  const week = $("caliWeek");
  week.replaceChildren();
  weekDates().forEach((date,index) => {
    const day = dayString(date);
    const cell = document.createElement("div");
    cell.className = "week-day";
    const planned = program.days.includes(index+1);
    if(planned) cell.classList.add("plan");
    if(caliWeekDone.has(day)) cell.classList.add("done");
    if(day===today) cell.classList.add("today");
    cell.textContent = WEEKDAYS[index];
    const mark = document.createElement("b");
    mark.textContent = caliWeekDone.has(day) ? "✓" : planned ? "●" : "·";
    cell.append(mark);
    cell.title = caliWeekDone.has(day)
      ? "Trainiert"
      : planned ? "Trainingstag" : "Pause";
    week.append(cell);
  });

  const isPlanned = program.days.includes(isoWeekday(new Date()));
  const doneToday = caliWeekDone.has(today);
  const showSession = (isPlanned || caliForceToday) && !doneToday;
  const workout = program.next_workout==="B" ? "B" : "A";

  $("caliToday").textContent = doneToday
    ? "✓ Heute erledigt – stark! Als Nächstes kommt Training "+workout+"."
    : showSession
      ? "Heute: Training "+workout+" · "+caliSets()+" Sätze pro Übung · ca. "+caliDiff().minutes+" Minuten"
      : "Heute ist Pause. Muskeln werden in der Erholung stärker. "+
        "Optional: 20–30 Minuten spazieren gehen und 10 Minuten dehnen.";

  $("caliSession").classList.toggle("hidden",!showSession);
  $("caliAnyway").classList.toggle("hidden",showSession || doneToday);
  $("caliStretch").classList.toggle("hidden",!(showSession || doneToday));

  if(showSession) renderCaliExercises(workout);
}
