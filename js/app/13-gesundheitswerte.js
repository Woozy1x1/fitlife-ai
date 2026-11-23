// VYORA AI – Gesundheitswerte (Gewicht, Blutdruck, Puls)
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Gesundheitswerte
// -----------------------------------

function healthMessage(text) {
  $("healthMessage").textContent = text || "";
}

function latestWith(field) {
  return healthData.find(x =>
    x[field]!==null && x[field]!==undefined
  );
}

function renderWeightChart() {
  const box = $("weightChart");
  box.replaceChildren();

  const points = healthData
    .filter(x => x.weight_kg!==null && x.weight_kg!==undefined)
    .slice(0,10)
    .reverse();

  if(!points.length) {
    box.textContent = "Noch keine Gewichtswerte eingetragen.";
    return;
  }

  const values = points.map(x=>Number(x.weight_kg));
  const min = Math.min(...values)-2;
  const max = Math.max(...values)+2;

  points.forEach(item => {
    const column = document.createElement("div");
    column.className = "chart-column";

    const value = document.createElement("span");
    value.className = "chart-value";
    value.textContent = number(item.weight_kg);

    const track = document.createElement("div");
    track.className = "chart-track";

    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height =
      Math.max(8,(Number(item.weight_kg)-min)/(max-min)*100)+"%";
    track.append(bar);

    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = formatDate(item.entry_date);

    column.append(value,track,label);
    box.append(column);
  });
}

function renderHealth() {
  const w = latestWith("weight_kg");
  const bp = latestWith("systolic");
  const p = latestWith("pulse");

  $("latestWeight").textContent = w ? number(w.weight_kg)+" kg" : "–";
  $("latestWeightDate").textContent = w
    ? formatDate(w.entry_date) : "Noch keine Daten";

  updateLatestBp();

  $("latestPulse").textContent = p ? p.pulse : "–";
  $("latestPulseDate").textContent = p
    ? formatDate(p.entry_date)+" · Schläge/min" : "Noch keine Daten";

  updateHomePulse();

  renderWeightChart();

  const list = $("healthList");
  list.replaceChildren();

  if(!healthData.length) {
    list.textContent = "Noch keine Gesundheitswerte gespeichert.";
    return;
  }

  healthData.forEach(item => {
    const parts = [];
    if(item.weight_kg!==null) parts.push(number(item.weight_kg)+" kg");
    if(item.systolic!==null) {
      parts.push("RR "+item.systolic+"/"+item.diastolic);
    }
    if(item.pulse!==null) parts.push("Puls "+item.pulse);

    const row = document.createElement("div");
    row.className = "meal-row";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = formatDate(item.entry_date)+" · "+
      parts.join(" · ");

    const details = document.createElement("small");
    details.textContent = item.notes || "";

    info.append(title,details);
    row.append(
      info,
      deleteButton(
        "Messung löschen vom "+formatDate(item.entry_date),
        () => deleteHealth(item.id)
      )
    );
    list.append(row);
  });
}

async function loadHealth() {
  if(!currentUserId) return;

  const requestId = ++healthLoadCounter;
  const userId = currentUserId;

  const {data,error} = await supabase
    .from("health_entries")
    .select("id,entry_date,weight_kg,systolic,diastolic,pulse,notes,created_at")
    .eq("user_id",userId)
    .order("entry_date",{ascending:false})
    .order("created_at",{ascending:false})
    .limit(60);

  if(
    currentUserId!==userId ||
    requestId!==healthLoadCounter
  ) return;

  if(error) {
    healthMessage("Laden fehlgeschlagen: "+error.message);
    return;
  }

  healthData = data||[];
  renderHealth();
  scheduleInsights();
  if($("calcWeight") && !$("calcWeight").value) { const w = latestWeightKg(); if(w) $("calcWeight").value = w; }
  maybeAutoGoals();
}

$("healthForm").addEventListener("submit",async event => {
  event.preventDefault();

  const button = $("saveHealth");
  button.disabled = true;
  healthMessage("Werte werden gespeichert ...");

  try {
    if(!currentUserId) throw new Error("Bitte erneut anmelden.");

    const date = $("healthDate").value;
    if(!date) throw new Error("Bitte ein Datum wählen.");

    const weight = optionalNumber("bodyWeight",20,400,"Gewicht",false);
    const systolic = optionalNumber("systolic",50,260,"Blutdruck oben",true);
    const diastolic = optionalNumber("diastolic",30,180,"Blutdruck unten",true);
    const pulse = optionalNumber("pulse",25,250,"Puls",true);

    if((systolic===null)!==(diastolic===null)) {
      throw new Error(
        "Bitte beim Blutdruck beide Werte (oben und unten) eingeben."
      );
    }
    if(systolic!==null && diastolic>=systolic) {
      throw new Error(
        "Der untere Blutdruckwert muss kleiner als der obere sein."
      );
    }
    if(weight===null && systolic===null && pulse===null) {
      throw new Error("Bitte mindestens einen Wert eingeben.");
    }

    const notes = $("healthNotes").value.trim().slice(0,500);

    const saved = await saveOrQueue("health_entries",{
        user_id:currentUserId,
        entry_date:date,
        weight_kg:weight===null ? null : Math.round(weight*10)/10,
        systolic,
        diastolic,
        pulse,
        notes:notes||null
      });

    ["bodyWeight","systolic","diastolic","pulse","healthNotes"]
      .forEach(id => $(id).value = "");
    if(saved.queued) { healthMessage(OFFLINE_MSG); return; }

    await loadHealth();
    healthMessage("✓ Werte gespeichert.");

  } catch(error) {
    healthMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});

async function deleteHealth(id) {
  if(!confirm("Diese Messung wirklich löschen?")) return;

  healthMessage("Eintrag wird gelöscht ...");

  const {error} = await supabase
    .from("health_entries")
    .delete()
    .eq("id",id)
    .eq("user_id",currentUserId);

  if(error) {
    healthMessage("Löschen fehlgeschlagen: "+error.message);
    return;
  }

  await loadHealth();
  healthMessage("✓ Eintrag gelöscht.");
}

function resetTrainingAndHealth() {
  workoutData = [];
  healthData = [];
  ++workoutLoadCounter;
  ++healthLoadCounter;
  ++lastTimeCounter;
  $("homeTraining").textContent = "–";
  $("homeTrainingInfo").textContent = "Noch nichts eingetragen";
  $("lastTimeInfo").textContent = "";
  $("workoutForm").reset();
  $("healthForm").reset();
  $("trainingDate").value = localDate();
  $("healthDate").value = localDate();
  renderExerciseSuggestions([]);
  renderTraining();
  renderHealth();
}

renderExerciseSuggestions([]);
