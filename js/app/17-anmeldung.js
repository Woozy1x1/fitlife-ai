// VYORA AI – Anmeldung, Abmeldung und Laden aller Daten
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Anmeldung und Oura
// -----------------------------------

async function refreshUI() {
  const counter = ++refreshCounter;

  let {data,error} =
    await supabase.auth.getUser();

  // Offline: Server nicht erreichbar → angemeldete Sitzung auf diesem Gerät nutzen
  if(error && isNetworkError(error)) {
    const local = await supabase.auth.getSession();
    data = {user:local.data?.session?.user || null};
    error = null;
  }

  if(counter!==refreshCounter) return;

  const user = data?.user;

  $("authCard").classList.toggle(
    "hidden",
    !!user
  );

  // Dashboard erst zeigen, wenn die Einwilligung bestätigt ist.
  $("dashboard").classList.toggle(
    "hidden",
    !user || consentConfirmedFor!==user.id
  );

  $("avatar").classList.toggle(
    "hidden",
    !user
  );

  if(
    error &&
    error.name!=="AuthSessionMissingError"
  ) {
    message(error.message);
  }

  if(!user) {
    currentUserId = null;
    sleepData = [];
    nutritionData = [];
    ++nutritionLoadCounter;
    ++foodSearchCounter;
    try { stopScanner(); } catch(_error) {}
    resetTrainingAndHealth();
    resetTrackerAndPlans();
    consentConfirmedFor = null;
    consentInfo = null;
    showConsentGate(false);
    showMfaGate(false);
    vyEmit("reset");
    return;
  }

  // Zwei-Faktor-Anmeldung: erst den Code bestätigen, dann geht es weiter.
  if(await needsMfa(user)) {
    if(counter!==refreshCounter) return;
    currentUserId = null;
    resetTrainingAndHealth();
    resetTrackerAndPlans();
    vyEmit("reset");
    showConsentGate(false);
    $("dashboard").classList.add("hidden");
    showMfaGate(true);
    return;
  }
  if(counter!==refreshCounter) return;
  showMfaGate(false);

  // Ohne gültige Einwilligung werden KEINE Gesundheitsdaten
  // geladen oder abgerufen (auch nicht von Oura).
  if(consentConfirmedFor!==user.id) {
    let row = null;
    try {
      row = await loadConsent(user.id);
    } catch(error) {
      if(counter!==refreshCounter) return;
      // Offline: Wurde die aktuelle Einwilligung auf diesem Gerät schon
      // bestätigt, darf die App weiterlaufen (Prüfung folgt online).
      let ok = null;
      try { ok = JSON.parse(localStorage.getItem(CONSENT_OK_KEY)||"null"); } catch(_e) {}
      if(isNetworkError(error) && ok && ok.uid===user.id && ok.v===CONSENT_VERSION) {
        row = {consent_type:"health_data",version:CONSENT_VERSION,granted:true,created_at:ok.at};
      } else {
        showConsentGate(true);
        consentMessage("Einwilligung konnte nicht geprüft werden: "+
          error.message);
        return;
      }
    }

    if(counter!==refreshCounter) return;

    if(!consentValid(row)) {
      currentUserId = null;
      sleepData = [];
      nutritionData = [];
      ++nutritionLoadCounter;
      resetTrainingAndHealth();
      resetTrackerAndPlans();
      vyEmit("reset");
      showConsentGate(true);
      // Wer schon einmal zugestimmt hat, erfährt, warum erneut gefragt wird.
      $("consentUpdateNote").classList.toggle(
        "hidden",
        !(row && row.granted===true)
      );
      return;
    }

    consentConfirmedFor = user.id;
    consentInfo = row;
    try {
      localStorage.setItem(CONSENT_OK_KEY,JSON.stringify({uid:user.id,v:CONSENT_VERSION,at:row.created_at}));
    } catch(_e) {}
  }

  showConsentGate(false);
  $("dashboard").classList.remove("hidden");
  renderConsentStatus();
  setTimeout(flushQueue,0);

  const changed =
    currentUserId!==user.id;

  currentUserId = user.id;

  $("avatar").textContent =
    (user.email||"V")[0].toUpperCase();

  if(changed) {
    sleepData = [];
    nutritionData = [];

    $("mainScore").textContent = "–";
    $("miniSleep").textContent = "–";

    setScoreVisual(null);

    $("scoreRating").textContent =
      "Noch keine Daten";

    todayTotals = {calories:0,protein:0};
    todaySteps = null;
    userGoals = {kcal:null,protein_g:null,steps:null,water_glasses:null};
    calcProfile = null;
    if($("calcResult")) { $("calcResult").replaceChildren(); $("calcResult").classList.add("hidden"); }
    calcMessage("");
    fillCalcForm();
    resetWater();
    resetVeg();
    resetWellbeing();
    stopBreathing();
    if($("tourDialog")?.open) $("tourDialog").close();
    resetProgram();
    resetStretch();
    resetMeasurements();
    resetMetrics();
    resetReminders();
    resetInsights();
    fillGoalsForm();
    renderGoals();
    renderFrequentFoods([]);

    $("homeNutritionInfo").textContent =
      "Noch keine Mahlzeiten eingetragen.";

    clearFoodSelection();
    $("foodSearchResults").replaceChildren();
    renderSleep();
    renderNutrition();
    resetTrainingAndHealth();
    resetTrackerAndPlans();
    vyEmit("reset");
  }

  const params =
    new URLSearchParams(location.search);

  const ouraResult =
    params.get("oura");

  if(ouraResult) {
    ouraMessage(
      ouraResult==="connected"
        ? "Oura-Autorisierung erfolgreich."
        : "Oura-Freigabe abgebrochen."
    );

    const clean = new URL(
      location.href
    );

    clean.searchParams.delete("oura");

    history.replaceState(
      {},
      "",
      clean.toString()
    );
  }

  $("ouraStatus").textContent =
    "Verbindung wird geprüft ...";

  $("ouraButton").classList.add(
    "hidden"
  );

  $("sleepButton").classList.add(
    "hidden"
  );

  if(changed) {
    loadMetrics();
    loadAppleStatus();
    loadReminders();
    loadGoals();
    loadWater();
    loadVeg();
    loadWellbeing();
    loadProgram();
    loadMeasurements();
    loadNutrition();
    loadTraining();
    loadHealth();
    loadExerciseSuggestions();
    loadPlans();
    vyEmit("user");
  }

  try {
    const result =
      await authenticatedRequest("status");

    if(
      counter!==refreshCounter ||
      currentUserId!==user.id
    ) return;

    const connected =
      result.connected===true;

    setConnected(connected);

    if(
      connected &&
      (changed || !sleepData.length)
    ) {
      await loadSleep();
    }
    if(changed) {
      lastTrackerLoad = Date.now();
      autoDay = localDate();
    }

  } catch(error) {
    if(counter!==refreshCounter) return;

    $("ouraStatus").textContent =
      "Status konnte nicht geprüft werden.";

    $("ouraButton").classList.remove(
      "hidden"
    );

    ouraMessage(
      "Statusabfrage fehlgeschlagen: "+
      error.message
    );
  }
}
