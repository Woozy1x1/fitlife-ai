import {$,VY,reducedMotion} from "../lib/basis.js";

// -----------------------------------
// Gesundheit: vier Bereiche als Reiter
// (Heute · Messwerte · Schlaf · Arzt & Labor)
// -----------------------------------

const HEALTH_TABS = ["heute","messen","schlaf","arzt"];

function selectHealthTab(tab,{focus=false,scroll=false}={}) {
  if(!HEALTH_TABS.includes(tab)) tab = "heute";
  for(const key of HEALTH_TABS) {
    const on = key===tab;
    const button = $("htab-"+key);
    button?.setAttribute("aria-selected",String(on));
    button?.setAttribute("tabindex",on ? "0" : "-1");
    $("hpanel-"+key)?.classList.toggle("hidden",!on);
  }
  try { localStorage.setItem("vyora_health_tab",tab); } catch(_e) {}
  if(focus) $("htab-"+tab)?.focus();
  if(scroll) $("healthTabs")?.scrollIntoView({behavior:reducedMotion() ? "auto" : "smooth",block:"start"});
}

export function setupSubnav() {
  const bar = $("healthTabs");
  if(!bar) return;
  bar.addEventListener("click",event => {
    const button = event.target.closest("button[data-htab]");
    if(button) selectHealthTab(button.dataset.htab,{scroll:window.scrollY>200});
  });
  // Pfeiltasten wechseln zwischen den Reitern (Tastatur, Screenreader)
  bar.addEventListener("keydown",event => {
    const i = HEALTH_TABS.indexOf(document.activeElement?.dataset?.htab);
    if(i<0) return;
    let next = null;
    if(event.key==="ArrowRight") next = HEALTH_TABS[(i+1)%HEALTH_TABS.length];
    if(event.key==="ArrowLeft") next = HEALTH_TABS[(i+HEALTH_TABS.length-1)%HEALTH_TABS.length];
    if(event.key==="Home") next = HEALTH_TABS[0];
    if(event.key==="End") next = HEALTH_TABS[HEALTH_TABS.length-1];
    if(next) { event.preventDefault(); selectHealthTab(next,{focus:true}); }
  });
  let saved = "heute";
  try { saved = localStorage.getItem("vyora_health_tab") || "heute"; } catch(_e) {}
  // Direkt geöffnet, z. B. aus einer Benachrichtigung: #healthView/messen
  const [view,sub] = (location.hash||"").slice(1).split("/");
  selectHealthTab(view==="healthView" && sub ? sub : saved);
  VY.on("subview",({view,sub}) => { if(view==="healthView") selectHealthTab(sub); });
}
