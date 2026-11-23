// VYORA AI – Tagesziele und Bedarfsrechner
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Tagesziele
// -----------------------------------

let userGoals = {kcal:null,protein_g:null,steps:null,water_glasses:null};
let todayTotals = {calories:0,protein:0};
let todaySteps = null;
let goalsLoadCounter = 0;
const GOAL_CIRCLE = 169.65;

function goalsMessage(text) {
  $("goalsMessage").textContent = text || "";
}

function setGoalRing(fillId,value,goal) {
  const fill = $(fillId);
  const share = goal ? Math.min(1,Math.max(0,value/goal)) : 0;
  fill.style.strokeDashoffset =
    String(GOAL_CIRCLE*(1-share));
  fill.closest(".goal").classList.toggle(
    "done",
    !!goal && value>=goal
  );
}

function wholeNumber(value) {
  return Math.round(Number(value)||0)
    .toLocaleString("de-DE");
}

function renderGoals() {
  const g = userGoals;
  renderWater();

  $("homeCalories").textContent =
    wholeNumber(todayTotals.calories);
  $("goalKcalText").textContent = g.kcal
    ? "von "+wholeNumber(g.kcal)+" kcal"
    : "kcal";
  setGoalRing("goalKcalFill",todayTotals.calories,g.kcal);

  $("goalProteinValue").textContent =
    wholeNumber(todayTotals.protein);
  $("goalProteinText").textContent = g.protein_g
    ? "von "+wholeNumber(g.protein_g)+" g Eiweiß"
    : "g Eiweiß";
  setGoalRing("goalProteinFill",todayTotals.protein,g.protein_g);

  const hasSteps = todaySteps!==null;
  $("goalStepsValue").textContent = hasSteps
    ? (todaySteps>=10000
        ? (Math.floor(todaySteps/100)/10).toLocaleString("de-DE")+"k"
        : wholeNumber(todaySteps))
    : "–";
  $("goalStepsText").textContent = g.steps
    ? "von "+wholeNumber(g.steps)+" Schritten"
    : hasSteps ? "Schritte" : "Schritte (Tracker)";
  setGoalRing("goalStepsFill",hasSteps ? todaySteps : 0,g.steps);
}

function fillGoalsForm() {
  if($("goalWaterInput")) $("goalWaterInput").value = userGoals.water_glasses ?? "";
  $("goalKcalInput").value = userGoals.kcal ?? "";
  $("goalProteinInput").value = userGoals.protein_g ?? "";
  $("goalStepsInput").value = userGoals.steps ?? "";
}

// -----------------------------------
// Bedarf automatisch berechnen
// Grundumsatz: Mifflin-St Jeor; Gesamtbedarf: × PAL (DGE);
// Eiweiß: 1,6 g/kg (Morton et al. 2018). Nur Schätzung, keine Diagnose.
// -----------------------------------

let calcProfile = null;   // gespeicherte Angaben aus user_goals
let autoGoalsBusy = false;

function calcMessage(text) { if($("calcMessage")) $("calcMessage").textContent = text || ""; }

function calcNeeds({sex,age,height,weight,pal,goal}) {
  const sexTerm = sex==="m" ? 5 : sex==="f" ? -161 : -78;
  const bmr = 10*weight + 6.25*height - 5*age + sexTerm;
  const tdee = bmr*pal;
  let target = tdee;
  if(goal==="lose") target = Math.max(bmr, tdee - Math.min(500, tdee*0.2));
  if(goal==="gain") target = tdee + Math.min(350, tdee*0.1);
  // Eiweiß bei starkem Übergewicht auf Normalgewicht (BMI 25) beziehen
  const bmi = weight/((height/100)**2);
  const refWeight = bmi>=30 ? 25*(height/100)**2 : weight;
  const protein = 1.6*refWeight;
  const round10 = v => Math.round(v/10)*10;
  const round5 = v => Math.round(v/5)*5;
  return {
    bmr:round10(bmr),
    tdee:round10(tdee),
    kcal:Math.min(6000,Math.max(800,round10(target))),
    protein_g:Math.min(400,Math.max(10,round5(protein)))
  };
}

function latestWeightKg() {
  const w = typeof latestWith==="function" ? latestWith("weight_kg") : null;
  return w ? Number(w.weight_kg) : null;
}

