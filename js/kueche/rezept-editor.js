import {de,el,errText,msg,state} from "./kern.js";
import {perServing} from "./rezepte.js";
import {loadAll} from "./start.js";
import {$,VY,db} from "../lib/basis.js";

// --- Rezept-Editor ---

export function setupRecipeEditor() {
  $("recipeNew").addEventListener("click",() => openEditor(null));
  $("recipeCancel").addEventListener("click",closeEditor);
  $("recipeEditor").addEventListener("submit",saveRecipe);
  $("recipeDelete").addEventListener("click",deleteRecipe);
  $("ingSearchBtn").addEventListener("click",searchIngredient);
  $("ingSearch").addEventListener("keydown",e => { if(e.key==="Enter") { e.preventDefault(); searchIngredient(); } });
  $("ingManualBtn").addEventListener("click",addManualIngredient);
  $("recipeServings").addEventListener("input",renderIngredients);
}

export function openEditor(r) {
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

export function closeEditor() {
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
