import {$,VY,avg,dayOf,el} from "../lib/basis.js?v=5c0fb232ee";

// -----------------------------------
// Blutdruck – letzte 7 Tage
// -----------------------------------

export function bpStats(rows) {
  const part = list => ({
    n:list.length,
    sys:avg(list.map(r => r.systolic)),
    dia:avg(list.map(r => r.diastolic)),
    pulse:avg(list.filter(r => r.pulse!=null).map(r => r.pulse)),
    days:new Set(list.map(r => dayOf(r.measured_at))).size
  });
  const hour = r => new Date(r.measured_at).getHours();
  return {
    morning:part(rows.filter(r => hour(r)>=4 && hour(r)<12)),
    evening:part(rows.filter(r => hour(r)>=17 || hour(r)<4)),
    all:part(rows)
  };
}

function bpKv(stat,label) {
  return el("div",{class:"kv"},
    el("strong",{},stat.n ? Math.round(stat.sys)+"/"+Math.round(stat.dia) : "–"),
    el("small",{},label+(stat.n ? " · "+stat.n+" Messung"+(stat.n===1 ? "" : "en") : "")));
}

export function renderBpWeek() {
  const box = $("bpWeek");
  if(!box) return;
  box.replaceChildren();
  const rows = (VY.measureData||[]).filter(m => m.kind==="bp" && m.systolic && m.diastolic);
  if(!rows.length) {
    box.append(el("p",{class:"muted"},"Noch keine Blutdruck-Messungen im Messtagebuch der letzten 7 Tage."));
    return;
  }
  const s = bpStats(rows);
  box.append(
    el("div",{class:"kv-grid"},bpKv(s.morning,"Ø morgens"),bpKv(s.evening,"Ø abends"),bpKv(s.all,"Ø alle")),
    el("p",{class:"muted small-note"},
      "mmHg · Messungen an "+s.all.days+" von 7 Tagen"+
      (s.all.pulse!=null ? " · Ø Puls "+Math.round(s.all.pulse)+"/min" : "")+
      ". Morgens = 4–12 Uhr, abends = ab 17 Uhr."),
    el("p",{class:"tip"},
      el("strong",{},"Allgemeiner Tipp: "),
      "Für ein Protokoll vor dem Arzttermin empfiehlt die Deutsche Hochdruckliga, "+
      "7 Tage lang morgens und abends jeweils zweimal im Abstand von etwa einer Minute "+
      "im Sitzen zu messen. Was die Werte für dich bedeuten, klärst du mit deiner Ärztin oder deinem Arzt."));
}
