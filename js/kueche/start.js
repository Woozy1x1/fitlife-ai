import {renderShopping,setupShopping} from "./einkauf.js?v=5c0fb232ee";
import {errText,mondayOf,msg,state} from "./kern.js?v=5c0fb232ee";
import {closeEditor,setupRecipeEditor} from "./rezept-editor.js?v=5c0fb232ee";
import {renderRecipes} from "./rezepte.js?v=5c0fb232ee";
import {loadPlan,setupPlan} from "./wochenplan.js?v=5c0fb232ee";
import {$,VY,db} from "../lib/basis.js?v=5c0fb232ee";

export function init(api) {

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

export async function loadAll() {
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
