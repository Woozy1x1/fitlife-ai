// VYORA AI – Anzeige: Datum, Diagramme, Schlaf- und Ernährungsübersicht
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

function formatDate(day) {
  if(!day) return "–";

  const d = new Date(day+"T12:00:00");

  return isNaN(d.getTime())
    ? day
    : d.toLocaleDateString("de-DE",{
        day:"2-digit",
        month:"short"
      });
}

function renderChart(id) {
  const box = $(id);
  box.replaceChildren();

  if(!sleepData.length) {
    box.textContent =
      "Noch keine Schlafdaten verfügbar.";
    return;
  }

  sleepData.slice(-7).forEach(item => {
    const column = document.createElement("div");
    column.className = "chart-column";

    const value = document.createElement("span");
    value.className = "chart-value";
    value.textContent = item.score;

    const track = document.createElement("div");
    track.className = "chart-track";

    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height = item.score+"%";
    track.append(bar);

    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = formatDate(item.day);

    column.append(value,track,label);
    box.append(column);
  });
}

function renderSleep() {
  renderChart("homeChart");
  renderChart("sleepChart");

  const list = $("sleepList");
  list.replaceChildren();

  sleepData.slice().reverse().forEach(item => {
    const row = document.createElement("div");
    row.className = "meal-row";

    const date = document.createElement("span");
    date.textContent = formatDate(item.day);

    const score = document.createElement("strong");
    score.textContent = item.score;

    row.append(date,score);
    list.append(row);
  });

  if(!sleepData.length) {
    list.textContent =
      "Keine Schlafscores für die letzten 7 Tage.";

    $("mainScore").textContent = "–";
    $("miniSleep").textContent = "–";
    $("scoreDate").textContent = "Letzte Messung";
    $("scoreRating").textContent = "Noch keine Daten";
    setScoreVisual(null);
    renderSleepFallback();
    return;
  }

  $("scoreLabel").textContent = "Schlafscore";
  $("scoreSource").textContent =
    "Dein zuletzt erfasster Schlafscore vom Oura Ring.";
  renderTrackerIdentity();

  const latest = sleepData[sleepData.length-1];

  $("mainScore").textContent = latest.score;
  $("miniSleep").textContent = latest.score;
  $("scoreDate").textContent = formatDate(latest.day);

  $("scoreRating").textContent =
    latest.score>=85 ? "Sehr gut" :
    latest.score>=70 ? "Gut erholt" :
    latest.score>=60 ? "Ausbaufähig" :
    "Erholung beachten";

  setScoreVisual(latest.score);
}

// Ring und "Sonne" auf der Startseite.
function setScoreVisual(score) {
  const value = Number.isFinite(Number(score))
    ? Math.max(0,Math.min(100,Number(score)))
    : 0;
  $("scoreCircle").style.strokeDashoffset =
    452.39*(1-value/100);
  $("heroCard").style.setProperty("--score",String(value));
}

async function loadSleep(quiet=false) {
  if(loadingSleep) return;

  loadingSleep = true;
  const userId = currentUserId;

  $("sleepButton").disabled = true;
  if(!quiet) ouraMessage("Schlafdaten werden geladen ...");

  try {
    const result = await authenticatedRequest("daily");

    if(currentUserId!==userId) return;

    sleepData = (
      Array.isArray(result.data) ? result.data : []
    )
      .filter(x =>
        typeof x.day==="string" &&
        x.score!==null &&
        x.score!==undefined &&
        Number.isFinite(Number(x.score)) &&
        Number(x.score)>=0 &&
        Number(x.score)<=100
      )
      .map(x => ({
        day:x.day,
        score:Number(x.score),
        contributors:
          x.contributors && typeof x.contributors==="object"
            ? x.contributors : null
      }))
      .sort((a,b) => a.day.localeCompare(b.day));

    renderSleep();
    lastTrackerLoad = Date.now();
    ouraMessage("✓ Aktualisiert um "+
      new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})+" Uhr.");

    // Detaildaten erst NACH "daily" laden (nicht gleichzeitig),
    // damit sich zwei Token-Erneuerungen nicht in die Quere kommen.
    await loadTrackerDetails(userId);

  } catch(e) {
    if(currentUserId===userId) {
      ouraMessage("Fehler: "+e.message);
    }
  } finally {
    loadingSleep = false;
    $("sleepButton").disabled = false;
  }
}

function number(value) {
  return Number(value||0).toLocaleString(
    "de-DE",
    {maximumFractionDigits:1}
  );
}

