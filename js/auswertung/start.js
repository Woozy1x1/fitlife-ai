import {loadAll} from "./daten.js";
import {renderRecovery,renderRecoverySoon} from "./erholung.js";
import {state} from "./kern.js";
import {setupDayView} from "./tagesansicht.js";
import {renderTip} from "./tipp.js";
import {setupTabs} from "./zusammenhaenge.js";
import {$,VY} from "../lib/basis.js";

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
