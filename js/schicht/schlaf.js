import {$,VY,el} from "../lib/basis.js?v=5c0fb232ee";
import {addDays,fromMin,hm,shiftOn,shiftText,state,toMin} from "./kern.js?v=5c0fb232ee";

// -----------------------------------
// Schlaf passend zur Schicht
// -----------------------------------

export function sleepLines(day) {
  const y = shiftOn(addDays(day,-1)), t = shiftOn(day), m = shiftOn(addDays(day,1));
  const out = [];
  const lastNight = y?.kind==="nacht" && t?.kind!=="nacht";
  if(lastNight) {
    out.push("Nach dem letzten Nachtdienst: nur kurz schlafen (etwa 3–4 Stunden, bis zum frühen Nachmittag), "+
      "dann wach bleiben, Tageslicht tanken und abends zur gewohnten Zeit ins Bett – so kommst du schneller in den Tagesrhythmus.");
  }
  if(t?.kind==="nacht" && t.start) {
    const s = toMin(t.start), e = toMin(t.end);
    if(y?.kind!=="nacht") out.push("Vor dem ersten Nachtdienst: Vorschlaf am Nachmittag, etwa "+fromMin(s-450)+"–"+fromMin(s-360)+" Uhr.");
    else out.push("Vor dem Nachtdienst hilft vielen ein Nickerchen von 20–90 Minuten.");
    out.push("Nach dem Dienst möglichst bald schlafen – etwa "+fromMin(e+45)+"–"+fromMin(e+45+420)+" Uhr. Zimmer abdunkeln, Handy lautlos.");
  }
  if(t?.kind==="spaet" && t.end && m?.kind!=="frueh") {
    out.push("Nach dem Spätdienst (Ende "+t.end+"): etwa eine Stunde runterkommen, dann gegen "+fromMin(toMin(t.end)+60)+" Uhr schlafen.");
  }
  if(m?.kind==="frueh" && m.start) {
    const wake = toMin(m.start)-75, bed = wake-450;
    const bedAbs = ((bed%1440)+1440)%1440;
    const endT = t && t.kind!=="frei" && t.kind!=="nacht" && t.end ? toMin(t.end) : null;
    if(endT!=null && endT>=12*60 && endT+45>bedAbs) {
      const left = (wake+1440)-(endT+45);
      out.push("Spät auf Früh ist ein kurzer Wechsel: nach dem Dienst ("+t.end+") möglichst schnell schlafen. "+
        "Mit Wecker gegen "+fromMin(wake)+" Uhr bleiben dir nur etwa "+hm(Math.max(left,0))+" Schlaf – plane morgen nach dem Dienst Ruhe oder ein Nickerchen ein.");
    } else {
      out.push("Für den Frühdienst morgen: gegen "+fromMin(bed)+" Uhr ins Bett, Wecker etwa "+fromMin(wake)+" Uhr – das sind rund 7½ Stunden Schlaf.");
    }
    if(t && t.kind!=="frei" && t.end && t.kind!=="nacht") {
      let rest = toMin(m.start)-toMin(t.end); if(rest<=0) rest += 1440;
      if(rest<11*60) out.push("Zwischen Dienstende heute ("+t.end+") und Dienstbeginn morgen ("+m.start+") liegen nur "+hm(rest)+
        ". Das Arbeitszeitgesetz sieht in der Regel mindestens 11 Stunden Ruhezeit vor.");
    }
  }
  if(!out.length && (t?.kind==="frei" || !t)) {
    out.push("Freie Tage: Feste Schlafzeiten helfen dem inneren Rhythmus – wenn möglich ähnlich wie an Arbeitstagen.");
  }
  return out;
}

// Gruppe eines Tages: Früh/Spät/Nacht/frei – „nach Nachtdienst“ hat Vorrang
function groupOf(day) {
  const y = shiftOn(addDays(day,-1)), t = shiftOn(day);
  if(y?.kind==="nacht" && t?.kind!=="nacht") return "afterNight";
  return t ? t.kind : null;
}

const GROUPS = [["frueh","Frühdienst"],["spaet","Spätdienst"],["nacht","Nachtdienst"],["afterNight","Nach Nachtdienst"],["frei","Frei"]];

function valuesByShift() {
  const sleep = new Map([...state.sleep,...VY.sleepMinutesByDay()]);
  const steps = new Map([...state.extra.steps,...VY.stepsByDay()]);
  const from = VY.daysAgo(90), today = VY.localDate();
  const g = {};
  for(const [k] of GROUPS) g[k] = {days:0,sleep:[],steps:[],energy:[],train:0};
  for(let d=from; d<=today; d=addDays(d,1)) {
    const k = groupOf(d);
    if(!k || !g[k]) continue;
    const x = g[k];
    x.days++;
    if(sleep.has(d)) x.sleep.push(sleep.get(d));
    if(steps.has(d) && d<today) x.steps.push(steps.get(d));
    if(state.extra.energy.has(d)) x.energy.push(state.extra.energy.get(d));
    if(state.extra.train.has(d)) x.train++;
  }
  return g;
}

function renderShiftTable(box) {
  const g = valuesByShift();
  const avg = l => l.length ? l.reduce((a,b) => a+b,0)/l.length : null;
  const rows = GROUPS.filter(([k]) => g[k].days>=3);
  if(!rows.length) return;
  const fmt = (v,f) => v==null ? "–" : f(v);
  box.append(el("h3",{},"Deine Werte nach Schicht"),
    el("div",{class:"table-wrap"},el("table",{class:"shift-table"},
      el("thead",{},el("tr",{},
        el("th",{scope:"col"},el("span",{class:"sr-only"},"Schicht")),el("th",{scope:"col"},"Schlaf"),el("th",{scope:"col"},"Schritte"),
        el("th",{scope:"col"},"Energie"),el("th",{scope:"col"},"Sport"))),
      el("tbody",{},rows.map(([k,label]) => {
        const x = g[k];
        return el("tr",{},el("th",{scope:"row"},label,el("small",{},x.days+" Tage")),
          el("td",{},fmt(avg(x.sleep),hm)),
          el("td",{},fmt(avg(x.steps),v => Math.round(v).toLocaleString("de-DE"))),
          el("td",{},fmt(avg(x.energy),v => v.toFixed(1).replace(".",","))),
          el("td",{},Math.round(x.train/x.days*100)+" %"));
      })))),
    el("p",{class:"muted small-note"},"Durchschnitt der letzten 90 Tage, nur Tage mit eingetragenem Dienst. Sport = Anteil der Tage mit eingetragenem Training. "+
      "Energie = deine Einschätzung im Check-in (1–5). Nur eine Übersicht, keine Bewertung."));
}

export function renderSleepPlan() {
  const card = $("shiftSleepCard");
  if(!card) return;
  card.classList.toggle("hidden",!state.mode || !VY.uid);
  if(!state.mode) return;
  const today = VY.localDate();
  const box = $("shiftSleepBox");
  const t = shiftOn(today);
  box.replaceChildren(
    el("p",{class:"muted"},"Heute: "+shiftText(t)+" · Morgen: "+shiftText(shiftOn(addDays(today,1)))),
    el("ul",{class:"shift-list"},sleepLines(today).map(l => el("li",{},l))));
  const before = box.childNodes.length;
  renderShiftTable(box);
  if(box.childNodes.length===before) {
    box.append(el("h3",{},"Deine Werte nach Schicht"),
      el("p",{class:"muted"},"Sobald für eine Schichtart mindestens 3 Tage im Dienstplan stehen, siehst du hier Schlaf, Schritte, Energie und Training je Schicht."));
  }
}
