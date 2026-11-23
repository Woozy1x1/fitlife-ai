// VYORA AI – Ernährung: Oft gegessen und Mahlzeiten des Tages laden
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Oft gegessen (aus den eigenen Einträgen
// der letzten 60 Tage, nichts Neues gespeichert)
// -----------------------------------

let frequentCounter = 0;

function mealBaseName(name) {
  return String(name||"").replace(/ \([\d.,]+ g\)$/,"").trim();
}

function renderFrequentFoods(items) {
  const list = $("frequentList");
  list.replaceChildren();
  $("frequentCard").classList.toggle("hidden",!items.length);

  items.forEach(({item,count}) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = mealBaseName(item.food_name);
    const times = document.createElement("small");
    times.textContent = count+"×";
    chip.append(times);
    chip.setAttribute(
      "aria-label",
      mealBaseName(item.food_name)+" übernehmen, "+count+" Mal gegessen"
    );
    chip.addEventListener("click",() => repeatMeal(item));
    list.append(chip);
  });
}

async function loadFrequentFoods() {
  if(!currentUserId) return;
  const requestId = ++frequentCounter;
  const userId = currentUserId;

  const since = new Date();
  since.setDate(since.getDate()-60);
  const sinceDay =
    since.getFullYear()+"-"+
    String(since.getMonth()+1).padStart(2,"0")+"-"+
    String(since.getDate()).padStart(2,"0");

  try {
    const {data,error} = await supabase
      .from("nutrition_entries")
      .select("meal_type,food_name,calories,protein,carbs,fat,fiber_g,entry_date,created_at")
      .eq("user_id",userId)
      .gte("entry_date",sinceDay)
      .order("created_at",{ascending:false})
      .limit(400);

    if(requestId!==frequentCounter || userId!==currentUserId) return;
    if(error) throw error;

    // Gruppieren nach Name (ohne Mengenangabe).
    // Das jüngste Exemplar liefert Menge und Werte.
    const groups = new Map();
    for(const item of data||[]) {
      const key = mealBaseName(item.food_name).toLowerCase();
      if(!key) continue;
      const group = groups.get(key);
      if(group) group.count++;
      else groups.set(key,{item,count:1});
    }

    const items = [...groups.values()]
      .filter(g => g.count>=2)
      .sort((a,b) =>
        b.count-a.count ||
        String(b.item.created_at).localeCompare(String(a.item.created_at)))
      .slice(0,8);

    renderFrequentFoods(items);
  } catch(_error) {
    if(requestId===frequentCounter) renderFrequentFoods([]);
  }
}

async function loadNutrition() {
  if(!currentUserId) return;

  const requestId = ++nutritionLoadCounter;
  const userId = currentUserId;
  const date = $("nutritionDate").value;

  nutritionMessage("Mahlzeiten werden geladen ...");

  const {data,error} = await supabase
    .from("nutrition_entries")
    .select(
      "id,meal_type,food_name,calories,protein,carbs,fat,fiber_g,entry_date,created_at"
    )
    .eq("user_id",userId)
    .eq("entry_date",date)
    .order("created_at",{ascending:false});

  if(
    currentUserId!==userId ||
    $("nutritionDate").value!==date ||
    requestId!==nutritionLoadCounter
  ) return;

  if(error) {
    nutritionMessage(
      "Laden fehlgeschlagen: "+error.message
    );
    return;
  }

  nutritionData = data||[];
  renderNutrition();
  loadFrequentFoods();
  scheduleInsights();
  nutritionMessage("");
}

$("nutritionDate").addEventListener(
  "change",
  loadNutrition
);
