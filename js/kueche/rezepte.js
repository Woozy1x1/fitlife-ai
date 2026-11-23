import {MEAL,de,el,errText,msg,shortDate,state} from "./kern.js?v=5c0fb232ee";
import {openEditor} from "./rezept-editor.js?v=5c0fb232ee";
import {$,VY} from "../lib/basis.js?v=5c0fb232ee";

// -----------------------------------
// Rezepte
// -----------------------------------

export function perServing(recipe) {
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

export function renderRecipes() {
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
