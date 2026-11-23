import {DAYNAMES,MEAL,MEALS,addDays,el,errText,msg,shortDate,state} from "./kern.js?v=5c0fb232ee";
import {loadAll} from "./start.js?v=5c0fb232ee";
import {$,VY,db} from "../lib/basis.js?v=5c0fb232ee";

// -----------------------------------
// Wochenplan
// -----------------------------------

export function setupPlan() {
  $("planPrev").addEventListener("click",() => { state.week = addDays(state.week,-7); loadPlan(); });
  $("planNext").addEventListener("click",() => { state.week = addDays(state.week,7); loadPlan(); });
  $("planForm").addEventListener("submit",addPlan);
  $("planToShop").addEventListener("click",planToShopping);
}

export async function loadPlan() {
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
