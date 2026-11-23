// VYORA AI – Erweiterungen
// Medikamentenplan, Symptom-Tagebuch, Laborwerte, Blutdruck-Woche,
// Arztbericht, Zwei-Faktor-Anmeldung, Schichtarbeit und Bestleistungen.
//
// Diese Datei startet nur noch die einzelnen Module. Der eigentliche Code
// liegt in js/gesundheit/, js/konto/, js/training/, js/schicht/ und js/lib/.
// Übersicht: js/LIESMICH.md
//
// Grundsatz (keine Medizinprodukt-Funktion): VYORA speichert und zeigt an,
// was du selbst einträgst. Es wird nichts bewertet, eingestuft oder
// vorhergesagt und keine Dosis berechnet.

import {setupReport} from "./gesundheit/arztbericht.js";
import {renderBpWeek} from "./gesundheit/blutdruck-woche.js";
import {loadLabs,setupLabs} from "./gesundheit/labor.js";
import {loadIntakes,loadMeds,resetMedForm,setupMeds} from "./gesundheit/medikamente.js";
import {setupSubnav} from "./gesundheit/reiter.js";
import {loadSymptoms,setupSymptoms} from "./gesundheit/symptome.js";
import {state} from "./gesundheit/zustand.js";
import {setupDayStart,syncDayStart} from "./konto/tagesbeginn.js";
import {loadSecurity,setupSecurity} from "./konto/zwei-faktor.js";
import {$,VY,bind,msg} from "./lib/basis.js";
import {loadPrs,schedulePrs} from "./training/bestleistungen.js";

// -----------------------------------
// Start
// -----------------------------------

export function init(api) {
  bind(api);

  setupSubnav();
  setupMeds();
  setupSymptoms();
  setupLabs();
  setupReport();
  setupSecurity();
  setupDayStart();

  VY.on("user",loadAll);
  VY.on("reset",resetAll);
  VY.on("refresh",onRefresh);
  VY.on("measures",renderBpWeek);
  VY.on("training",schedulePrs);

  if(VY.uid) loadAll();

  // Weitere Module: Zusammenhänge, Küche, Motivation
  for(const path of ["./auswertung/start.js","./kueche/start.js","./motivation/start.js","./schicht/start.js"]) {
    import(path).then(mod => mod.init(api)).catch(error => console.error("VYORA-Modul konnte nicht geladen werden",path,error));
  }
}

function loadAll() {
  if(!VY.uid) return;
  loadMeds();
  loadSymptoms();
  loadLabs();
  loadPrs();
  renderBpWeek();
  loadSecurity();
  syncDayStart();
}

function resetAll() {
  state.meds = [];
  state.intakes = [];
  state.intakeDay = "";
  state.symptoms = [];
  state.labs = [];
  state.prs = null;
  state.medLoad++; state.symLoad++; state.labLoad++; state.prLoad++;
  state.pendingFactor = null;
  for(const id of ["medToday","medList","symRecent","labList","bpWeek","prWeeks","printReport"]) {
    $(id)?.replaceChildren();
  }
  if($("prList")) $("prList").textContent = "Noch keine Trainings eingetragen.";
  for(const id of ["medMessage","symMessage","labMessage","reportMessage","mfaSetupMessage","dayStartMessage"]) msg(id,"");
  resetMedForm();
  $("mfaSetup")?.classList.add("hidden");
  $("mfaEnable")?.classList.add("hidden");
  $("mfaDisable")?.classList.add("hidden");
  if($("mfaQr")) $("mfaQr").removeAttribute("src");
  if($("mfaSecret")) $("mfaSecret").value = "";
  msg("mfaStatus","Wird geprüft ...");
}

function onRefresh() {
  // Neuer Tag (auch bei Schichtbeginn): Häkchen für heute neu laden
  if(state.intakeDay && state.intakeDay!==VY.localDate()) loadIntakes();
}
