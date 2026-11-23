import {$,VY,el} from "../lib/basis.js?v=5c0fb232ee";
import {KINDS,addDays,shiftOn,state} from "./kern.js?v=5c0fb232ee";
import {sleepLines} from "./schlaf.js?v=5c0fb232ee";

// -----------------------------------
// Heute: Dienst und Schlafhinweis
// -----------------------------------

export function renderToday() {
  const card = $("shiftTodayCard");
  if(!card) return;
  card.classList.toggle("hidden",!state.mode || !VY.uid);
  if(!state.mode) return;
  const today = VY.localDate();
  const t = shiftOn(today), m = shiftOn(addDays(today,1));
  const box = $("shiftTodayBox");
  const tip = sleepLines(today)[0];
  box.replaceChildren(...[
    el("div",{class:"kv-grid two"},
      el("div",{class:"kv"},el("strong",{},t ? KINDS[t.kind].icon+" "+KINDS[t.kind].label : "–"),
        el("small",{},"Heute"+(t && t.kind!=="frei" && t.start ? " · "+t.start+"–"+t.end : ""))),
      el("div",{class:"kv"},el("strong",{},m ? KINDS[m.kind].icon+" "+KINDS[m.kind].label : "–"),
        el("small",{},"Morgen"+(m && m.kind!=="frei" && m.start ? " · "+m.start+"–"+m.end : "")))),
    tip ? el("p",{class:"tip"},el("strong",{},"😴 "),tip) : null,
    !t && !m ? el("p",{class:"muted small-note"},"Für heute und morgen ist noch kein Dienst eingetragen.") : null,
    el("button",{type:"button",class:"link-btn",onclick:openPlan},"Dienstplan bearbeiten")].filter(Boolean));
}

function openPlan() {
  VY.switchView("moreView");
  setTimeout(() => $("shiftPlanCard")?.scrollIntoView({behavior:"smooth",block:"start"}),300);
}

// -----------------------------------
// Medikamente: Hinweis im Schichtdienst
// -----------------------------------

export function renderMedHint() {
  $("medShiftNote")?.classList.toggle("hidden",!state.mode || !VY.uid);
}
