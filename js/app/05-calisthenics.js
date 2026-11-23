// VYORA AI – Calisthenics-Programm
// Teil 5 von 18. Alle Teile teilen sich einen gemeinsamen Bereich
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

function renderCaliExercises(workout) {
  const box = $("caliExercises");
  box.replaceChildren();

  caliWorkout(workout).forEach(key => {
    const pattern = CALI_PATTERNS[key];
    const index = levelOf(key);
    const level = pattern.levels[index];
    const unit = pattern.unit==="s" ? "Sek." : "Wdh.";

    const item = document.createElement("div");
    item.className = "cx";
    item.dataset.key = key;

    const head = document.createElement("div");
    head.className = "cx-head";
    const title = document.createElement("div");
    const small = document.createElement("span");
    small.className = "cx-pattern";
    small.textContent = pattern.name;
    const name = document.createElement("strong");
    name.textContent = level.name;
    title.append(small,name);

    const control = document.createElement("div");
    control.className = "cx-level";
    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "▼";
    down.disabled = index===0;
    down.setAttribute("aria-label","Leichtere Stufe: "+pattern.name);
    const label = document.createElement("span");
    label.textContent = "Stufe "+(index+1)+"/"+pattern.levels.length;
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "▲";
    up.disabled = index===pattern.levels.length-1;
    up.setAttribute("aria-label","Schwerere Stufe: "+pattern.name);
    down.addEventListener("click",() => changeLevel(key,-1));
    up.addEventListener("click",() => changeLevel(key,1));
    control.append(down,label,up);
    head.append(title,control);

    const target = document.createElement("div");
    target.className = "cx-target";
    target.textContent =
      caliSets()+" × "+level.min+"–"+level.max+" "+unit;

    const how = document.createElement("p");
    how.className = "cx-how";
    how.textContent = level.how;

    const row = document.createElement("div");
    row.className = "cx-input";
    const inputId = "cali-"+key;
    const inputLabel = document.createElement("label");
    inputLabel.htmlFor = inputId;
    inputLabel.textContent = "Geschafft im schwächsten Satz ("+unit+")";
    const input = document.createElement("input");
    input.id = inputId;
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "0";
    input.max = "300";
    input.step = "1";
    input.placeholder = String(level.min);
    row.append(inputLabel,input);

    item.append(head,target,how,row);

    // Aufstiegs-Vorschlag
    const streak = Number(program.streaks?.[key])||0;
    if(streak>=2 && index<pattern.levels.length-1) {
      const tip = document.createElement("div");
      tip.className = "cx-tip";
      const text = document.createElement("span");
      text.textContent =
        "🎉 Zweimal das Ziel geschafft! Bereit für: "+
        pattern.levels[index+1].name;
      const go = document.createElement("button");
      go.type = "button";
      go.textContent = "Aufsteigen";
      go.addEventListener("click",() => changeLevel(key,1));
      tip.append(text,go);
      item.append(tip);
    }

    box.append(item);
  });
}

async function saveProgram(changes) {
  const next = {...program,...changes};
  const {error} = await supabase
    .from("training_program")
    .upsert({
      user_id:currentUserId,
      program:"calisthenics-"+(CALI_DIFF[next.difficulty] ? next.difficulty : "mittel"),
      days:next.days,
      levels:next.levels,
      streaks:next.streaks,
      next_workout:next.next_workout,
      started_at:next.started_at,
      updated_at:new Date().toISOString()
    },{onConflict:"user_id"});
  if(error) throw error;
  program = next;
}

async function changeDifficulty(key) {
  if(!program || !CALI_DIFF[key] || key===caliDiffKey()) return;
  const before = program;
  try {
    await saveProgram({difficulty:key});
    stopRest(false);
    caliMessage("✓ Schwierigkeit: "+CALI_DIFF[key].label+". Deine Stufen bleiben, wie sie sind.");
    renderProgram();
  } catch(error) {
    program = before;
    caliMessage("Speichern fehlgeschlagen: "+error.message);
    renderProgram();
  }
}

async function changeLevel(key,step) {
  if(!program) return;
  const max = CALI_PATTERNS[key].levels.length-1;
  const value = Math.min(max,Math.max(0,levelOf(key)+step));
  try {
    await saveProgram({
      levels:{...program.levels,[key]:value},
      streaks:{...program.streaks,[key]:0}
    });
    caliMessage("");
    renderProgram();
  } catch(error) {
    caliMessage("Stufe konnte nicht gespeichert werden: "+error.message);
  }
}

async function loadCaliWeek() {
  if(!currentUserId) return;
  const dates = weekDates();
  const {data,error} = await supabase
    .from("workout_entries")
    .select("entry_date,notes")
    .eq("user_id",currentUserId)
    .gte("entry_date",dayString(dates[0]));
  if(error) throw error;
  caliWeekDone = new Set(
    (data||[])
      .filter(x => String(x.notes||"").startsWith("Calisthenics"))
      .map(x => x.entry_date)
  );
}

async function loadProgram() {
  if(!currentUserId) return;
  const requestId = ++programLoadCounter;
  const userId = currentUserId;

  try {
    const {data,error} = await supabase
      .from("training_program")
      .select("program,days,levels,streaks,next_workout,started_at")
      .eq("user_id",userId)
      .maybeSingle();

    if(requestId!==programLoadCounter || userId!==currentUserId) return;
    if(error) throw error;

    program = data ? {
      days:(Array.isArray(data.days) ? data.days : [1,3,5]).map(Number),
      levels:data.levels || {},
      streaks:data.streaks || {},
      next_workout:data.next_workout==="B" ? "B" : "A",
      started_at:data.started_at,
      // ältere Programme ("calisthenics-basis") gelten als "mittel"
      difficulty:(CALI_DIFF[String(data.program||"").replace("calisthenics-","")]
        ? String(data.program).replace("calisthenics-","")
        : "mittel")
    } : null;

    if(program) await loadCaliWeek();
    if(requestId!==programLoadCounter) return;
    renderProgram();
  } catch(error) {
    if(requestId===programLoadCounter) {
      caliMessage("Programm konnte nicht geladen werden: "+error.message);
    }
  }
}

