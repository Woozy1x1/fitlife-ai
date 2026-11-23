import {VY} from "../lib/basis.js";

// VYORA AI – Schichtdienst (Frühdienst, Spätdienst, Nachtdienst)
// Dienstplan, eigene Dienstzeiten, Schlafplan passend zur Schicht und
// Bewegung passend zur Schicht. Alle Vorschläge sind allgemeine Tipps
// (BAuA, DGSM) – keine medizinische Beratung.

export const KINDS = {
  frueh:{label:"Frühdienst",short:"F",icon:"🌅",def:["06:00","14:00"]},
  spaet:{label:"Spätdienst",short:"S",icon:"🌆",def:["14:00","22:00"]},
  nacht:{label:"Nachtdienst",short:"N",icon:"🌙",def:["22:00","06:00"]},
  sonder:{label:"Anderer Dienst",short:"X",icon:"🕒",def:["08:00","16:30"]},
  frei:{label:"Frei",short:"–",icon:"🌿",def:null}
};
export const WD = ["Mo","Di","Mi","Do","Fr","Sa","So"];

export const state = {
  mode:false,
  quiet:true,
  autoday:true,
  quietWork:false,
  extra:{steps:new Map(),train:new Set(),energy:new Map()},
  times:{},
  plan:new Map(),
  sleep:new Map(),
  start:null,       // Montag der angezeigten 4 Wochen
  selected:null,
  load:0
};

export function addDays(day,n) {
  const d = new Date(day+"T12:00:00");
  d.setDate(d.getDate()+n);
  return VY.dayString(d);
}
export function mondayOf(day) {
  const d = new Date(day+"T12:00:00");
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  return VY.dayString(d);
}
export const shortDate = day => new Date(day+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
export const weekdayOf = day => (new Date(day+"T12:00:00").getDay()+6)%7;
export const toMin = t => { const [h,m] = String(t||"0:0").split(":").map(Number); return h*60+m; };
export const fromMin = m => { m = ((Math.round(m)%1440)+1440)%1440; return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0"); };
export const hm = min => Math.floor(min/60)+":"+String(Math.round(min%60)).padStart(2,"0")+" h";

export function timesFor(kind) {
  const own = state.times?.[kind];
  return Array.isArray(own) && own.length===2 ? own : KINDS[kind]?.def;
}

export function shiftOn(day) {
  const row = state.plan.get(day);
  if(!row) return null;
  const def = timesFor(row.kind);
  return {
    ...row,
    start:row.start_time ? String(row.start_time).slice(0,5) : def?.[0] || null,
    end:row.end_time ? String(row.end_time).slice(0,5) : def?.[1] || null
  };
}

export function shiftText(s) {
  if(!s) return "nichts eingetragen";
  const k = KINDS[s.kind];
  return k.icon+" "+k.label+(s.kind!=="frei" && s.start ? " "+s.start+"–"+s.end : "");
}
