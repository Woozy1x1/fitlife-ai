import {renderRecovery} from "./erholung.js";
import {state} from "./kern.js";
import {renderTip} from "./tipp.js";
import {renderLinks} from "./zusammenhaenge.js";
import {VY,db} from "../lib/basis.js";

// -----------------------------------
// Daten (letzte 90 Tage)
// -----------------------------------

export async function loadAll() {
  const uid = VY.uid;
  if(!uid) return;
  const id = ++state.load;
  const since = VY.daysAgo(89);
  const q = p => p.then(r => r.error ? [] : (r.data||[])).catch(() => []);
  const [metrics,well,workouts,water,veg] = await Promise.all([
    q(db.from("daily_metrics").select("day,source,sleep_minutes,steps,resting_hr").eq("user_id",uid).gte("day",since).limit(1000)),
    q(db.from("wellbeing_log").select("day,mood,energy,stress").eq("user_id",uid).gte("day",since).limit(400)),
    q(db.from("workout_entries").select("entry_date").eq("user_id",uid).gte("entry_date",since).limit(5000)),
    q(db.from("water_log").select("day,glasses").eq("user_id",uid).gte("day",since).limit(400)),
    q(db.from("veg_log").select("day,portions").eq("user_id",uid).gte("day",since).limit(400))
  ]);
  if(id!==state.load || uid!==VY.uid) return;

  // Schlaf und Schritte: eigene Einträge, Apple Health und (falls verbunden) Oura
  const sleep = new Map(), steps = new Map(), rhr = new Map();
  for(const m of metrics) {
    if(m.sleep_minutes!=null && (!sleep.has(m.day) || m.source==="apple_health")) sleep.set(m.day,Number(m.sleep_minutes));
    if(m.steps!=null) steps.set(m.day,Number(m.steps));
    if(m.resting_hr!=null) rhr.set(m.day,Number(m.resting_hr));
  }
  for(const [d,v] of VY.sleepMinutesByDay()) sleep.set(d,v);
  for(const [d,v] of VY.stepsByDay()) steps.set(d,v);

  state.data = {
    sleep,steps,rhr,
    well:new Map(well.map(w => [w.day,w])),
    train:new Set(workouts.map(w => w.entry_date)),
    water:new Map(water.map(w => [w.day,Number(w.glasses)||0])),
    veg:new Map(veg.map(v => [v.day,Number(v.portions)||0]))
  };
  renderLinks();
  renderRecovery();
  renderTip();
}
