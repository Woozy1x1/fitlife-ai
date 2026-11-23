import {state} from "./zustand.js?v=5c0fb232ee";
import {$,VY,db,delButton,el,errText,fmtDate,fmtNum,msg} from "../lib/basis.js?v=5c0fb232ee";

// -----------------------------------
// Laborwerte
// -----------------------------------

// Häufige Werte mit der üblichen Einheit als Vorschlag. Die Einheit auf
// dem eigenen Befund hat immer Vorrang (Labore nutzen unterschiedliche).
const LAB_SUGGEST = [
  ["HbA1c","%"],["Nüchternglukose","mg/dl"],["Gesamtcholesterin","mg/dl"],
  ["LDL-Cholesterin","mg/dl"],["HDL-Cholesterin","mg/dl"],["Triglyceride","mg/dl"],
  ["Lipoprotein(a)","nmol/l"],["Kreatinin","mg/dl"],["eGFR","ml/min/1,73m²"],
  ["Harnsäure","mg/dl"],["TSH","mU/l"],["Vitamin D (25-OH)","ng/ml"],
  ["Vitamin B12","pg/ml"],["Ferritin","ng/ml"],["Hämoglobin","g/dl"],
  ["CRP","mg/l"],["GPT (ALT)","U/l"],["GOT (AST)","U/l"],["Gamma-GT","U/l"],
  ["Kalium","mmol/l"],["Natrium","mmol/l"],["PSA","ng/ml"]
];

export function setupLabs() {
  if(!$("labForm")) return;
  $("labSuggest").replaceChildren(...LAB_SUGGEST.map(([name]) => el("option",{value:name})));
  // Einheit vorschlagen, sobald ein bekannter Wert gewählt ist
  const suggestUnit = () => {
    const name = $("labName").value.trim().toLowerCase();
    const hit = LAB_SUGGEST.find(([n]) => n.toLowerCase()===name);
    const known = state.labs.find(l => l.name.trim().toLowerCase()===name && l.unit);
    if(!$("labUnit").value && document.activeElement!==$("labUnit")) $("labUnit").value = known?.unit || hit?.[1] || "";
  };
  $("labName").addEventListener("input",suggestUnit);
  $("labName").addEventListener("change",suggestUnit);
  $("labDay").value = VY.localDate();
  $("labForm").addEventListener("submit",saveLab);
}

export async function loadLabs() {
  const uid = VY.uid;
  if(!uid) return;
  const id = ++state.labLoad;
  const {data,error} = await db.from("lab_results")
    .select("id,day,name,value,unit,ref_low,ref_high,note")
    .eq("user_id",uid)
    .order("day",{ascending:false})
    .limit(1000);
  if(id!==state.labLoad || uid!==VY.uid) return;
  if(error) {
    msg("labMessage","Laborwerte konnten nicht geladen werden: "+errText(error));
    return;
  }
  state.labs = data||[];
  renderLabs();
}

