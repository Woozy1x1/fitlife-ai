// VYORA AI – Anmeldung mit Google/Apple, Einwilligung und Zwei-Faktor-Anmeldung
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Anmeldung mit Google / Apple
// Die Knöpfe erscheinen nur, wenn der Anbieter
// in Supabase (Authentication → Providers) aktiviert ist.
// -----------------------------------

const APP_URL = "https://woozy1x1.github.io/fitlife-ai/";

async function setupSocialLogin() {
  try {
    const response = await fetch(SUPABASE_URL+"/auth/v1/settings",{
      headers:{apikey:SUPABASE_KEY}
    });
    if(!response.ok) return;

    const settings = await response.json();
    const external = settings.external || {};

    $("googleLogin").classList.toggle("hidden",external.google!==true);
    $("appleLogin").classList.toggle("hidden",external.apple!==true);
    $("socialLogin").classList.toggle(
      "hidden",
      external.google!==true && external.apple!==true
    );
  } catch(error) {
    // Ohne Verbindung bleiben nur E-Mail und Passwort.
  }
}

async function socialLogin(provider) {
  message("Weiterleitung zur Anmeldung ...");
  const {error} = await supabase.auth.signInWithOAuth({
    provider,
    options:{ redirectTo:APP_URL }
  });
  if(error) message("Anmeldung fehlgeschlagen: "+error.message);
}

$("googleLogin").addEventListener("click",() => socialLogin("google"));
$("appleLogin").addEventListener("click",() => socialLogin("apple"));

setupSocialLogin();

// -----------------------------------
// Einwilligung (Art. 9 Abs. 2 lit. a DSGVO),
// Datenexport und Konto löschen
// -----------------------------------

// Bei inhaltlichen Änderungen des Einwilligungstextes die Version
// erhöhen – dann wird die Einwilligung erneut abgefragt.
const CONSENT_VERSION = "2026-11-23";

let consentConfirmedFor = null;
let consentInfo = null;

// -----------------------------------
// Zwei-Faktor-Anmeldung (Code aus einer Authenticator-App)
// -----------------------------------

async function needsMfa(user) {
  if(!user || !supabase.auth.mfa) return false;
  try {
    const {data,error} = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if(error || !data) return false;
    return data.nextLevel==="aal2" && data.currentLevel!=="aal2";
  } catch(_error) {
    return false;
  }
}

function showMfaGate(show) {
  const card = $("mfaCard");
  if(!card) return;
  card.classList.toggle("hidden",!show);
  if(show) {
    $("mfaMessage").textContent = "";
    $("mfaCode").value = "";
    setTimeout(() => $("mfaCode").focus(),50);
  }
}

$("mfaForm")?.addEventListener("submit",async event => {
  event.preventDefault();
  const code = $("mfaCode").value.replace(/\s+/g,"");
  if(!/^\d{6}$/.test(code)) {
    $("mfaMessage").textContent = "Bitte den 6-stelligen Code aus deiner Authenticator-App eingeben.";
    return;
  }
  const button = $("mfaButton");
  button.disabled = true;
  $("mfaMessage").textContent = "Code wird geprüft ...";
  try {
    const {data:list,error:listError} = await supabase.auth.mfa.listFactors();
    if(listError) throw listError;
    const factor = (list?.totp||[]).find(f => f.status==="verified");
    if(!factor) throw new Error("Kein bestätigter zweiter Faktor gefunden.");
    const {error} = await supabase.auth.mfa.challengeAndVerify({factorId:factor.id,code});
    if(error) throw error;
    $("mfaMessage").textContent = "";
    await refreshUI();
  } catch(error) {
    $("mfaMessage").textContent = /invalid|expired|code/i.test(String(error?.message))
      ? "Der Code stimmt nicht oder ist abgelaufen. Bitte den aktuellen Code eingeben."
      : "Prüfung fehlgeschlagen: "+(error?.message||error);
  } finally {
    button.disabled = false;
  }
});

$("mfaLogout")?.addEventListener("click",async () => {
  await supabase.auth.signOut();
  showMfaGate(false);
  await refreshUI();
});

function consentMessage(text) {
  $("consentMessage").textContent = text || "";
}

function privacyMessage(text) {
  $("privacyMessage").textContent = text || "";
}

async function loadConsent(userId) {
  const {data,error} = await supabase
    .from("user_consents")
    .select("consent_type,version,granted,created_at")
    .eq("user_id",userId)
    .eq("consent_type","health_data")
    .order("created_at",{ascending:false})
    .limit(1);

  if(error) throw error;
  return data && data[0] ? data[0] : null;
}

function consentValid(row) {
  return !!row && row.granted===true && row.version===CONSENT_VERSION;
}

function renderConsentStatus() {
  $("consentStatus").textContent = consentInfo
    ? "Einwilligung zur Verarbeitung deiner Gesundheitsdaten erteilt am "+
      new Date(consentInfo.created_at).toLocaleString("de-DE")+
      " (Version "+consentInfo.version+")."
    : "Keine gültige Einwilligung gefunden.";
}

function showConsentGate(show) {
  $("consentCard").classList.toggle("hidden",!show);
  if(show) {
    $("dashboard").classList.add("hidden");
    $("consentForm").reset();
  }
}