function renderCalcResult(r,profile,auto=false) {
  const box = $("calcResult");
  if(!box) return;
  box.replaceChildren();
  const rows = [
    ["Grundumsatz", wholeNumber(r.bmr)+" kcal"],
    ["Tagesbedarf", wholeNumber(r.tdee)+" kcal"],
    [profile.goal==="lose" ? "Ziel (abnehmen)" : profile.goal==="gain" ? "Ziel (aufbauen)" : "Ziel (halten)",
      wholeNumber(r.kcal)+" kcal"],
    ["Eiweiß", wholeNumber(r.protein_g)+" g"]
  ];
  rows.forEach(([label,value]) => {
    const row = document.createElement("div");
    row.className = "calc-row";
    const a = document.createElement("span"); a.textContent = label;
    const b = document.createElement("strong"); b.textContent = value;
    row.append(a,b);
    box.append(row);
  });
  const note = document.createElement("p");
  note.className = "muted small-note";
  note.textContent = (auto ? "Automatisch angepasst" : "Berechnet")+
    " mit "+String(profile.weight).replace(".",",")+" kg. Schätzung ±10 % – prüf nach 2–3 Wochen deinen Verlauf.";
  box.append(note);
  box.classList.remove("hidden");
}

function fillCalcForm() {
  if(!$("calcForm")) return;
  const p = calcProfile || {};
  $("calcSex").value = p.sex || "";
  $("calcBirthYear").value = p.birth_year ?? "";
  $("calcHeight").value = p.height ?? "";
  $("calcPal").value = p.pal ? Number(p.pal).toFixed(1) : "1.4";
  if(!$("calcPal").value) $("calcPal").value = "1.4";
  $("calcGoal").value = p.goal || "keep";
  const latest = latestWeightKg();
  $("calcWeight").value = latest ?? p.weight ?? "";
}

function readCalcForm() {
  const sex = $("calcSex").value;
  if(!["m","f","x"].includes(sex)) throw new Error("Bitte wähle die Formel (Mann, Frau oder Mittelwert).");
  const year = Number($("calcBirthYear").value);
  const thisYear = new Date().getFullYear();
  if(!Number.isInteger(year) || year<1900 || year>thisYear) throw new Error("Bitte ein gültiges Geburtsjahr eingeben.");
  const age = thisYear - year;
  if(age<18) throw new Error("Die Berechnung ist für Erwachsene ab 18 gedacht. Bitte lass dir deinen Bedarf ärztlich oder von einer Ernährungsfachkraft einschätzen.");
  const height = Number($("calcHeight").value);
  if(!(height>=120 && height<=230)) throw new Error("Größe bitte zwischen 120 und 230 cm.");
  const weight = Math.round(Number(String($("calcWeight").value).replace(",","."))*10)/10;
  if(!(weight>=30 && weight<=300)) throw new Error("Gewicht bitte zwischen 30 und 300 kg.");
  const pal = Number($("calcPal").value);
  if(!(pal>=1.2 && pal<=2.4)) throw new Error("Bitte deine Aktivität wählen.");
  const goal = $("calcGoal").value;
  if(!["lose","keep","gain"].includes(goal)) throw new Error("Bitte ein Ziel wählen.");
  return {sex,birth_year:year,age,height,weight,pal,goal};
}

