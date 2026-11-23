import {$,VY,db} from "../lib/basis.js?v=5c0fb232ee";
import {setupLibrary} from "./bibliothek.js?v=5c0fb232ee";
import {renderChallenges,setupChallenges} from "./challenges.js?v=5c0fb232ee";
import {loadMilestones} from "./erfolge.js?v=5c0fb232ee";
import {mondayOf,state} from "./kern.js?v=5c0fb232ee";
import {renderWeekPlan,setupWeekPlan} from "./wochenplanung.js?v=5c0fb232ee";

export function init(api) {

  setupChallenges();
  setupWeekPlan();
  setupLibrary();
  VY.on("user",loadAll);
  VY.on("reset",resetAll);
  VY.on("refresh",() => { if(state.week && state.week!==mondayOf(VY.localDate())) loadAll(); else renderChallenges(); });
  if(VY.uid) loadAll();
}

function resetAll() {
  state.challenges = []; state.plan = null; state.stats = null;
  state.load++;
  for(const id of ["challengeBox","milestoneBox","weekPlanBox"]) $(id)?.replaceChildren();
}

export async function loadAll() {
  const uid = VY.uid;
  if(!uid) return;
  const id = ++state.load;
  state.week = mondayOf(VY.localDate());
  const [c,p] = await Promise.all([
    db.from("user_challenges").select("id,kind,started_on,ended_on,done_days").eq("user_id",uid).order("started_on",{ascending:false}).limit(50),
    db.from("week_plans").select("week_start,train_days,goals,note").eq("user_id",uid).eq("week_start",state.week).maybeSingle()
  ]);
  if(id!==state.load || uid!==VY.uid) return;
  state.challenges = c.error ? [] : (c.data||[]);
  state.plan = p.error ? null : (p.data || {week_start:state.week,train_days:[],goals:[],note:""});
  renderChallenges();
  renderWeekPlan();
  setTimeout(loadMilestones,2500);
}
