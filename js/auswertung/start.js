import {loadAll} from "./daten.js?v=5c0fb232ee";
import {renderRecovery,renderRecoverySoon} from "./erholung.js?v=5c0fb232ee";
import {state} from "./kern.js?v=5c0fb232ee";
import {setupDayView} from "./tagesansicht.js?v=5c0fb232ee";
import {renderTip} from "./tipp.js?v=5c0fb232ee";
import {setupTabs} from "./zusammenhaenge.js?v=5c0fb232ee";
import {$,VY} from "../lib/basis.js?v=5c0fb232ee";

export function init(api) {

  setupTabs();
  setupDayView();

  VY.on("user",() => { state.data = null; setTimeout(loadAll,1500); });
  VY.on("reset",resetAll);
  VY.on("refresh",() => { renderRecovery(); renderTip(); });
  VY.on("training",() => setTimeout(renderRecoverySoon,500));
  if(VY.uid) setTimeout(loadAll,1500);
}

function resetAll() {
  state.data = null;
  state.load++; state.dayLoad++;
  for(const id of ["linksBox","dayBox","recoveryBox","tipBox"]) $(id)?.replaceChildren();
}
