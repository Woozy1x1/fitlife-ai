// VYORA AI – Calisthenics: Übungen, Speichern, Laden, Pausen-Timer
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

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