$("consentForm").addEventListener("submit",async event => {
  event.preventDefault();

  if(!$("consentHealth").checked || !$("consentTerms").checked) {
    consentMessage("Bitte bestätige beide Punkte.");
    return;
  }

  $("consentButton").disabled = true;
  consentMessage("Einwilligung wird gespeichert ...");

  try {
    const {data:{user},error:userError} = await supabase.auth.getUser();
    if(userError || !user) throw new Error("Bitte erneut anmelden.");

    const {error} = await supabase
      .from("user_consents")
      .insert([
        { user_id:user.id, consent_type:"health_data",
          version:CONSENT_VERSION, granted:true },
        { user_id:user.id, consent_type:"terms",
          version:CONSENT_VERSION, granted:true }
      ]);

    if(error) throw error;

    consentMessage("");
    await refreshUI();
  } catch(error) {
    consentMessage("Speichern fehlgeschlagen: "+error.message);
  } finally {
    $("consentButton").disabled = false;
  }
});

$("consentDecline").addEventListener("click",async () => {
  try { localStorage.removeItem(CONSENT_OK_KEY); } catch(_e) {}
  await supabase.auth.signOut();
  consentConfirmedFor = null;
  showConsentGate(false);
  message("Du bist abgemeldet. Ohne Einwilligung können wir keine "+
    "Gesundheitsdaten für dich speichern.");
  await refreshUI();
});

// Datenexport (Art. 15 und 20 DSGVO)
$("exportButton").addEventListener("click",async () => {
  if(!currentUserId) return;

  const button = $("exportButton");
  button.disabled = true;
  privacyMessage("Export wird erstellt ...");

  try {
    const userId = currentUserId;
    const {data:{user}} = await supabase.auth.getUser();

    const tables = [
      ["mahlzeiten","nutrition_entries"],
      ["trainings","workout_entries"],
      ["trainingsplaene","workout_plans"],
      ["tagesziele","user_goals"],
      ["wasser","water_log"],
      ["obst_gemuese","veg_log"],
      ["wohlbefinden","wellbeing_log"],
      ["medikamente","medications"],
      ["medikamenten_einnahmen","medication_intakes"],
      ["symptome","symptom_log"],
      ["laborwerte","lab_results"],
      ["rezepte","recipes"],
      ["essensplan","meal_plan"],
      ["einkaufsliste","shopping_items"],
      ["challenges","user_challenges"],
      ["wochenplanung","week_plans"],
      ["dienstplan","shift_plan"],
      ["trainingsprogramm","training_program"],
      ["messtagebuch","measurements"],
      ["tageswerte","daily_metrics"],
      ["import_schluessel","import_tokens"],
      ["erinnerungen","reminders"],
      ["push_geraete","push_subscriptions"],
      ["gesundheitswerte","health_entries"],
      ["einwilligungen","user_consents"],
      ["oura_verbindung","oura_connections"]
    ];

    const result = {
      export_erstellt_am:new Date().toISOString(),
      app:"VYORA AI",
      konto:{
        id:user?.id ?? userId,
        email:user?.email ?? null,
        angemeldet_ueber:user?.app_metadata?.providers ?? null,
        erstellt_am:user?.created_at ?? null
      },
      hinweis:"Oura-Rohdaten werden nicht dauerhaft gespeichert, sondern "+
        "bei Bedarf live aus deinem Oura-Konto abgerufen. Die "+
        "Zugangsschlüssel zu Oura liegen verschlüsselt auf dem Server "+
        "und werden aus Sicherheitsgründen nicht exportiert."
    };

    for(const [name,table] of tables) {
      try {
        const {data,error} = await supabase
          .from(table)
          .select("*")
          .eq("user_id",userId);
        result[name] = error ? {fehler:error.message} : (data||[]);
      } catch(error) {
        result[name] = {fehler:String(error?.message || error)};
      }
    }

    const blob = new Blob(
      [JSON.stringify(result,null,2)],
      {type:"application/json"}
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vyora-datenexport-"+localDate()+".json";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url),5000);

    privacyMessage("✓ Export heruntergeladen.");
  } catch(error) {
    privacyMessage("Export fehlgeschlagen: "+error.message);
  } finally {
    button.disabled = false;
  }
});

// Widerruf + Konto löschen (Art. 7 Abs. 3 und Art. 17 DSGVO)
$("deleteConfirm").addEventListener("input",() => {
  $("deleteButton").disabled =
    $("deleteConfirm").value.trim()!=="LÖSCHEN";
});

$("deleteButton").addEventListener("click",async () => {
  if($("deleteConfirm").value.trim()!=="LÖSCHEN") return;
  if(!confirm(
    "Wirklich endgültig löschen? Dein Konto und alle Daten werden "+
    "unwiderruflich entfernt."
  )) return;

  $("deleteButton").disabled = true;
  privacyMessage("Konto wird gelöscht ...");

  const {error} = await supabase.rpc("delete_my_account");

  if(error) {
    privacyMessage("Löschen fehlgeschlagen: "+error.message+
      ". Bitte schreib an die E-Mail-Adresse im Impressum.");
    $("deleteButton").disabled = false;
    return;
  }

  // Das Konto existiert nicht mehr – lokale Sitzung und Vormerkungen entfernen.
  try {
    if(currentUserId) localStorage.removeItem(offlineKey(currentUserId));
    localStorage.removeItem(CONSENT_OK_KEY);
  } catch(_e) {}
  await supabase.auth.signOut({scope:"local"}).catch(() => {});
  consentConfirmedFor = null;
  consentInfo = null;
  $("deleteConfirm").value = "";
  privacyMessage("");
  message("✓ Dein Konto und alle deine Daten wurden gelöscht.");
  await refreshUI();
});
