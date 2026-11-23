import {$,VY} from "../lib/basis.js";

// VYORA AI – Rezepte, Wochenplan und Einkaufsliste
// Nährwerte je Portion werden aus den Zutaten berechnet, die du einträgst
// oder über die Lebensmittelsuche (Open Food Facts) übernimmst.

export const state = {
  recipes:[],
  plan:[],
  items:[],
  week:null,
  editing:null,      // {id,name,servings,ingredients:[],steps}
  load:0,
  tab:"recipes"
};

export const MEALS = [["breakfast","Frühstück"],["lunch","Mittagessen"],["dinner","Abendessen"],["snack","Snack"]];
export const MEAL = Object.fromEntries(MEALS);
export const DAYNAMES = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];

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

export const de = (n,d=1) => Number(n||0).toLocaleString("de-DE",{maximumFractionDigits:d});
export const msg = text => { if($("kitchenMessage")) $("kitchenMessage").textContent = text || ""; };
export const errText = e => /fetch|network/i.test(String(e?.message||e)) ? "Keine Verbindung. Bitte später erneut versuchen." : String(e?.message||e);

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

export function shortDate(day) {
  return new Date(day+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
}
