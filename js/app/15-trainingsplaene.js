// VYORA AI – Eigene Trainingspläne
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Trainingspläne
// -----------------------------------

const BUILTIN_PLANS = [
  { id:"builtin-a", name:"Anfänger Ganzkörper A (Calisthenics)", builtin:true,
    exercises:[
      {exercise:"Kniebeugen",sets:3,reps:12,weight_kg:null},
      {exercise:"Liegestütze",sets:3,reps:8,weight_kg:null},
      {exercise:"Australian Pull-ups",sets:3,reps:8,weight_kg:null},
      {exercise:"Plank (Sekunden)",sets:3,reps:30,weight_kg:null}
    ]},
  { id:"builtin-b", name:"Anfänger Ganzkörper B (Calisthenics)", builtin:true,
    exercises:[
      {exercise:"Ausfallschritte",sets:3,reps:10,weight_kg:null},
      {exercise:"Pike Push-ups",sets:3,reps:6,weight_kg:null},
      {exercise:"Dips",sets:3,reps:6,weight_kg:null},
      {exercise:"Beinheben",sets:3,reps:10,weight_kg:null}
    ]},
  { id:"builtin-c", name:"Push & Pull kurz", builtin:true,
    exercises:[
      {exercise:"Liegestütze",sets:4,reps:10,weight_kg:null},
      {exercise:"Klimmzüge",sets:4,reps:4,weight_kg:null},
      {exercise:"Dips",sets:3,reps:8,weight_kg:null},
      {exercise:"Rudern",sets:3,reps:10,weight_kg:null}
    ]}
];

let planData = [];
let planLoadCounter = 0;

function planMessage(text) {
  $("planMessage").textContent = text || "";
}

function cleanPlanExercises(list) {
  return (Array.isArray(list) ? list : [])
    .filter(x => x && typeof x.exercise==="string" && x.exercise.trim())
    .slice(0,30)
    .map(x => ({
      exercise:String(x.exercise).trim().slice(0,120),
      sets:Math.min(100,Math.max(1,Math.round(Number(x.sets)||1))),
      reps:Math.min(1000,Math.max(1,Math.round(Number(x.reps)||1))),
      weight_kg:x.weight_kg===null || x.weight_kg===undefined ||
        !Number.isFinite(Number(x.weight_kg))
        ? null : Math.min(1000,Math.max(0,Number(x.weight_kg)))
    }));
}

function renderPlans() {
  const list = $("planList");
  list.replaceChildren();

  [...planData, ...BUILTIN_PLANS].forEach(plan => {
    const exercises = cleanPlanExercises(plan.exercises);
    if(!exercises.length) return;

    const row = document.createElement("div");
    row.className = "meal-row";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = plan.name;
    const tag = document.createElement("small");
    tag.textContent = plan.builtin ? "Vorlage" : "Eigener Plan";
    const ex = document.createElement("span");
    ex.className = "plan-ex";
    ex.textContent = exercises.map(e =>
      e.exercise+" "+e.sets+"×"+e.reps).join(" · ");
    info.append(title,tag,ex);

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const start = document.createElement("button");
    start.type = "button";
    start.textContent = "Starten";
    start.classList.add("soft-btn");
    start.setAttribute("aria-label","Plan starten: "+plan.name);
    start.addEventListener("click",() => startPlan(plan.name,exercises));
    actions.append(start);

    if(!plan.builtin) {
      actions.append(deleteButton(
        "Plan löschen: "+plan.name,
        () => deletePlan(plan.id)
      ));
    }

    row.append(info,actions);
    list.append(row);
  });
}

async function loadPlans() {
  if(!currentUserId) return;
  const requestId = ++planLoadCounter;
  const userId = currentUserId;

  const {data,error} = await supabase
    .from("workout_plans")
    .select("id,name,exercises,created_at")
    .eq("user_id",userId)
    .order("created_at",{ascending:false});

  if(currentUserId!==userId || requestId!==planLoadCounter) return;

  if(error) {
    planMessage("Pläne konnten nicht geladen werden: "+error.message);
    planData = [];
  } else {
    planData = data || [];
  }
  renderPlans();
}

async function startPlan(name,exercises) {
  const date = $("trainingDate").value;
  if(!confirm(
    exercises.length+" Übungen aus „"+name+"“ für den "+
    formatDate(date)+" eintragen?"
  )) return;

  planMessage("Plan wird eingetragen ...");

  const {error} = await supabase
    .from("workout_entries")
    .insert(exercises.map(e => ({
      user_id:currentUserId,
      entry_date:date,
      exercise:e.exercise,
      sets:e.sets,
      reps:e.reps,
      weight_kg:e.weight_kg,
      notes:("Plan: "+name).slice(0,500)
    })));

  if(error) {
    planMessage("Eintragen fehlgeschlagen: "+error.message);
    return;
  }

  await loadTraining();
  loadExerciseSuggestions();
  planMessage("✓ Plan eingetragen. Passe die Werte bei Bedarf an.");
}

$("planForm").addEventListener("submit",async event => {
  event.preventDefault();

  const name = $("planName").value.trim();
  const exercises = cleanPlanExercises(workoutData);

  if(!name) {
    planMessage("Bitte einen Namen eingeben.");
    return;
  }
  if(!exercises.length) {
    planMessage("Trage zuerst Übungen für das gewählte Datum ein.");
    return;
  }

  $("savePlan").disabled = true;
  planMessage("Plan wird gespeichert ...");

  const {error} = await supabase
    .from("workout_plans")
    .insert({ user_id:currentUserId, name:name.slice(0,80), exercises });

  $("savePlan").disabled = false;

  if(error) {
    planMessage("Speichern fehlgeschlagen: "+error.message);
    return;
  }

  $("planName").value = "";
  await loadPlans();
  planMessage("✓ Plan „"+name+"“ gespeichert.");
});

async function deletePlan(id) {
  if(!confirm("Diesen Plan wirklich löschen?")) return;

  const {error} = await supabase
    .from("workout_plans")
    .delete()
    .eq("id",id)
    .eq("user_id",currentUserId);

  if(error) {
    planMessage("Löschen fehlgeschlagen: "+error.message);
    return;
  }

  await loadPlans();
  planMessage("✓ Plan gelöscht.");
}

function resetTrackerAndPlans() {
  trackerData = null;
  ++trackerCounter;
  planData = [];
  ++planLoadCounter;
  planMessage("");
  renderTracker();
  renderPlans();
}

renderPlans();
