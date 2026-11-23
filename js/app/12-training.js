// VYORA AI – Trainingstagebuch
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Trainingstagebuch
// -----------------------------------

function workoutMessage(text) {
  $("workoutMessage").textContent = text || "";
}

function optionalNumber(id,min,max,label,integer) {
  const raw = $(id).value.trim();
  if(raw==="") return null;

  const value = Number(raw.replace(",","."));

  if(
    !Number.isFinite(value) ||
    value<min || value>max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      label+": bitte einen Wert zwischen "+
      min+" und "+max+" eingeben."
    );
  }
  return value;
}

function deleteButton(label,onClick) {
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "Löschen";
  del.setAttribute("aria-label",label);
  del.addEventListener("click",onClick);
  return del;
}

function renderExerciseSuggestions(extra) {
  const names = new Set(DEFAULT_EXERCISES);
  (extra||[]).forEach(n => n && names.add(n));

  const list = $("exerciseSuggestions");
  list.replaceChildren();

  [...names].sort((a,b)=>a.localeCompare(b,"de"))
    .forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      list.append(option);
    });
}

async function loadExerciseSuggestions() {
  if(!currentUserId) return;
  const userId = currentUserId;

  const {data,error} = await supabase
    .from("workout_entries")
    .select("exercise")
    .eq("user_id",userId)
    .order("created_at",{ascending:false})
    .limit(200);

  if(error || currentUserId!==userId) return;
  renderExerciseSuggestions((data||[]).map(x=>x.exercise));
}

function workoutLine(item) {
  return item.sets+" × "+item.reps+
    (item.weight_kg!==null && item.weight_kg!==undefined
      ? " · "+number(item.weight_kg)+" kg"
      : " · Körpergewicht");
}

function renderTraining() {
  const sets = workoutData.reduce(
    (t,x)=>t+Number(x.sets||0),0
  );
  const volume = workoutData.reduce(
    (t,x)=>t+Number(x.sets||0)*Number(x.reps||0)*
      Number(x.weight_kg||0),0
  );

  $("totalExercises").textContent = workoutData.length;
  $("totalSets").textContent = sets;
  $("totalVolume").textContent = number(volume);

  if($("trainingDate").value===localDate()) {
    $("homeTraining").textContent = workoutData.length
      ? workoutData.length
      : "–";
    $("homeTrainingInfo").textContent = workoutData.length
      ? (workoutData.length===1 ? "Übung" : "Übungen")+
        " · "+sets+" Sätze"
      : "Noch nichts eingetragen";
  }

  const list = $("workoutList");
  list.replaceChildren();

  if(!workoutData.length) {
    list.textContent =
      "Für dieses Datum sind noch keine Übungen gespeichert.";
    return;
  }

  workoutData.forEach(item => {
    const row = document.createElement("div");
    row.className = "meal-row";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.exercise;

    const details = document.createElement("small");
    details.textContent = workoutLine(item)+
      (item.notes ? " · "+item.notes : "");

    info.append(title,details);

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const again = document.createElement("button");
    again.type = "button";
    again.textContent = "Nochmal";
    again.classList.add("soft-btn");
    again.setAttribute(
      "aria-label","Übung als Vorlage nehmen: "+item.exercise
    );
    again.addEventListener("click",() => {
      $("exercise").value = item.exercise;
      $("sets").value = item.sets;
      $("reps").value = item.reps;
      $("weight").value = item.weight_kg ?? "";
      showLastTime();
      $("workoutForm").scrollIntoView({behavior:"smooth"});
    });

    actions.append(
      again,
      deleteButton(
        "Übung löschen: "+item.exercise,
        () => deleteWorkout(item.id)
      )
    );

    row.append(info,actions);
    list.append(row);
  });
}

async function loadTraining() {
  if(!currentUserId) return;

  const requestId = ++workoutLoadCounter;
  const userId = currentUserId;
  const date = $("trainingDate").value;

  workoutMessage("Übungen werden geladen ...");

  const {data,error} = await supabase
    .from("workout_entries")
    .select("id,exercise,sets,reps,weight_kg,notes,entry_date,created_at")
    .eq("user_id",userId)
    .eq("entry_date",date)
    .order("created_at",{ascending:true});

  if(
    currentUserId!==userId ||
    $("trainingDate").value!==date ||
    requestId!==workoutLoadCounter
  ) return;

  if(error) {
    workoutMessage("Laden fehlgeschlagen: "+error.message);
    return;
  }

  workoutData = data||[];
  renderTraining();
  scheduleInsights();
  workoutMessage("");
  vyEmit("training");
}

// Zeigt, was du bei dieser Übung zuletzt
// (vor dem gewählten Datum) gemacht hast.
async function showLastTime() {
  const name = $("exercise").value.trim();
  const info = $("lastTimeInfo");
  const requestId = ++lastTimeCounter;

  if(!name || !currentUserId) {
    info.textContent = "";
    return;
  }

  const {data,error} = await supabase
    .from("workout_entries")
    .select("sets,reps,weight_kg,entry_date")
    .eq("user_id",currentUserId)
    .ilike("exercise",name.replace(/[%_\\]/g,"\\$&"))
    .lt("entry_date",$("trainingDate").value)
    .order("entry_date",{ascending:false})
    .order("created_at",{ascending:false})
    .limit(1);

  if(requestId!==lastTimeCounter) return;

  if(error || !data || !data.length) {
    info.textContent = "";
    return;
  }

  info.textContent = "Letztes Mal ("+
    formatDate(data[0].entry_date)+"): "+
    workoutLine(data[0]);
}

$("exercise").addEventListener("change",showLastTime);
$("trainingDate").addEventListener("change",() => {
  loadTraining();
  showLastTime();
});

$("workoutForm").addEventListener("submit",async event => {
  event.preventDefault();

  const button = $("saveWorkout");
  button.disabled = true;
  workoutMessage("Übung wird gespeichert ...");

  try {
    if(!currentUserId) throw new Error("Bitte erneut anmelden.");

    const exercise = $("exercise").value.trim();
    if(!exercise || exercise.length>120) {
      throw new Error("Bitte eine Übung eingeben.");
    }

    const sets = optionalNumber("sets",1,100,"Sätze",true);
    const reps = optionalNumber("reps",1,1000,"Wiederholungen",true);
    if(sets===null || reps===null) {
      throw new Error("Bitte Sätze und Wiederholungen eingeben.");
    }

    const weight = optionalNumber("weight",0,1000,"Gewicht",false);
    const notes = $("workoutNotes").value.trim().slice(0,500);

    const saved = await saveOrQueue("workout_entries",{
        user_id:currentUserId,
        entry_date:$("trainingDate").value,
        exercise,
        sets,
        reps,
        weight_kg:weight,
        notes:notes||null
      });

    // Übung, Sätze und Wdh. bleiben stehen,
    // damit man den nächsten Satz schnell erfassen kann.
    $("workoutNotes").value = "";
    if(saved.queued) { workoutMessage(OFFLINE_MSG); return; }

    await loadTraining();
    loadExerciseSuggestions();
    workoutMessage("✓ Übung gespeichert.");

  } catch(error) {
    workoutMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});

async function deleteWorkout(id) {
  if(!confirm("Diese Übung wirklich löschen?")) return;

  workoutMessage("Eintrag wird gelöscht ...");

  const {error} = await supabase
    .from("workout_entries")
    .delete()
    .eq("id",id)
    .eq("user_id",currentUserId);

  if(error) {
    workoutMessage("Löschen fehlgeschlagen: "+error.message);
    return;
  }

  await loadTraining();
  workoutMessage("✓ Eintrag gelöscht.");
}
