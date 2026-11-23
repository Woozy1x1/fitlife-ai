import {$,VY,db} from "../lib/basis.js?v=5c0fb232ee";
import {daysBetween,el,shortDate,state} from "./kern.js?v=5c0fb232ee";

// -----------------------------------
// Erfolge (aus deinen Einträgen berechnet)
// -----------------------------------

export async function loadMilestones() {
  const uid = VY.uid;
  if(!uid || !$("milestoneBox")) return;
  const id = state.load;
  const q = p => p.then(r => r.error ? [] : (r.data||[])).catch(() => []);
  const [w,well,water,veg,food] = await Promise.all([
    q(db.from("workout_entries").select("entry_date").eq("user_id",uid).order("entry_date",{ascending:true}).limit(10000)),
    q(db.from("wellbeing_log").select("day").eq("user_id",uid).order("day",{ascending:true}).limit(2000)),
    q(db.from("water_log").select("day,glasses").eq("user_id",uid).order("day",{ascending:true}).limit(2000)),
    q(db.from("veg_log").select("day,portions").eq("user_id",uid).order("day",{ascending:true}).limit(2000)),
    q(db.from("nutrition_entries").select("entry_date").eq("user_id",uid).order("entry_date",{ascending:true}).limit(10000))
  ]);
  if(id!==state.load || uid!==VY.uid) return;
  const uniq = list => [...new Set(list)].sort();
  const goal = Number(VY.goals?.water_glasses)||8;
  state.stats = {
    train:uniq(w.map(x => x.entry_date)),
    well:uniq(well.map(x => x.day)),
    water:uniq(water.filter(x => Number(x.glasses)>=goal).map(x => x.day)),
    veg:uniq(veg.filter(x => Number(x.portions)>=5).map(x => x.day)),
    food:uniq(food.map(x => x.entry_date))
  };
  renderMilestones();
}

function longestStreak(days) {
  let best = 0, cur = 0, prev = null;
  for(const d of days) {
    cur = prev && daysBetween(prev,d)===1 ? cur+1 : 1;
    best = Math.max(best,cur);
    prev = d;
  }
  return best;
}

function renderMilestones() {
  const box = $("milestoneBox");
  const s = state.stats;
  if(!box || !s) return;
  box.replaceChildren();
  const active = uniqAll(s);
  const chDone = state.challenges.filter(c => (c.done_days||[]).length>=20).length;
  const list = [
    ["🏋️","Erstes Training",s.train,1],["🏋️","10 Trainingstage",s.train,10],["🏋️","50 Trainingstage",s.train,50],["🏆","100 Trainingstage",s.train,100],
    ["🌿","7 Check-ins",s.well,7],["🌿","30 Check-ins",s.well,30],
    ["💧","Wasserziel an 7 Tagen",s.water,7],["🥦","5 am Tag an 7 Tagen",s.veg,7],
    ["🥗","30 Tage Ernährung eingetragen",s.food,30],
    ["🔥","7 Tage am Stück aktiv",null,7,longestStreak(active)],
    ["🔥","30 Tage am Stück aktiv",null,30,longestStreak(active)],
    ["🎯","Challenge mit mind. 20 von 30 Tagen",null,1,chDone]
  ];
  const grid = el("div",{class:"badge-grid"});
  let reached = 0;
  for(const [icon,name,days,need,value] of list) {
    const have = value ?? days.length;
    const ok = have>=need;
    if(ok) reached++;
    const when = ok && days ? days[need-1] : null;
    grid.append(el("div",{class:"badge"+(ok ? " ok" : ""),"aria-label":name+(ok ? ", erreicht" : ", noch "+(need-have)+" bis zum Ziel")},
      el("span",{class:"badge-icon","aria-hidden":"true"},ok ? icon : "○"),
      el("strong",{},name),
      el("small",{class:"muted"},ok ? (when ? "am "+shortDate(when) : "erreicht") : Math.min(have,need)+" / "+need)));
  }
  box.append(el("p",{class:"muted"},reached+" von "+list.length+" Erfolgen erreicht · „aktiv“ = Training, Check-in, Wasser oder Ernährung eingetragen"),grid);
}

function uniqAll(s) {
  return [...new Set([...s.train,...s.well,...s.food,...s.water])].sort();
}
