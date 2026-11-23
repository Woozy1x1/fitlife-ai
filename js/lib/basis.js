// VYORA AI – gemeinsame Bausteine für alle Module in js/
// VY = Schnittstelle zur App (aus js/app/18-start.js), db = Supabase, $ = getElementById.
// bind(api) wird einmal in js/plus.js aufgerufen.

export let VY = null;
export let db = null;
export let $ = null;

export function bind(api) {
  VY = api;
  db = api.supabase;
  $ = api.$;
}

// -----------------------------------
// Hilfsfunktionen
// -----------------------------------

export function el(tag,props={},...children) {
  const node = document.createElement(tag);
  for(const [key,value] of Object.entries(props||{})) {
    if(value==null || value===false) continue;
    if(key==="class") node.className = value;
    else if(key==="text") node.textContent = value;
    else if(key.startsWith("on")) node.addEventListener(key.slice(2),value);
    else if(key in node && typeof value!=="string") node[key] = value;
    else node.setAttribute(key,value===true ? "" : value);
  }
  for(const child of children.flat()) {
    if(child==null || child===false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function msg(id,text) {
  const node = $(id);
  if(node) node.textContent = text || "";
}

export function fmtDate(day,withYear=true) {
  if(!day) return "–";
  const d = new Date(day+"T12:00:00");
  return isNaN(d.getTime()) ? day : d.toLocaleDateString("de-DE",
    withYear ? {day:"2-digit",month:"2-digit",year:"numeric"} : {day:"2-digit",month:"2-digit"});
}

export function fmtDay(day) {
  if(day===VY.localDate()) return "Heute";
  if(day===VY.daysAgo(1)) return "Gestern";
  const d = new Date(day+"T12:00:00");
  return d.toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit"});
}

export function fmtNum(n,digits=1) {
  if(n==null || !Number.isFinite(Number(n))) return "–";
  return Number(n).toLocaleString("de-DE",{maximumFractionDigits:digits});
}

export function hhmm(t) {
  return String(t||"").slice(0,5);
}

export function clockOf(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" :
    String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}

export function dayOf(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : VY.dayString(d);
}

export function avg(list) {
  return list.length ? list.reduce((a,b) => a+b,0)/list.length : null;
}

export function errText(error) {
  const text = String(error?.message || error || "");
  return /fetch|network|offline/i.test(text)
    ? "Keine Verbindung. Bitte später noch einmal versuchen."
    : text;
}

export function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function delButton(label,onClick) {
  return el("button",{type:"button","aria-label":label,onclick:onClick},"Löschen");
}

export function timeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin"; }
  catch(_e) { return "Europe/Berlin"; }
}
