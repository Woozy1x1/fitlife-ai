// VYORA AI – Schichtdienst: Start, Laden und Anzeigen aller Schicht-Karten

import {$,VY,db} from "../lib/basis.js?v=5c0fb232ee";
import {renderPlan,setupPlan} from "./dienstplan.js?v=5c0fb232ee";
import {renderSettings,setupSettings} from "./einstellungen.js?v=5c0fb232ee";
import {renderFood} from "./ernaehrung.js?v=5c0fb232ee";
import {renderMedHint,renderToday} from "./heute.js?v=5c0fb232ee";
import {addDays,mondayOf,state} from "./kern.js?v=5c0fb232ee";
import {renderSleepPlan} from "./schlaf.js?v=5c0fb232ee";
import {writeNightWindows} from "./tageswechsel.js?v=5c0fb232ee";
import {renderMove,renderRecoveryHint,renderWeekPlanHint,suggestTrainDays} from "./training.js?v=5c0fb232ee";

// -----------------------------------
// Start
// -----------------------------------

export function init(api) {
  void api; // Schnittstelle ist über lib/basis.js verbunden
  setupSettings();
  setupPlan();
  $("wpShiftSuggest")?.addEventListener("click",suggestTrainDays);
  $("nutritionDate")?.addEventListener("change",renderFood);
  VY.on("user",loadAll);
  VY.on("reset",resetAll);
  VY.on("refresh",renderAll);
  if(VY.uid) loadAll();
}

function resetAll() {
  state.mode = false; state.quiet = true; state.autoday = true; state.quietWork = false; state.times = {};
  state.extra = {steps:new Map(),train:new Set(),energy:new Map()};
  writeNightWindows();
  state.plan = new Map(); state.sleep = new Map(); state.selected = null;
  state.load++;
  renderAll();
}

async function loadAll() {
  const uid = VY.uid;
  if(!uid) return;
  const id = ++state.load;
  const today = VY.localDate();
  const q = p => p.then(r => r.error ? null : r.data).catch(() => null);
  const [goals,plan,metrics,workouts,well] = await Promise.all([
    q(db.from("user_goals").select("shift_mode,shift_quiet,shift_times,shift_autoday,shift_quiet_work").eq("user_id",uid).maybeSingle())
      .then(g => g ?? q(db.from("user_goals").select("shift_mode,shift_quiet,shift_times").eq("user_id",uid).maybeSingle())),
    q(db.from("shift_plan").select("day,kind,start_time,end_time,note").eq("user_id",uid)
      .gte("day",VY.daysAgo(90)).lte("day",addDays(today,70)).limit(400)),
    q(db.from("daily_metrics").select("day,source,sleep_minutes,steps").eq("user_id",uid).gte("day",VY.daysAgo(90)).limit(400)),
    q(db.from("workout_entries").select("entry_date").eq("user_id",uid).gte("entry_date",VY.daysAgo(90)).limit(2000)),
    q(db.from("wellbeing_log").select("day,energy").eq("user_id",uid).gte("day",VY.daysAgo(90)).limit(400))
  ]);
  if(id!==state.load || uid!==VY.uid) return;
  state.mode = !!goals?.shift_mode;
  state.quiet = goals?.shift_quiet!==false;
  state.autoday = goals?.shift_autoday!==false;
  state.quietWork = !!goals?.shift_quiet_work;
  state.times = goals?.shift_times || {};
  state.plan = new Map((plan||[]).map(r => [r.day,r]));
  state.sleep = new Map();
  for(const m of metrics||[]) {
    if(m.sleep_minutes!=null && (!state.sleep.has(m.day) || m.source==="apple_health")) state.sleep.set(m.day,Number(m.sleep_minutes));
  }
  const steps = new Map(), energy = new Map();
  for(const m of metrics||[]) if(m.steps!=null && (!steps.has(m.day) || m.source==="apple_health")) steps.set(m.day,Number(m.steps));
  for(const w of well||[]) if(w.energy!=null) energy.set(w.day,Number(w.energy));
  state.extra = {steps,energy,train:new Set((workouts||[]).map(w => w.entry_date))};
  state.start = state.start || mondayOf(today);
  writeNightWindows();
  renderAll();
}

export function renderAll() {
  renderSettings();
  renderPlan();
  renderToday();
  renderSleepPlan();
  renderMove();
  renderFood();
  renderRecoveryHint();
  renderWeekPlanHint();
  renderMedHint();
}
