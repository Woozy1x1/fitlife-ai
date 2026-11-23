// VYORA AI – Ernährung: Oft gegessen und Lebensmittelsuche
// Teil 9 von 18. Alle Teile teilen sich einen gemeinsamen Bereich
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

// -----------------------------------
// NEU: Lebensmittelsuche
// -----------------------------------

function validNutrient(value) {
  if(value===null || value===undefined || value==="") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) && n>=0 && n<=1000
    ? n
    : null;
}

function normalizeFood(product) {
  const nutrients = product.nutriments || {};

  // Manche Produkte haben nur kJ statt kcal.
  // 1 kcal = 4,184 kJ
  let calories = validNutrient(
    nutrients["energy-kcal_100g"]
  );

  if(calories===null) {
    // kJ-Werte liegen oft über 1000, darum
    // hier eine eigene Prüfung (max. 4000 kJ).
    const rawKj = nutrients.energy_100g;
    const kj = rawKj===null || rawKj===undefined || rawKj===""
      ? NaN
      : Number(rawKj);
    if(Number.isFinite(kj) && kj>=0 && kj<=4000) {
      calories = Math.round(kj/4.184*10)/10;
    }
  }

  const protein = validNutrient(
    nutrients.proteins_100g
  );

  const carbs = validNutrient(
    nutrients.carbohydrates_100g
  );

  const fat = validNutrient(
    nutrients.fat_100g
  );

  // Ballaststoffe sind freiwillig angegeben – fehlen sie, bleibt das Feld leer.
  const fiber = validNutrient(
    nutrients.fiber_100g
  );

  const name = String(
    product.product_name_de ||
    product.product_name ||
    ""
  ).trim();

  if(!name || calories===null) return null;

  // Nur Produkte mit allen vier Nährwerten
  // automatisch übernehmen.
  if(
    protein===null ||
    carbs===null ||
    fat===null
  ) return null;

  // Grobe Plausibilitätsprüfung.
  if(protein>100 || carbs>100 || fat>100) {
    return null;
  }

  return {
    name:name.slice(0,200),
    brand:String(product.brands||"").slice(0,100),
    code:String(product.code||""),
    calories,
    protein,
    carbs,
    fat,
    fiber
  };
}

function clearFoodSelection() {
  selectedFood = null;
  $("nutritionForm").reset();
  $("foodAmount").value = "100";
  $("protein").value = "0";
  $("carbs").value = "0";
  $("fat").value = "0";
  $("selectedFoodInfo").textContent =
    "Wähle ein Suchergebnis oder gib deine Werte selbst ein.";
}

$("clearFood").addEventListener(
  "click",
  clearFoodSelection
);

function calculateSelectedFood() {
  if(!selectedFood) return;

  const grams = Number($("foodAmount").value);

  if(
    !Number.isFinite(grams) ||
    grams<=0 ||
    grams>100000
  ) return;

  const factor = grams/100;

  const rounded = n =>
    Math.round(n*factor*100)/100;

  $("calories").value =
    rounded(selectedFood.calories);

  $("protein").value =
    rounded(selectedFood.protein);

  $("carbs").value =
    rounded(selectedFood.carbs);

  $("fat").value =
    rounded(selectedFood.fat);

  if($("fiber")) $("fiber").value =
    selectedFood.fiber==null ? "" : rounded(selectedFood.fiber);
}

$("foodAmount").addEventListener(
  "input",
  calculateSelectedFood
);

function chooseFood(food) {
  selectedFood = food;

  $("foodName").value = food.name;
  $("foodAmount").value = "100";

  $("selectedFoodInfo").textContent =
    "✓ Ausgewählt: "+food.name+
    (food.brand ? " · "+food.brand : "")+
    " · Werte je 100 g: "+
    number(food.calories)+" kcal, "+
    number(food.protein)+" g Eiweiß, "+
    number(food.carbs)+" g KH, "+
    number(food.fat)+" g Fett.";

  calculateSelectedFood();

  $("nutritionForm").scrollIntoView({
    behavior:"smooth",
    block:"start"
  });
}

$("foodName").addEventListener("input",() => {
  // Wenn der Nutzer das ausgewählte Produkt
  // umbenennt, ist die automatische Zuordnung
  // nicht mehr zuverlässig.
  if(
    selectedFood &&
    $("foodName").value!==selectedFood.name
  ) {
    selectedFood = null;
    $("selectedFoodInfo").textContent =
      "Manuelle Eingabe: Nährwerte bitte selbst prüfen.";
  }
});

