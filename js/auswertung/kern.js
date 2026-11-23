import {VY} from "../lib/basis.js";

// VYORA AI – Zusammenhänge, Tagesansicht, Erholung und Tipp des Tages
//
// Alles hier ist beschreibend: Vergleiche aus deinen eigenen Einträgen,
// keine Ursachen, keine Bewertung, keine Diagnose. Allgemeine Tipps sind
// als solche gekennzeichnet und nennen ihre Quelle.

export const state = {data:null,load:0,dayLoad:0,tab:"links"};

export function el(tag,props={},...children) {
  const node = document.createElement(tag);
  for(const [key,value] of Object.entries(props||{})) {
    if(value==null || value===false) continue;
    if(key==="class") node.className = value;
    else if(key.startsWith("on")) node.addEventListener(key.slice(2),value);
    else node.setAttribute(key,value===true ? "" : value);
  }
  for(const child of children.flat()) {
    if(child==null || child===false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const de = (n,d=1) => Number(n).toLocaleString("de-DE",{maximumFractionDigits:d});
export const avg = list => list.length ? list.reduce((a,b) => a+b,0)/list.length : null;
export const hm = min => Math.floor(min/60)+":"+String(Math.round(min%60)).padStart(2,"0")+" h";

export function addDays(day,n) {
  const d = new Date(day+"T12:00:00");
  d.setDate(d.getDate()+n);
  return VY.dayString(d);
}

export function fmtDate(day) {
  const d = new Date(day+"T12:00:00");
  return d.toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"});
}