function renderNutrition() {
  const sum = field => nutritionData.reduce(
    (total,item) =>
      total+Number(item[field]||0),
    0
  );

  $("totalCalories").textContent =
    number(sum("calories"));

  $("totalProtein").textContent =
    number(sum("protein"));

  $("totalCarbs").textContent =
    number(sum("carbs"));

  $("totalFat").textContent =
    number(sum("fat"));

  if($("fiberInfo")) {
    const known = nutritionData.filter(item => item.fiber_g!=null);
    const missing = nutritionData.length-known.length;
    $("fiberInfo").textContent = !nutritionData.length ? "" :
      "🌾 Ballaststoffe: "+number(sum("fiber_g"))+" g"+
      (missing ? " (bei "+missing+(missing===1 ? " Eintrag" : " Einträgen")+" unbekannt)" : "")+
      " · Orientierung für Erwachsene (DGE): mindestens 30 g am Tag.";
  }

  if($("nutritionDate").value===localDate()) {
    todayTotals = {
      calories:sum("calories"),
      protein:sum("protein")
    };
    renderGoals();

    $("homeNutritionInfo").textContent =
      nutritionData.length+
      " Mahlzeit(en) heute eingetragen.";
  }

  const list = $("nutritionList");
  list.replaceChildren();

  if(!nutritionData.length) {
    list.textContent =
      "Für dieses Datum sind noch keine Mahlzeiten gespeichert.";
    return;
  }

  nutritionData.forEach(item => {
    const row = document.createElement("div");
    row.className = "meal-row";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.food_name;

    const details = document.createElement("small");
    details.textContent =
      mealNames[item.meal_type]+" · "+
      number(item.calories)+" kcal · "+
      "E "+number(item.protein)+" g · "+
      "KH "+number(item.carbs)+" g · "+
      "F "+number(item.fat)+" g";

    info.append(title,details);

    const del = document.createElement("button");
    del.textContent = "Löschen";
    del.setAttribute(
      "aria-label",
      "Mahlzeit löschen: "+item.food_name
    );

    del.addEventListener("click",() => {
      deleteMeal(item.id);
    });

    const again = document.createElement("button");
    again.type = "button";
    again.textContent = "Nochmal";
    again.classList.add("soft-btn");
    again.setAttribute(
      "aria-label",
      "Mahlzeit erneut eintragen: "+item.food_name
    );
    again.addEventListener("click",() => {
      repeatMeal(item);
    });

    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.append(again,del);

    row.append(info,actions);
    list.append(row);
  });
}

// Übernimmt eine gespeicherte Mahlzeit ins
// Formular. Die Menge steht im Namen, z. B.
// "Skyr (250 g)". Dann lassen sich die Werte
// beim Ändern der Menge neu umrechnen.
function repeatMeal(item) {
  const match = String(item.food_name||"")
    .match(/^(.*) \(([\d.,]+) g\)$/);

  const name = match
    ? match[1]
    : String(item.food_name||"");

  const amount = match
    ? Number(match[2].replace(/\./g,"").replace(",","."))
    : NaN;

  $("mealType").value = item.meal_type;

  if(Number.isFinite(amount) && amount>0) {
    const per100 = field =>
      Math.round(
        Number(item[field]||0)*100/amount*100
      )/100;

    selectedFood = {
      name,
      brand:"",
      code:"",
      calories:per100("calories"),
      protein:per100("protein"),
      carbs:per100("carbs"),
      fat:per100("fat"),
      fiber:item.fiber_g==null ? null : per100("fiber_g")
    };

    $("foodName").value = name;
    $("foodAmount").value = String(amount);
    calculateSelectedFood();

    $("selectedFoodInfo").textContent =
      "↻ Übernommen: "+name+
      ". Ändere bei Bedarf die Menge – die Nährwerte werden umgerechnet.";
  } else {
    selectedFood = null;
    $("foodName").value = name;
    $("foodAmount").value = "100";
    ["calories","protein","carbs","fat"].forEach(field => {
      $(field).value = String(Number(item[field]||0));
    });
    if($("fiber")) $("fiber").value = item.fiber_g==null ? "" : String(Number(item.fiber_g));
    $("selectedFoodInfo").textContent =
      "↻ Übernommen: "+name+". Bitte Werte prüfen.";
  }

  $("nutritionForm").scrollIntoView({
    behavior:"smooth",
    block:"start"
  });
}