function labGroups(rows) {
  const groups = new Map();
  for(const row of rows) {
    const key = row.name.trim().toLowerCase();
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(list => list.sort((a,b) => b.day.localeCompare(a.day)))
    .sort((a,b) => b[0].day.localeCompare(a[0].day));
}

export function refText(row) {
  const lo = row.ref_low!=null, hi = row.ref_high!=null;
  if(!lo && !hi) return "";
  const unit = row.unit ? " "+row.unit : "";
  if(lo && hi) return fmtNum(row.ref_low,3)+"–"+fmtNum(row.ref_high,3)+unit;
  return lo ? "ab "+fmtNum(row.ref_low,3)+unit : "bis "+fmtNum(row.ref_high,3)+unit;
}

function sparkline(points,label) {
  // Nur der Verlauf deiner eigenen Werte – ohne Grenzen oder Farben,
  // die etwas bewerten würden.
  const values = points.map(p => Number(p.value));
  const min = Math.min(...values), max = Math.max(...values);
  const w = 120, h = 32, pad = 4;
  const span = max-min || 1;
  const xy = values.map((v,i) => [
    pad+(values.length===1 ? (w-2*pad)/2 : i*(w-2*pad)/(values.length-1)),
    h-pad-(v-min)/span*(h-2*pad)
  ]);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox",`0 0 ${w} ${h}`);
  svg.setAttribute("class","spark");
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label",label);
  const line = document.createElementNS(ns,"polyline");
  line.setAttribute("points",xy.map(p => p.map(n => n.toFixed(1)).join(",")).join(" "));
  svg.append(line);
  for(const [x,y] of xy) {
    const dot = document.createElementNS(ns,"circle");
    dot.setAttribute("cx",x.toFixed(1)); dot.setAttribute("cy",y.toFixed(1)); dot.setAttribute("r","2.4");
    svg.append(dot);
  }
  return svg;
}

function renderLabs() {
  const box = $("labList");
  if(!box) return;
  box.replaceChildren();
  if(!state.labs.length) {
    box.append(el("p",{class:"muted"},"Noch keine Laborwerte eingetragen."));
    return;
  }
  for(const group of labGroups(state.labs)) {
    const latest = group[0];
    const unit = latest.unit ? " "+latest.unit : "";
    const ref = refText(latest);
    const chrono = [...group].reverse().slice(-8);
    const summary = el("summary",{},
      el("span",{class:"lab-name"},latest.name),
      el("span",{class:"lab-value"},fmtNum(latest.value,3)+unit),
      el("small",{class:"muted"},fmtDate(latest.day)+(group.length>1 ? " · "+group.length+" Werte" : "")));
    const body = el("div",{class:"lab-body"},
      ref ? el("p",{class:"muted small-note"},"Referenzbereich laut deinem Befund: "+ref) : null,
      chrono.length>1 ? sparkline(chrono,"Verlauf "+latest.name+": "+
        chrono.map(p => fmtNum(p.value,3)+" am "+fmtDate(p.day)).join(", ")) : null,
      ...group.map(row => el("div",{class:"meal-row"},
        el("div",{},
          el("strong",{},fmtDate(row.day)+" · "+fmtNum(row.value,3)+(row.unit ? " "+row.unit : "")),
          el("small",{},row.note || "")),
        delButton("Löschen: "+row.name+" vom "+fmtDate(row.day),event => deleteLab(row,event.currentTarget)))));
    box.append(el("details",{class:"lab-group"},summary,body));
  }
}

function numOrNull(id) {
  const raw = $(id).value.trim().replace(",",".");
  if(raw==="") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

async function saveLab(event) {
  event.preventDefault();
  const uid = VY.uid;
  if(!uid) return;
  const day = $("labDay").value;
  const name = $("labName").value.trim();
  const value = numOrNull("labValue");
  const low = numOrNull("labLow");
  const high = numOrNull("labHigh");
  if(!day || !name || value==null) { msg("labMessage","Bitte Datum, Wert und Ergebnis angeben."); return; }
  if([value,low,high].some(n => Number.isNaN(n))) { msg("labMessage","Bitte nur Zahlen eingeben."); return; }
  if(day>VY.localDate()) { msg("labMessage","Das Datum liegt in der Zukunft."); return; }
  if(low!=null && high!=null && low>high) { msg("labMessage","„Referenz von“ ist größer als „bis“. Bitte prüfen."); return; }
  const row = {user_id:uid,day,name,value,unit:$("labUnit").value.trim() || null,ref_low:low,ref_high:high};
  $("labSave").disabled = true;
  try {
    const {error} = await db.from("lab_results").insert(row);
    if(error) throw error;
    msg("labMessage","„"+name+"“ gespeichert.");
    $("labName").value = ""; $("labValue").value = ""; $("labUnit").value = "";
    $("labLow").value = ""; $("labHigh").value = "";
    await loadLabs();
  } catch(error) {
    msg("labMessage","Speichern fehlgeschlagen: "+errText(error));
  } finally {
    $("labSave").disabled = false;
  }
}

async function deleteLab(row,button) {
  button.disabled = true;
  const {error} = await db.from("lab_results").delete().eq("id",row.id).eq("user_id",VY.uid);
  if(error) {
    button.disabled = false;
    msg("labMessage","Löschen fehlgeschlagen: "+errText(error));
    return;
  }
  msg("labMessage","Eintrag gelöscht.");
  await loadLabs();
}