function renderFoodResults(foods) {
  const container = $("foodSearchResults");
  container.replaceChildren();

  if(!foods.length) {
    foodMessage(
      "Keine passenden Lebensmittel mit vollständigen Nährwerten gefunden. Versuche einen anderen Suchbegriff."
    );
    return;
  }

  foodMessage(
    foods.length+
    " Lebensmittel gefunden. Bitte Produkt und Nährwerte prüfen."
  );

  foods.forEach(food => {
    const row = document.createElement("div");
    row.className = "search-result";

    const info = document.createElement("div");
    info.className = "search-info";

    const title = document.createElement("strong");
    title.textContent = food.name;

    const brand = document.createElement("small");
    brand.textContent =
      (food.brand ? food.brand+" · " : "")+
      number(food.calories)+" kcal / 100 g";

    const macros = document.createElement("small");
    macros.style.display = "block";
    macros.textContent =
      "E "+number(food.protein)+" g · "+
      "KH "+number(food.carbs)+" g · "+
      "F "+number(food.fat)+" g";

    info.append(title,brand,macros);

    const select = document.createElement("button");
    select.type = "button";
    select.textContent = "Wählen";

    select.addEventListener("click",() => {
      chooseFood(food);
    });

    row.append(info,select);
    container.append(row);
  });
}

// Die Lebensmittelsuche läuft über unsere eigene
// Supabase-Funktion "food-search". Sie fragt Open Food
// Facts an (mit Wiederholungen und Zwischenspeicher).
// Vorteil: Open Food Facts sieht keine IP-Adressen
// unserer Nutzer, und Überlastungsfehler ohne CORS
// treten im Browser nicht mehr auf.

const foodSearchCache = new Map();

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve,ms));
}

async function foodRequest(body) {
  const {data,error} =
    await supabase.auth.getSession();

  if(error || !data.session) {
    throw new Error("Bitte erneut anmelden.");
  }

  let lastError = null;

  // Ein zweiter Versuch, falls die Funktion
  // gerade erst startet oder kurz hängt.
  for(let attempt=1; attempt<=2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      30000
    );

    try {
      const response = await fetch(FOOD_FUNCTION,{
        method:"POST",
        cache:"no-store",
        signal:controller.signal,
        headers:{
          Authorization:
            "Bearer "+data.session.access_token,
          apikey:SUPABASE_KEY,
          "Content-Type":"application/json"
        },
        body:JSON.stringify(body)
      });

      const result = await response.json()
        .catch(() => ({}));

      if(response.ok) return result;

      lastError = new Error(
        response.status===401
          ? "Bitte erneut anmelden."
          : result.error || "HTTP "+response.status
      );

      // Eingabefehler oder fehlende Anmeldung:
      // ein neuer Versuch bringt nichts.
      if(response.status<500) {
        lastError.final = true;
        throw lastError;
      }

    } catch(error) {
      lastError = error;
      if(error.final) throw error;
    } finally {
      clearTimeout(timer);
    }

    if(attempt<2) await wait(1500);
  }

  throw lastError;
}

async function fetchFoodProducts(query) {
  const key = query.toLowerCase();

  if(foodSearchCache.has(key)) {
    return foodSearchCache.get(key);
  }

  const result = await foodRequest({
    action:"search",
    q:query
  });

  const products = Array.isArray(result.products)
    ? result.products
    : [];

  foodSearchCache.set(key,products);
  return products;
}

// Prüfziffer von EAN-8/EAN-13/UPC (GTIN).
// Verhindert, dass falsch gelesene Barcodes
// gesucht werden.
function validBarcode(code) {
  if(!/^\d{8,14}$/.test(code)) return false;

  const digits = code.split("").map(Number);
  const check = digits.pop();
  let sum = 0;

  digits.reverse().forEach((digit,index) => {
    sum += digit*(index%2===0 ? 3 : 1);
  });

  return (10-sum%10)%10===check;
}

async function lookupBarcode(code) {
  code = String(code||"").replace(/\D/g,"");

  if(!validBarcode(code)) {
    foodMessage(
      "Dieser Barcode ist ungültig. Bitte prüfe die Ziffern."
    );
    return;
  }

  const requestId = ++foodSearchCounter;
  $("foodSearchResults").replaceChildren();
  foodMessage("Barcode "+code+" wird gesucht ...");

  try {
    const result = await foodRequest({
      action:"barcode",
      code
    });

    if(requestId!==foodSearchCounter) return;

    if(!result.product) {
      foodMessage(
        "Zu Barcode "+code+" gibt es noch keinen Eintrag bei Open Food Facts. Du kannst das Lebensmittel unten manuell eintragen."
      );
      return;
    }

    const food = normalizeFood(result.product);

    if(!food) {
      const name =
        result.product.product_name_de ||
        result.product.product_name ||
        "Produkt";

      clearFoodSelection();
      $("foodName").value = String(name).slice(0,200);
      foodMessage(
        "Gefunden: "+name+
        " – aber ohne vollständige Nährwerte. Bitte trage die Werte von der Verpackung selbst ein."
      );
      $("nutritionForm").scrollIntoView({
        behavior:"smooth",
        block:"start"
      });
      return;
    }

    renderFoodResults([food]);
    chooseFood(food);
    foodMessage(
      "✓ Gefunden: "+food.name+
      ". Bitte Menge und Nährwerte prüfen."
    );

  } catch(error) {
    if(requestId===foodSearchCounter) {
      foodMessage(
        "Suche fehlgeschlagen: "+error.message+
        " Du kannst das Lebensmittel manuell eintragen."
      );
    }
  }
}

$("barcodeForm").addEventListener(
  "submit",
  event => {
    event.preventDefault();
    lookupBarcode($("barcodeInput").value.trim());
  }
);
