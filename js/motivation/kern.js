import {$,VY} from "../lib/basis.js";

// VYORA AI – Erfolge, 30-Tage-Challenges, Wochenplanung und Übungsbibliothek
// Bewusst ohne Abnehm-Challenges, Ranglisten oder Vergleiche mit anderen.

export const state = {challenges:[],week:null,plan:null,load:0,stats:null,libCat:"alle"};

export function el(tag,props={},...children) {
  const node = document.createElement(tag);
  for(const [key,value] of Object.entries(props||{})) {
    if(value==null || value===false) continue;
    if(key==="class") node.className = value;
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

export const errText = e => /fetch|network/i.test(String(e?.message||e)) ? "Keine Verbindung. Bitte später erneut versuchen." : String(e?.message||e);
export const msg = (id,text) => { if($(id)) $(id).textContent = text || ""; };

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
export const daysBetween = (a,b) => Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/864e5);
