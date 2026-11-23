import {addDays,de,el,fmtDate,hm,state} from "./kern.js?v=5c0fb232ee";
import {$,VY,db} from "../lib/basis.js?v=5c0fb232ee";

// -----------------------------------
// Tagesansicht
// -----------------------------------

export function setupDayView() {
  const input = $("dayViewDate");
  if(!input) return;
  input.value = VY.localDate();
  input.max = VY.localDate();
  input.addEventListener("change",loadDay);
  $("dayPrev")?.addEventListener("click",() => { input.value = addDays(input.value||VY.localDate(),-1); loadDay(); });
  $("dayNext")?.addEventListener("click",() => {
    const next = addDays(input.value||VY.localDate(),1);
    if(next<=VY.localDate()) { input.value = next; loadDay(); }
  });
}

const MEALS = {breakfast:"Frühstück",lunch:"Mittagessen",dinner:"Abendessen",snack:"Snack"};
const MOOD = ["","😣","🙁","😐","🙂","😄"];

export async function loadDay() {
  const uid = VY.uid;
  const box = $("dayBox");
  if(!uid || !box) return;
  const day = $("dayViewDate").value || VY.localDate();
  const id = ++state.dayLoad;
  box.replaceChildren(el("p",{class:"muted"},"Wird geladen ..."));
  const from = new Date(day+"T00:00:00"), to = new Date(day+"T00:00:00");
  to.setDate(to.getDate()+1);
  const q = p => p.then(r => r.error ? [] : (r.data||[])).catch(() => []);
  const [food,water,veg,train,meas,meds,intakes,sym,well,metr] = await Promise.all([
    q(db.from("nutrition_entries").select("meal_type,food_name,calories,protein,fiber_g").eq("user_id",uid).eq("entry_date",day).limit(200)),
    q(db.from("water_log").select("glasses").eq("user_id",uid).eq("day",day)),
    q(db.from("veg_log").select("portions").eq("user_id",uid).eq("day",day)),
    q(db.from("workout_entries").select("exercise,sets,reps,weight_kg").eq("user_id",uid).eq("entry_date",day).limit(200)),
    q(db.from("measurements").select("kind,measured_at,systolic,diastolic,pulse,glucose_mg_dl,insulin_units")
      .eq("user_id",uid).gte("measured_at",from.toISOString()).lt("measured_at",to.toISOString()).limit(200)),
    q(db.from("medications").select("id,name").eq("user_id",uid)),
    q(db.from("medication_intakes").select("medication_id,slot,taken_at").eq("user_id",uid).eq("day",day)),
    q(db.from("symptom_log").select("symptom,intensity,note").eq("user_id",uid).eq("day",day)),
    q(db.from("wellbeing_log").select("mood,energy,stress,note").eq("user_id",uid).eq("day",day)),
    q(db.from("daily_metrics").select("source,sleep_minutes,steps").eq("user_id",uid).eq("day",day))
  ]);
  if(id!==state.dayLoad || uid!==VY.uid) return;
  box.replaceChildren();

  const section = (icon,title,lines) => {
    if(!lines.length) return;
    box.append(el("div",{class:"day-sec"},
      el("h3",{},icon+" "+title),
      el("ul",{},lines.map(l => el("li",{},l)))));
  };

  const w = well[0];
  section("🌿","Befinden",w ? [
    "Stimmung "+MOOD[w.mood||0]+" · Energie "+(w.energy ?? "–")+"/5 · Stress "+(w.stress ?? "–")+"/5",
    w.note || null].filter(Boolean) : []);

  const sleepMin = VY.sleepMinutesByDay().get(day) ?? metr.find(m => m.sleep_minutes!=null)?.sleep_minutes;
  const stepsN = VY.stepsByDay().get(day) ?? metr.find(m => m.steps!=null)?.steps;
  section("😴","Schlaf & Bewegung",[
    sleepMin!=null ? "Schlaf in der Nacht zum "+new Date(day+"T12:00:00").toLocaleDateString("de-DE")+": "+hm(Number(sleepMin)) : null,
    stepsN!=null ? de(stepsN,0)+" Schritte" : null].filter(Boolean));

  if(food.length) {
    const kcal = food.reduce((a,f) => a+Number(f.calories||0),0);
    const prot = food.reduce((a,f) => a+Number(f.protein||0),0);
    section("🥗","Ernährung · "+de(kcal,0)+" kcal · "+de(prot,0)+" g Eiweiß",
      food.map(f => (MEALS[f.meal_type]||"")+": "+f.food_name+" · "+de(f.calories,0)+" kcal"));
  }
  const glasses = water[0]?.glasses, portions = veg[0]?.portions;
  section("💧","Trinken & Obst/Gemüse",[
    glasses!=null ? glasses+" Gläser Wasser" : null,
    portions!=null ? portions+" Portionen Obst & Gemüse" : null].filter(Boolean));

  section("🏋️","Training",train.map(t => t.exercise+(t.sets ? " · "+t.sets+"×"+(t.reps ?? "–") : "")+
    (Number(t.weight_kg) ? " · "+de(t.weight_kg)+" kg" : "")));

  const clock = iso => new Date(iso).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
  const unit = VY.glucoseUnit==="mmol_l";
  section("🩺","Messungen",meas.sort((a,b) => a.measured_at.localeCompare(b.measured_at)).map(m =>
    clock(m.measured_at)+" · "+(m.kind==="bp" ? "Blutdruck "+m.systolic+"/"+m.diastolic+(m.pulse ? " · Puls "+m.pulse : "") :
      m.kind==="glucose" ? "Blutzucker "+(unit ? de(m.glucose_mg_dl/18.0182) +" mmol/l" : de(m.glucose_mg_dl,0)+" mg/dl") :
      "Insulin "+de(m.insulin_units)+" IE")));

  const medName = idm => meds.find(m => m.id===idm)?.name || "Medikament";
  section("💊","Medikamente abgehakt",intakes.sort((a,b) => String(a.slot).localeCompare(String(b.slot)))
    .map(i => String(i.slot).slice(0,5)+" · "+medName(i.medication_id)));

  section("📝","Symptome",sym.map(s => s.symptom+" · Stärke "+s.intensity+"/10"+(s.note ? " · "+s.note : "")));

  if(!box.children.length) box.append(el("p",{class:"muted"},"Für "+fmtDate(day)+" gibt es keine Einträge."));
  else box.prepend(el("p",{class:"muted"},fmtDate(day)));
}
