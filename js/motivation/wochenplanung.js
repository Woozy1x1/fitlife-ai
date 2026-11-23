import {$,VY,db} from "../lib/basis.js?v=5c0fb232ee";
import {addDays,el,errText,msg,shortDate,state} from "./kern.js?v=5c0fb232ee";

// -----------------------------------
// Wochenplanung
// -----------------------------------

const WD = ["Mo","Di","Mi","Do","Fr","Sa","So"];

export function setupWeekPlan() {
  if(!$("weekPlanCard")) return;
  $("weekPlanSave").addEventListener("click",saveWeekPlan);
}

export function renderWeekPlan() {
  const box = $("weekPlanBox");
  if(!box || !state.plan) return;
  box.replaceChildren();
  const today = VY.localDate();
  const todayNo = ((new Date(today+"T12:00:00").getDay()+6)%7)+1;
  const plan = state.plan;
  $("weekPlanLabel").textContent = "Woche vom "+shortDate(state.week)+" bis "+shortDate(addDays(state.week,6));

  const picker = el("div",{class:"day-picker days7",role:"group","aria-label":"Geplante Trainingstage"});
  WD.forEach((name,i) => picker.append(el("label",{},
    el("input",{type:"checkbox",name:"wpDay",value:String(i+1),checked:(plan.train_days||[]).map(Number).includes(i+1)}),
    el("span",{class:i+1===todayNo ? "is-today" : ""},name))));
  box.append(el("span",{class:"label"},"Trainingstage"),picker);

  const goals = [...(plan.goals||[])];
  while(goals.length<3) goals.push({text:"",done:false});
  const list = el("div",{class:"wp-goals"});
  goals.slice(0,3).forEach((g,i) => list.append(el("div",{class:"wp-goal"},
    el("input",{type:"checkbox",class:"wp-done",checked:!!g.done,"aria-label":"Ziel "+(i+1)+" erledigt"}),
    el("input",{type:"text",class:"wp-text",maxlength:"80",value:g.text||"",placeholder:["z. B. 3× Training","z. B. jeden Tag 5 am Tag","z. B. vor 23 Uhr ins Bett"][i],
      "aria-label":"Wochenziel "+(i+1)}))));
  box.append(el("span",{class:"label"},"Bis zu 3 Ziele für diese Woche"),list);

  const planned = (plan.train_days||[]).map(Number);
  if(planned.includes(todayNo)) box.prepend(el("p",{class:"tip"},el("strong",{},"Heute: "),"Laut deinem Plan ist heute ein Trainingstag."));
}

async function saveWeekPlan() {
  const uid = VY.uid;
  if(!uid || !state.plan) return;
  const train_days = [...document.querySelectorAll("input[name=wpDay]:checked")].map(i => Number(i.value));
  const texts = [...document.querySelectorAll("#weekPlanBox .wp-text")];
  const dones = [...document.querySelectorAll("#weekPlanBox .wp-done")];
  const goals = texts.map((t,i) => ({text:t.value.trim().slice(0,80),done:dones[i].checked})).filter(g => g.text);
  $("weekPlanSave").disabled = true;
  const {error} = await db.from("week_plans").upsert({user_id:uid,week_start:state.week,train_days,goals,updated_at:new Date().toISOString()},
    {onConflict:"user_id,week_start"});
  $("weekPlanSave").disabled = false;
  if(error) { msg("weekPlanMessage","Speichern fehlgeschlagen: "+errText(error)); return; }
  state.plan = {...state.plan,train_days,goals};
  const done = goals.filter(g => g.done).length;
  msg("weekPlanMessage","✓ Gespeichert"+(goals.length ? " · "+done+" von "+goals.length+" Zielen erledigt" : "")+".");
  renderWeekPlan();
}
