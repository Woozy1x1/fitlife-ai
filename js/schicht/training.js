import {$,VY,el,msg} from "../lib/basis.js";
import {KINDS,WD,addDays,fromMin,mondayOf,shiftOn,state,toMin,weekdayOf} from "./kern.js";

// -----------------------------------
// Bewegung passend zur Schicht (Training)
// -----------------------------------

function moveLine(s) {
  if(!s || s.kind==="frei") return "Frei: Bewegung, wann es dir passt – draußen bei Tageslicht hilft das zusätzlich deinem Schlaf-Wach-Rhythmus.";
  const a = toMin(s.start), e = toMin(s.end);
  if(s.kind==="frueh") return "Frühdienst: gut passt der Nachmittag nach dem Dienst, etwa "+fromMin(e+60)+"–"+fromMin(e+240)+
    " Uhr. Intensives Training lieber nicht kurz vor dem frühen Schlafengehen.";
  if(s.kind==="spaet") return "Spätdienst: gut passt der Vormittag, etwa "+fromMin(a-270)+"–"+fromMin(a-120)+" Uhr.";
  if(s.kind==="nacht") return "Nachtdienst: nach dem Tagschlaf am Nachmittag, spätestens etwa "+fromMin(a-180)+
    " Uhr fertig sein. Direkt nach dem Dienst nur locker bewegen (z. B. kurzer Spaziergang), dann schlafen.";
  return "Anderer Dienst: Bewegung vor oder nach dem Dienst einplanen – mit etwas Abstand zum Schlafen.";
}

export function renderMove() {
  const card = $("shiftMoveCard");
  if(!card) return;
  card.classList.toggle("hidden",!state.mode || !VY.uid);
  if(!state.mode) return;
  const today = VY.localDate();
  const week = el("div",{class:"shift-week","aria-label":"Deine Dienste in den nächsten 7 Tagen"});
  for(let i=0;i<7;i++) {
    const day = addDays(today,i), s = shiftOn(day);
    week.append(el("div",{class:"sw-day"+(s ? " k-"+s.kind : "")},
      el("small",{},i===0 ? "heute" : WD[weekdayOf(day)]),
      el("strong",{},s ? KINDS[s.kind].short : "·")));
  }
  $("shiftMoveBox").replaceChildren(
    week,
    el("p",{class:"tip"},el("strong",{},"Allgemeiner Tipp: "),moveLine(shiftOn(today))),
    el("p",{class:"muted small-note"},"Plane Trainingstage in der Wochenplanung gern um deine Dienste herum – zum Beispiel an freien Tagen oder nach Frühdiensten."));
}

// -----------------------------------
// Training: Erholung und Wochenplanung
// -----------------------------------

function nightsInRow(day) {
  let n = 0;
  for(let d=day; shiftOn(d)?.kind==="nacht"; d=addDays(d,-1)) n++;
  return n;
}

export function renderRecoveryHint() {
  const box = $("recoveryShift");
  if(!box) return;
  box.replaceChildren();
  if(!state.mode || !VY.uid) return;
  const today = VY.localDate();
  const y = shiftOn(addDays(today,-1)), t = shiftOn(today);
  let text = null;
  if(y?.kind==="nacht" && t?.kind!=="nacht") text = "Nach dem Nachtdienst ist der Körper noch im Nachtrhythmus. Heute eher locker: Spaziergang an der frischen Luft oder Mobility statt hartem Training.";
  else if(t?.kind==="nacht" && nightsInRow(today)>=3) text = "Du bist im "+nightsInRow(today)+". Nachtdienst in Folge. Hartes Training lieber auf freie Tage legen – kurze, leichte Einheiten reichen jetzt.";
  else if(t?.kind==="nacht") text = "Heute Nachtdienst: Wenn du trainierst, dann nach dem Tagschlaf und mit etwas Abstand zum Dienst.";
  else if(y?.kind==="spaet" && t?.kind==="frueh") text = "Kurzer Wechsel von Spät auf Früh – der Schlaf war vermutlich kurz. Heute lieber locker trainieren oder pausieren.";
  if(text) box.append(el("p",{class:"tip"},el("strong",{},"Schichtdienst: "),text));
}

function weekDays() {
  const mon = mondayOf(VY.localDate());
  return Array.from({length:7},(_,i) => addDays(mon,i));
}

// Wie gut passt ein Tag zum Training? (höher = besser, 0 = lieber nicht)
function trainScore(day) {
  const y = shiftOn(addDays(day,-1)), t = shiftOn(day);
  if(t?.kind==="nacht") return 0;
  if(y?.kind==="nacht") return 0;
  if(!t) return 2;
  return {frei:4,frueh:3,spaet:2,sonder:2}[t.kind] ?? 1;
}

export function renderWeekPlanHint() {
  const box = $("wpShiftBox");
  if(!box) return;
  box.classList.toggle("hidden",!state.mode || !VY.uid);
  if(!state.mode) return;
  const days = weekDays();
  const row = el("div",{class:"shift-week","aria-label":"Deine Dienste in dieser Woche"});
  for(const d of days) {
    const s = shiftOn(d);
    row.append(el("div",{class:"sw-day"+(s ? " k-"+s.kind : "")},el("small",{},WD[weekdayOf(d)]),el("strong",{},s ? KINDS[s.kind].short : "·")));
  }
  $("wpShiftRow").replaceChildren(row);
}

export function suggestTrainDays() {
  const days = weekDays();
  const boxes = [...document.querySelectorAll("input[name=wpDay]")];
  if(boxes.length!==7) return;
  const want = Math.max(2,Math.min(4,boxes.filter(b => b.checked).length || 3));
  const order = days.map((d,i) => ({i,score:trainScore(d)})).filter(x => x.score>0)
    .sort((a,b) => b.score-a.score || a.i-b.i);
  const picked = [];
  for(const x of order) {
    if(picked.length>=want) break;
    if(picked.some(p => Math.abs(p-x.i)===1) && order.length>want+1) continue;
    picked.push(x.i);
  }
  for(const x of order) { if(picked.length>=want) break; if(!picked.includes(x.i)) picked.push(x.i); }
  boxes.forEach((b,i) => { b.checked = picked.includes(i); });
  msg("wpShiftMessage",picked.length
    ? "Vorschlag: "+picked.sort((a,b) => a-b).map(i => WD[i]).join(", ")+" – an freien Tagen oder nach Frühdiensten, nicht im oder direkt nach dem Nachtdienst. Zum Übernehmen „Plan speichern“ tippen."
    : "In dieser Woche passt laut Dienstplan kaum ein Tag – vielleicht eine kurze, lockere Einheit?");
}