$("caliStartButton").addEventListener("click",async () => {
  if(!currentUserId) return;
  const days = selectedDays();
  if(!days.length) {
    caliMessage("Bitte mindestens einen Trainingstag wählen.");
    return;
  }

  const diff = CALI_DIFF[caliSetupDiff] ? caliSetupDiff : "leicht";
  const button = $("caliStartButton");
  button.disabled = true;

  // Beim Ändern der Tage bleibt der Fortschritt erhalten.
  const existing = program;

  try {
    program = existing || {
      levels:{...CALI_DIFF[diff].start},
      difficulty:diff,
      streaks:{},
      next_workout:"A",
      started_at:localDate()
    };
    await saveProgram({days});
    await loadCaliWeek().catch(() => {});
    setSetupMode(false);
    caliMessage(existing
      ? "✓ Trainingstage gespeichert."
      : "✓ Programm gestartet. Viel Spaß beim ersten Training!");
    renderProgram();
  } catch(error) {
    program = existing;
    caliMessage("Speichern fehlgeschlagen: "+error.message);
    renderProgram();
  } finally {
    button.disabled = false;
  }
});

$("caliDaysEdit").addEventListener("click",() => {
  if(!program) return;
  renderDayPicker(program.days);
  setSetupMode(true);
  $("caliSetup").classList.remove("hidden");
  $("caliRun").classList.add("hidden");
});

$("caliAnyway").addEventListener("click",() => {
  caliForceToday = true;
  renderProgram();
});

$("caliSave").addEventListener("click",async () => {
  if(!program || !currentUserId) return;
  const workout = program.next_workout==="B" ? "B" : "A";
  const keys = caliWorkout(workout);
  const results = [];

  for(const key of keys) {
    const raw = $("cali-"+key).value.trim();
    if(raw==="") continue;
    const value = Math.round(Number(raw));
    if(!Number.isFinite(value) || value<0 || value>300) {
      caliMessage("Bitte gültige Zahlen eintragen (0 bis 300).");
      return;
    }
    if(value>0) results.push({key,value});
  }

  if(!results.length) {
    caliMessage("Trag bei mindestens einer Übung ein, wie viele du geschafft hast.");
    return;
  }

  const button = $("caliSave");
  button.disabled = true;
  caliMessage("Training wird gespeichert ...");

  try {
    const today = localDate();
    const rows = results.map(({key,value}) => {
      const pattern = CALI_PATTERNS[key];
      const index = levelOf(key);
      return {
        user_id:currentUserId,
        entry_date:today,
        exercise:(pattern.levels[index].name+
          (pattern.unit==="s" ? " (Sekunden)" : "")).slice(0,120),
        sets:caliSets(),
        reps:value,
        weight_kg:null,
        notes:"Calisthenics "+workout+" · Stufe "+(index+1)
      };
    });

    const {error} = await supabase
      .from("workout_entries")
      .insert(rows);
    if(error) throw error;

    // Fortschritt: obere Zahl geschafft -> Serie +1,
    // sonst Serie zurück auf 0.
    const streaks = {...program.streaks};
    const hints = [];
    for(const {key,value} of results) {
      const level = CALI_PATTERNS[key].levels[levelOf(key)];
      streaks[key] = value>=level.max ? (Number(streaks[key])||0)+1 : 0;
      if(value<level.min && levelOf(key)>0) {
        hints.push(CALI_PATTERNS[key].name);
      }
    }

    await saveProgram({
      streaks,
      next_workout:workout==="A" ? "B" : "A"
    });

    caliWeekDone.add(today);
    caliForceToday = false;
    renderProgram();

    if($("trainingDate").value===today) loadTraining();

    caliMessage(
      "✓ Training "+workout+" gespeichert." +
      (hints.length
        ? " Tipp: Bei "+hints.join(", ")+" ruhig eine Stufe zurück (▼) – sauber ist besser als schwer."
        : "")
    );
  } catch(error) {
    caliMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});

// Pausentimer (90 Sekunden, Vibration am Ende)
let restTimerId = null;

function showRest(seconds) {
  const m = Math.floor(seconds/60);
  const s = String(seconds%60).padStart(2,"0");
  $("restTime").textContent = m+":"+s;
}

function stopRest(done) {
  clearInterval(restTimerId);
  restTimerId = null;
  $("restTimer").classList.remove("running");
  $("restButton").textContent = "Pause starten";
  showRest(caliDiff().rest);
  if(done) {
    if(navigator.vibrate) navigator.vibrate([200,100,200]);
    caliMessage("⏱ Pause vorbei – nächster Satz!");
  }
}

$("restButton").addEventListener("click",() => {
  if(restTimerId) {
    stopRest(false);
    return;
  }
  const seconds = caliDiff().rest;
  const end = Date.now()+seconds*1000;
  $("restTimer").classList.add("running");
  $("restButton").textContent = "Stopp";
  showRest(seconds);
  restTimerId = setInterval(() => {
    const left = Math.max(0,Math.round((end-Date.now())/1000));
    showRest(left);
    if(left<=0) stopRest(true);
  },250);
});

renderProgram();