async function saveCalcGoals(profile,result) {
  const {error} = await supabase.from("user_goals").upsert({
    user_id:currentUserId,
    kcal:result.kcal,
    protein_g:result.protein_g,
    calc_sex:profile.sex,
    calc_birth_year:profile.birth_year,
    calc_height_cm:profile.height,
    calc_pal:profile.pal,
    calc_goal:profile.goal,
    calc_weight_kg:profile.weight,
    auto_goals:true,
    updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(error) throw error;
  calcProfile = {...profile, auto:true};
  userGoals = {...userGoals, kcal:result.kcal, protein_g:result.protein_g};
  fillGoalsForm();
  renderGoals();
}

$("calcForm")?.addEventListener("submit",async event => {
  event.preventDefault();
  if(!currentUserId) return;
  const button = $("calcSave");
  button.disabled = true;
  try {
    const profile = readCalcForm();
    const result = calcNeeds(profile);
    calcMessage("Wird gespeichert ...");
    await saveCalcGoals(profile,result);
    renderCalcResult(result,profile);
    calcMessage("✓ Als Tagesziel übernommen. Bei neuem Gewicht rechnet VYORA automatisch neu.");
  } catch(error) {
    calcMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

// Richtwerte (Schritte 7.000, Wasser 6 Gläser) ins Formular übernehmen
$("goalsUseGuide")?.addEventListener("click",() => {
  $("goalStepsInput").value = 7000;
  if($("goalWaterInput")) $("goalWaterInput").value = 6;
  goalsMessage("Schritte 7.000 und 6 Gläser Wasser eingetragen – tippe auf „Ziele speichern“.");
});

// Neu rechnen, wenn ein neueres Gewicht da ist oder ein neues Lebensjahr begonnen hat
async function maybeAutoGoals() {
  const p = calcProfile;
  if(!currentUserId || !p?.auto || autoGoalsBusy) return;
  if(!p.sex || !p.birth_year || !p.height || !p.pal || !p.goal) return;
  const latest = latestWeightKg();
  const weight = latest ?? p.weight;
  if(!weight) return;
  const age = new Date().getFullYear() - p.birth_year;
  if(age<18) return;
  const profile = {...p, weight, age};
  const result = calcNeeds(profile);
  if(result.kcal===userGoals.kcal && result.protein_g===userGoals.protein_g &&
     Number(weight)===Number(p.weight)) return;
  autoGoalsBusy = true;
  try {
    await saveCalcGoals(profile,result);
    if($("calcWeight")) $("calcWeight").value = weight;
    renderCalcResult(result,profile,true);
  } catch(_error) {
    // still: beim nächsten Laden erneut versuchen
  } finally {
    autoGoalsBusy = false;
  }
}

async function loadGoals() {
  if(!currentUserId) return;
  const requestId = ++goalsLoadCounter;
  const userId = currentUserId;

  try {
    const {data,error} = await supabase
      .from("user_goals")
      .select("kcal,protein_g,steps,water_glasses,tour_done_at,bp_per_day,glucose_per_day,insulin_per_day,glucose_unit,calc_sex,calc_birth_year,calc_height_cm,calc_pal,calc_goal,calc_weight_kg,auto_goals")
      .eq("user_id",userId)
      .maybeSingle();

    if(requestId!==goalsLoadCounter || userId!==currentUserId) return;
    if(error) throw error;

    userGoals = {
      kcal:data?.kcal ?? null,
      protein_g:data?.protein_g ?? null,
      steps:data?.steps ?? null,
      water_glasses:data?.water_glasses ?? null
    };
    checkSettings = {
      bp:Number(data?.bp_per_day)||0,
      glucose:Number(data?.glucose_per_day)||0,
      insulin:Number(data?.insulin_per_day)||0,
      unit:data?.glucose_unit==="mmol_l" ? "mmol_l" : "mg_dl"
    };
    calcProfile = data?.calc_sex ? {
      sex:data.calc_sex, birth_year:data.calc_birth_year, height:data.calc_height_cm,
      pal:Number(data.calc_pal), goal:data.calc_goal,
      weight:data.calc_weight_kg==null ? null : Number(data.calc_weight_kg),
      auto:data.auto_goals===true
    } : null;
    fillGoalsForm();
    fillCalcForm();
    renderGoals();
    maybeAutoGoals();
    if(!data?.tour_done_at) openTour();
    fillCheckForm();
    renderChecklist();
    renderMeasureList();
  } catch(error) {
    if(requestId===goalsLoadCounter) {
      goalsMessage("Ziele konnten nicht geladen werden: "+error.message);
    }
  }
}

function readGoal(id,min,max,label) {
  const raw = $(id).value.trim();
  if(raw==="") return null;
  const value = Math.round(Number(raw));
  if(!Number.isFinite(value) || value<min || value>max) {
    throw new Error(
      label+" muss zwischen "+min.toLocaleString("de-DE")+
      " und "+max.toLocaleString("de-DE")+" liegen."
    );
  }
  return value;
}

$("goalsForm").addEventListener("submit",async event => {
  event.preventDefault();
  if(!currentUserId) return;

  const button = $("saveGoals");
  button.disabled = true;

  try {
    const goals = {
      kcal:readGoal("goalKcalInput",800,6000,"Kalorien"),
      protein_g:readGoal("goalProteinInput",10,400,"Eiweiß"),
      steps:readGoal("goalStepsInput",1000,50000,"Schritte"),
      water_glasses:$("goalWaterInput") ? readGoal("goalWaterInput",1,20,"Wasser") : userGoals.water_glasses
    };

    goalsMessage("Ziele werden gespeichert ...");

    const manualChange = goals.kcal!==userGoals.kcal || goals.protein_g!==userGoals.protein_g;
    const keepAuto = !!calcProfile?.auto && !manualChange;

    const {error} = await supabase
      .from("user_goals")
      .upsert({
        user_id:currentUserId,
        ...goals,
        auto_goals:keepAuto,
        updated_at:new Date().toISOString()
      },{onConflict:"user_id"});

    if(error) throw error;

    userGoals = goals;
    if(calcProfile) calcProfile.auto = keepAuto;
    renderGoals();
    goalsMessage(calcProfile && !keepAuto && manualChange
      ? "✓ Ziele gespeichert. Die automatische Berechnung ist jetzt aus – du kannst sie oben wieder einschalten."
      : "✓ Ziele gespeichert.");
  } catch(error) {
    goalsMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});
