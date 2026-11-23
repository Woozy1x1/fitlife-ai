import {$,VY} from "../lib/basis.js?v=5c0fb232ee";
import {addDays,shiftOn,state,toMin} from "./kern.js?v=5c0fb232ee";

// -----------------------------------
// Tageswechsel im Nachtdienst
// Während des Dienstes und bis 2 Stunden nach Dienstende zählt alles
// (Essen, Wasser, Häkchen) zum Tag, an dem der Dienst begonnen hat.
// Die Zeitfenster liegen nur auf diesem Gerät (localStorage).
// -----------------------------------

export function writeNightWindows() {
  const before = VY.localDate();
  const list = [];
  if(state.mode && state.autoday && VY.uid) {
    const today = VY.dayString(new Date());
    for(let i=-2;i<=28;i++) {
      const day = addDays(today,i);
      const s = shiftOn(day);
      if(s?.kind!=="nacht" || !s.start || !s.end) continue;
      const a = toMin(s.start), e = toMin(s.end);
      if(e>a) continue; // endet vor Mitternacht: kein Sonderfall
      const next = addDays(day,1);
      const from = new Date(next+"T00:00:00").getTime();
      const until = new Date(next+"T00:00:00").getTime()+(e+120)*60000;
      list.push({day,from,until});
    }
  }
  try {
    if(list.length) localStorage.setItem("vyora_night_days",JSON.stringify(list));
    else localStorage.removeItem("vyora_night_days");
  } catch(_e) {}
  // Hat sich dadurch der aktuelle Tag geändert? Dann Anzeigen neu laden.
  if(VY.localDate()!==before) {
    if($("nutritionDate")) $("nutritionDate").value = VY.localDate();
    setTimeout(() => VY.refresh(),0);
  }
}
