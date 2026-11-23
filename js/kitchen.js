// VYORA AI – Rezepte, Wochenplan und Einkaufsliste
// Nährwerte je Portion werden aus den Zutaten berechnet, die du einträgst
// oder über die Lebensmittelsuche (Open Food Facts) übernimmst.

let VY = null;
let db = null;
let $ = null;

const state = {
  recipes:[],
  plan:[],
  items:[],
  week:null,
  editing:null,      // {id,name,servings,ingredients:[],steps}
  load:0,
  tab:"recipes"
};

const MEALS = [["breakfast","Frühstück"],["lunch","Mittagessen"],["dinner","Abendessen"],["snack","Snack"]];
const MEAL = Object.fromEntries(MEALS);
const DAYNAMES = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];

function el(tag,props={},...children) {
  const node = document.createElement(tag);
  for(const [key,value] of Object.entries(props||{})) {
    if(value==null || value===false) continue;
    if(key==="class") node.className = value;
    else if(key.startsWith("on")) node.addEventListener(key.slice(2),value);
    else if(key in node && typeof value!=="string") node[key] = value;
    else node.setAttribute(key,value===true ? "" : value);
  }
  for(const child of children.flat()) {
    if(child==null || child===false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const de = (n,d=1) => Number(n||0).toLocaleString("de-DE",{maximumFractionDigits:d});
const msg = text => { if($("kitchenMessage")) $("kitchenMessage").textContent = text || ""; };
const errText = e => /fetch|network/i.test(String(e?.message||e)) ? "Keine Verbindung. Bitte später erneut versuchen." : String(e?.message||e);

function addDays(day,n) {
  const d = new Date(day+"T12:00:00");
  d.setDate(d.getDate()+n);
  return VY.dayString(d);
}

function mondayOf(day) {
  const d = new Date(day+"T12:00:00");
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  return VY.dayString(d);
}

function shortDate(day) {
  return new Date(day+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
}

export function init(api) {
  VY = api;
  db = api.supabase;
  $ = api.$;
  if(!$("kitchenCard")) return;

  state.week = mondayOf(VY.localDate());
  setupTabs();
  setupRecipeEditor();
  setupPlan();
  setupShopping();
  $("kitchenMeal").value = defaultMeal();

  VY.on("user",loadAll);
  VY.on("reset",resetAll);
  if(VY.uid) loadAll();
}

function defaultMeal() {
  const h = new Date().getHours();
  return h<10 ? "breakfast" : h<15 ? "lunch" : h<21 ? "dinner" : "snack";
}

function resetAll() {
  state.recipes = []; state.plan = []; state.items = [];
  state.load++;
  closeEditor();
  for(const id of ["recipeList","planWeek","shopList"]) $(id)?.replaceChildren();
  msg("");
}

async function loadAll() {
  const uid = VY.uid;
  if(!uid) return;
  const id = ++state.load;
  const [r,s] = await Promise.all([
    db.from("recipes").select("id,name,servings,ingredients,steps,updated_at").eq("user_id",uid).order("name",{ascending:true}).limit(300),
    db.from("shopping_items").select("id,name,amount,done,created_at").eq("user_id",uid).order("created_at",{ascending:true}).limit(500)
  ]);
  if(id!==state.load || uid!==VY.uid) return;
  if(r.error || s.error) { msg("Laden fehlgeschlagen: "+errText(r.error||s.error)); return; }
  state.recipes = r.data||[];
  state.items = s.data||[];
  renderRecipes();
  renderShopping();
  await loadPlan();
}

// -----------------------------------
// Reiter
// -----------------------------------

function setupTabs() {
  $("kitchenTabs").addEventListener("click",event => {
    const b = event.target.closest("button[data-tab]");
    if(!b) return;
    state.tab = b.dataset.tab;
    for(const x of $("kitchenTabs").querySelectorAll("button")) x.setAttribute("aria-selected",String(x===b));
    for(const [tab,panel] of [["recipes","recipePanel"],["plan","planPanel"],["shop","shopPanel"]]) {
      $(panel).classList.toggle("hidden",state.tab!==tab);
    }
  });
}

// -----------------------------------
// Rezepte
// -----------------------------------

function perServing(recipe) {
  const total = {kcal:0,protein:0,carbs:0,fat:0,fiber:0,fiberKnown:true};
  for(const ing of recipe.ingredients||[]) {
    const f = (Number(ing.grams)||0)/100;
    total.kcal += f*(Number(ing.kcal)||0);
    total.protein += f*(Number(ing.protein)||0);
    total.carbs += f*(Number(ing.carbs)||0);
    total.fat += f*(Number(ing.fat)||0);
    if(ing.fiber==null) total.fiberKnown = false;
    else total.fiber += f*Number(ing.fiber);
  }
  const n = Math.max(1,Number(recipe.servings)||1);
  return {kcal:total.kcal/n,protein:total.protein/n,carbs:total.carbs/n,fat:total.fat/n,
    fiber:total.fiberKnown ? total.fiber/n : null};
}

function renderRecipes() {
  const list = $("recipeList");
  list.replaceChildren();
  if(!state.recipes.length) {
    list.append(el("p",{class:"muted"},"Noch keine Rezepte. Leg dein erstes Lieblingsessen an – die Nährwerte pro Portion rechnet VYORA aus."));
    return;
  }
  for(const r of state.recipes) {
    const p = perServing(r);
    list.append(el("div",{class:"meal-row"},
      el("div",{},
        el("strong",{},r.name),
        el("small",{},"1 Portion: "+de(p.kcal,0)+" kcal · "+de(p.protein)+" g Eiweiß"+
          (p.fiber!=null ? " · "+de(p.fiber)+" g Ballaststoffe" : "")+" · "+r.servings+" Portion"+(r.servings==1 ? "" : "en"))),
      el("div",{class:"row-actions"},
        el("button",{type:"button",class:"soft-btn","aria-label":"1 Portion ins Tagebuch: "+r.name,onclick:e => logRecipe(r,e.currentTarget)},"＋ Tagebuch"),
        el("button",{type:"button",class:"soft-btn","aria-label":"Ändern: "+r.name,onclick:() => openEditor(r)},"Ändern"))));
  }
}

async function logRecipe(r,button) {
  const uid = VY.uid;
  if(!uid) return;
  const p = perServing(r);
  const day = VY.nutritionDate;
  button.disabled = true;
  try {
    const row = {
      user_id:uid,
      meal_type:$("kitchenMeal").value,
      food_name:(r.name+" (1 Portion)").slice(0,200),
      entry_date:day,
      calories:Math.round(p.kcal*10)/10,
      protein:Math.round(p.protein*10)/10,
      carbs:Math.round(p.carbs*10)/10,
      fat:Math.round(p.fat*10)/10
    };
    if(p.fiber!=null) row.fiber_g = Math.round(p.fiber*10)/10;
    const res = await VY.saveOrQueue("nutrition_entries",row);
    msg("✓ 1 Portion „"+r.name+"“ als "+MEAL[row.meal_type]+" am "+shortDate(day)+" eingetragen"+(res?.queued ? " (offline vorgemerkt)." : "."));
    VY.reloadNutrition();
  } catch(error) {
    msg("Eintragen fehlgeschlagen: "+errText(error));
  } finally {
    button.disabled = false;
  }
}

// --- Rezept-Editor ---

function setupRecipeEditor() {
  $("recipeNew").addEventListener("click",() => openEditor(null));
  $("recipeCancel").addEventListener("click",closeEditor);
  $("recipeEditor").addEventListener("submit",saveRecipe);
  $("recipeDelete").addEventListener("click",deleteRecipe);
  $("ingSearchBtn").addEventListener("click",searchIngredient);
  $("ingSearch").addEventListener("keydown",e => { if(e.key==="Enter") { e.preventDefault(); searchIngredient(); } });
  $("ingManualBtn").addEventListener("click",addManualIngredient);
  $("recipeServings").addEventListener("input",renderIngredients);
}

function openEditor(r) {
  state.editing = r
    ? {id:r.id,name:r.name,servings:r.servings,ingredients:(r.ingredients||[]).map(i => ({...i})),steps:r.steps||""}
    : {id:null,name:"",servings:2,ingredients:[],steps:""};
  $("recipeEditor").classList.remove("hidden");
  $("recipeNew").classList.add("hidden");
  $("recipeEditorTitle").textContent = r ? "„"+r.name+"“ ändern" : "Neues Rezept";
  $("recipeName").value = state.editing.name;
  $("recipeServings").value = String(state.editing.servings);
  $("recipeSteps").value = state.editing.steps;
  $("recipeDelete").classList.toggle("hidden",!r);
  $("ingResults").replaceChildren();
  $("ingSearch").value = "";
  renderIngredients();
  $("recipeName").focus();
}

function closeEditor() {
  state.editing = null;
  $("recipeEditor")?.classList.add("hidden");
  $("recipeNew")?.classList.remove("hidden");
  $("recipeDelete")?.removeAttribute("data-confirm");
}

function renderIngredients() {
  const box = $("ingList");
  box.replaceChildren();
  const e = state.editing;
  if(!e) return;
  e.ingredients.forEach((ing,i) => {
    const grams = el("input",{type:"number",min:"0",max:"5000",step:"any",inputmode:"decimal",value:String(ing.grams ?? ""),
      "aria-label":"Menge in Gramm: "+ing.name,class:"ing-grams",
      oninput:ev => { ing.grams = Number(ev.target.value)||0; renderTotals(); }});
    box.append(el("div",{class:"ing-row"},
      el("div",{class:"ing-name"},el("strong",{},ing.name),
        el("small",{class:"muted"},de(ing.kcal,0)+" kcal/100 g"+(ing.fiber!=null ? " · "+de(ing.fiber)+" g Ballaststoffe" : ""))),
      el("label",{class:"ing-g"},grams,el("span",{},"g")),
      el("button",{type:"button",class:"icon-btn","aria-label":"Zutat entfernen: "+ing.name,
        onclick:() => { e.ingredients.splice(i,1); renderIngredients(); }},"✕")));
  });
  renderTotals();
}

function renderTotals() {
  const e = state.editing;
  if(!e) return;
  e.servings = Math.min(20,Math.max(1,Math.round(Number($("recipeServings").value)||1)));
  const p = perServing(e);
  $("recipeTotals").textContent = e.ingredients.length
    ? "Pro Portion: "+de(p.kcal,0)+" kcal · "+de(p.protein)+" g Eiweiß · "+de(p.carbs)+" g KH · "+de(p.fat)+" g Fett"+
      (p.fiber!=null ? " · "+de(p.fiber)+" g Ballaststoffe" : " · Ballaststoffe teilweise unbekannt")
    : "Noch keine Zutaten.";
}

async function searchIngredient() {
  const q = $("ingSearch").value.trim();
  const box = $("ingResults");
  if(q.length<2) { box.replaceChildren(el("p",{class:"muted"},"Bitte mindestens 2 Zeichen eingeben.")); return; }
  box.replaceChildren(el("p",{class:"muted"},"Suche läuft ..."));
  try {
    const foods = (await VY.searchFoods(q)).slice(0,8);
    box.replaceChildren();
    if(!foods.length) { box.append(el("p",{class:"muted"},"Nichts gefunden. Du kannst die Zutat auch von Hand eintragen.")); return; }
    for(const f of foods) {
      box.append(el("button",{type:"button",class:"ing-hit",onclick:() => {
        state.editing.ingredients.push({name:(f.name+(f.brand ? " · "+f.brand : "")).slice(0,80),grams:100,
          kcal:f.calories,protein:f.protein,carbs:f.carbs,fat:f.fat,fiber:f.fiber ?? null});
        box.replaceChildren();
        $("ingSearch").value = "";
        renderIngredients();
        $("ingList").lastElementChild?.querySelector("input")?.focus();
      }},
        el("strong",{},f.name),
        el("small",{class:"muted"},(f.brand ? f.brand+" · " : "")+de(f.calories,0)+" kcal/100 g")));
    }
  } catch(error) {
    box.replaceChildren(el("p",{class:"muted"},"Suche fehlgeschlagen: "+errText(error)));
  }
}

function addManualIngredient() {
  const name = $("ingSearch").value.trim();
  if(!name) { $("ingResults").replaceChildren(el("p",{class:"muted"},"Gib zuerst einen Namen ein.")); return; }
  const num = id => { const v = Number(String($(id).value).replace(",",".")); return Number.isFinite(v) && v>=0 ? v : null; };
  const kcal = num("ingKcal");
  if(kcal==null || $("ingKcal").value==="") { $("ingResults").replaceChildren(el("p",{class:"muted"},"Bitte kcal pro 100 g angeben.")); return; }
  state.editing.ingredients.push({name:name.slice(0,80),grams:100,kcal,
    protein:num("ingProtein") ?? 0,carbs:num("ingCarbs") ?? 0,fat:num("ingFat") ?? 0,
    fiber:$("ingFiber").value==="" ? null : num("ingFiber")});
  for(const id of ["ingSearch","ingKcal","ingProtein","ingCarbs","ingFat","ingFiber"]) $(id).value = "";
  $("ingResults").replaceChildren();
  $("ingManual").open = false;
  renderIngredients();
}

async function saveRecipe(event) {
  event.preventDefault();
  const uid = VY.uid;
  const e = state.editing;
  if(!uid || !e) return;
  const name = $("recipeName").value.trim();
  if(!name) { msg("Bitte einen Namen für das Rezept eingeben."); return; }
  if(!e.ingredients.length) { msg("Bitte mindestens eine Zutat hinzufügen."); return; }
  if(e.ingredients.length>40) { msg("Höchstens 40 Zutaten pro Rezept."); return; }
  const row = {
    name,
    servings:Math.min(20,Math.max(1,Math.round(Number($("recipeServings").value)||1))),
    ingredients:e.ingredients.map(i => ({name:i.name,grams:Math.round((Number(i.grams)||0)*10)/10,
      kcal:i.kcal,protein:i.protein,carbs:i.carbs,fat:i.fat,fiber:i.fiber ?? null})),
    steps:$("recipeSteps").value.trim() || null,
    updated_at:new Date().toISOString()
  };
  $("recipeSave").disabled = true;
  try {
    const {error} = e.id
      ? await db.from("recipes").update(row).eq("id",e.id).eq("user_id",uid)
      : await db.from("recipes").insert({...row,user_id:uid});
    if(error) throw error;
    msg("✓ Rezept „"+name+"“ gespeichert.");
    closeEditor();
    await loadAll();
  } catch(error) {
    msg("Speichern fehlgeschlagen: "+errText(error));
  } finally {
    $("recipeSave").disabled = false;
  }
}

async function deleteRecipe() {
  const e = state.editing;
  const button = $("recipeDelete");
  if(!e?.id) return;
  if(button.dataset.confirm!=="1") {
    button.dataset.confirm = "1";
    button.textContent = "Wirklich löschen? Nochmal tippen";
    setTimeout(() => { button.dataset.confirm = ""; button.textContent = "Rezept löschen"; },4000);
    return;
  }
  button.disabled = true;
  const {error} = await db.from("recipes").delete().eq("id",e.id).eq("user_id",VY.uid);
  button.disabled = false;
  button.textContent = "Rezept löschen";
  button.dataset.confirm = "";
  if(error) { msg("Löschen fehlgeschlagen: "+errText(error)); return; }
  msg("Rezept gelöscht.");
  closeEditor();
  await loadAll();
}

// -----------------------------------
// Wochenplan
// -----------------------------------

function setupPlan() {
  $("planPrev").addEventListener("click",() => { state.week = addDays(state.week,-7); loadPlan(); });
  $("planNext").addEventListener("click",() => { state.week = addDays(state.week,7); loadPlan(); });
  $("planForm").addEventListener("submit",addPlan);
  $("planToShop").addEventListener("click",planToShopping);
}

async function loadPlan() {
  const uid = VY.uid;
  if(!uid) return;
  const id = state.load;
  const {data,error} = await db.from("meal_plan").select("id,day,meal_type,recipe_id,title")
    .eq("user_id",uid).gte("day",state.week).lte("day",addDays(state.week,6)).limit(200);
  if(id!==state.load || uid!==VY.uid) return;
  if(error) { msg("Wochenplan konnte nicht geladen werden: "+errText(error)); return; }
  state.plan = data||[];
  renderPlan();
}

function renderPlan() {
  $("planLabel").textContent = "Woche vom "+shortDate(state.week)+" bis "+shortDate(addDays(state.week,6));
  const daySel = $("planDay");
  daySel.replaceChildren(...DAYNAMES.map((n,i) => el("option",{value:addDays(state.week,i)},n+" "+shortDate(addDays(state.week,i)))));
  const today = VY.localDate();
  if(today>=state.week && today<=addDays(state.week,6)) daySel.value = today;
  $("planRecipe").replaceChildren(el("option",{value:""},"– freier Eintrag –"),
    ...state.recipes.map(r => el("option",{value:r.id},r.name)));

  const box = $("planWeek");
  box.replaceChildren();
  const order = Object.fromEntries(MEALS.map(([k],i) => [k,i]));
  for(let i=0;i<7;i++) {
    const day = addDays(state.week,i);
    const entries = state.plan.filter(p => p.day===day).sort((a,b) => order[a.meal_type]-order[b.meal_type]);
    box.append(el("div",{class:"plan-day"+(day===today ? " today" : "")},
      el("div",{class:"day-head"},DAYNAMES[i]+" "+shortDate(day)),
      entries.length ? entries.map(p => {
        const recipe = state.recipes.find(r => r.id===p.recipe_id);
        const label = recipe ? recipe.name : (p.title || "–");
        return el("div",{class:"plan-entry"},
          el("span",{},el("small",{class:"muted"},MEAL[p.meal_type]+" · "),label),
          el("button",{type:"button",class:"icon-btn","aria-label":"Aus dem Plan entfernen: "+label+" am "+DAYNAMES[i],
            onclick:e => removePlan(p,e.currentTarget)},"✕"));
      }) : el("small",{class:"muted"},"noch nichts geplant")));
  }
}

async function addPlan(event) {
  event.preventDefault();
  const uid = VY.uid;
  if(!uid) return;
  const recipe_id = $("planRecipe").value || null;
  const title = $("planTitle").value.trim();
  if(!recipe_id && !title) { msg("Wähle ein Rezept oder trag etwas ein."); return; }
  const row = {user_id:uid,day:$("planDay").value,meal_type:$("planMeal").value,recipe_id,title:recipe_id ? null : title.slice(0,100)};
  $("planAdd").disabled = true;
  const {error} = await db.from("meal_plan").insert(row);
  $("planAdd").disabled = false;
  if(error) { msg("Speichern fehlgeschlagen: "+errText(error)); return; }
  $("planTitle").value = "";
  msg("");
  await loadPlan();
}

async function removePlan(p,button) {
  button.disabled = true;
  const {error} = await db.from("meal_plan").delete().eq("id",p.id).eq("user_id",VY.uid);
  if(error) { button.disabled = false; msg("Entfernen fehlgeschlagen: "+errText(error)); return; }
  await loadPlan();
}

async function planToShopping() {
  const uid = VY.uid;
  if(!uid) return;
  // Zutaten aller geplanten Rezepte dieser Woche (je 1 Portion) zusammenzählen
  const sum = new Map();
  for(const p of state.plan) {
    const r = state.recipes.find(x => x.id===p.recipe_id);
    if(!r) continue;
    const n = Math.max(1,Number(r.servings)||1);
    for(const ing of r.ingredients||[]) {
      const key = ing.name.trim().toLowerCase();
      const prev = sum.get(key) || {name:ing.name,grams:0};
      prev.grams += (Number(ing.grams)||0)/n;
      sum.set(key,prev);
    }
  }
  if(!sum.size) { msg("In dieser Woche sind noch keine Rezepte geplant."); return; }
  const open = new Set(state.items.filter(i => !i.done).map(i => i.name.trim().toLowerCase()));
  const rows = [...sum.values()].filter(x => !open.has(x.name.trim().toLowerCase()))
    .map(x => ({user_id:uid,name:x.name.slice(0,100),amount:x.grams ? Math.ceil(x.grams/5)*5+" g" : null}));
  if(!rows.length) { msg("Alle Zutaten stehen schon auf der Einkaufsliste."); return; }
  const {error} = await db.from("shopping_items").insert(rows);
  if(error) { msg("Übernehmen fehlgeschlagen: "+errText(error)); return; }
  msg("✓ "+rows.length+" Zutat"+(rows.length===1 ? "" : "en")+" auf die Einkaufsliste gesetzt (je 1 Portion pro geplanter Mahlzeit).");
  await loadAll();
}

// -----------------------------------
// Einkaufsliste
// -----------------------------------

function setupShopping() {
  $("shopForm").addEventListener("submit",addItem);
  $("shopClear").addEventListener("click",clearDone);
}

function renderShopping() {
  const list = $("shopList");
  list.replaceChildren();
  if(!state.items.length) {
    list.append(el("p",{class:"muted"},"Deine Einkaufsliste ist leer."));
    $("shopClear").classList.add("hidden");
    return;
  }
  const sorted = [...state.items].sort((a,b) => Number(a.done)-Number(b.done));
  for(const item of sorted) {
    const box = el("input",{type:"checkbox",checked:item.done,onchange:e => toggleItem(item,e.target)});
    list.append(el("label",{class:"shop-item"+(item.done ? " done" : "")},box,
      el("span",{},item.name),item.amount ? el("small",{class:"muted"},item.amount) : null));
  }
  $("shopClear").classList.toggle("hidden",!state.items.some(i => i.done));
}

async function addItem(event) {
  event.preventDefault();
  const uid = VY.uid;
  const name = $("shopName").value.trim();
  if(!uid || !name) return;
  const {error} = await db.from("shopping_items").insert({user_id:uid,name:name.slice(0,100),amount:$("shopAmount").value.trim().slice(0,40) || null});
  if(error) { msg("Speichern fehlgeschlagen: "+errText(error)); return; }
  $("shopName").value = ""; $("shopAmount").value = "";
  $("shopName").focus();
  await loadAll();
}

async function toggleItem(item,box) {
  box.disabled = true;
  const {error} = await db.from("shopping_items").update({done:box.checked}).eq("id",item.id).eq("user_id",VY.uid);
  box.disabled = false;
  if(error) { box.checked = !box.checked; msg("Ändern fehlgeschlagen: "+errText(error)); return; }
  item.done = box.checked;
  renderShopping();
}

async function clearDone() {
  const uid = VY.uid;
  if(!uid) return;
  const {error} = await db.from("shopping_items").delete().eq("user_id",uid).eq("done",true);
  if(error) { msg("Löschen fehlgeschlagen: "+errText(error)); return; }
  await loadAll();
}
