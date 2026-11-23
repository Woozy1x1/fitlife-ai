import {state} from "../gesundheit/zustand.js";
import {$,db,errText,msg} from "../lib/basis.js";

// -----------------------------------
// Zwei-Faktor-Anmeldung einrichten
// -----------------------------------

export function setupSecurity() {
  if(!$("securityCard")) return;
  if(!db.auth.mfa) {
    msg("mfaStatus","Auf diesem Gerät nicht verfügbar.");
    return;
  }
  $("mfaEnable").addEventListener("click",startMfa);
  $("mfaCancel").addEventListener("click",cancelMfa);
  $("mfaVerifyForm").addEventListener("submit",verifyMfa);
  $("mfaDisable").addEventListener("click",disableMfa);
  $("mfaSecret").addEventListener("focus",event => event.target.select());
}

export async function loadSecurity() {
  if(!db.auth.mfa || !$("securityCard")) return;
  try {
    const {data,error} = await db.auth.mfa.listFactors();
    if(error) throw error;
    const verified = (data?.totp||[]).find(f => f.status==="verified");
    $("mfaSetup").classList.toggle("hidden",!state.pendingFactor);
    $("mfaEnable").classList.toggle("hidden",!!verified || !!state.pendingFactor);
    $("mfaDisable").classList.toggle("hidden",!verified);
    msg("mfaStatus",verified
      ? "✓ Aktiv seit "+new Date(verified.created_at || verified.updated_at || Date.now()).toLocaleDateString("de-DE")+
        ". Beim Anmelden auf einem neuen Gerät fragt VYORA nach dem Code."
      : "Nicht eingerichtet.");
  } catch(error) {
    msg("mfaStatus","Status konnte nicht geladen werden: "+errText(error));
  }
}

async function startMfa() {
  const button = $("mfaEnable");
  button.disabled = true;
  msg("mfaSetupMessage","");
  try {
    // Abgebrochene, nie bestätigte Versuche aufräumen
    const {data:list} = await db.auth.mfa.listFactors();
    for(const f of (list?.all||[])) {
      if(f.status!=="verified" && f.factor_type==="totp") await db.auth.mfa.unenroll({factorId:f.id});
    }
    const {data,error} = await db.auth.mfa.enroll({
      factorType:"totp",
      friendlyName:"VYORA "+new Date().toISOString().slice(0,16).replace("T"," ")
    });
    if(error) throw error;
    state.pendingFactor = data.id;
    $("mfaQr").src = data.totp.qr_code;
    $("mfaSecret").value = data.totp.secret;
    $("mfaVerifyCode").value = "";
    $("mfaSetup").classList.remove("hidden");
    button.classList.add("hidden");
    $("mfaVerifyCode").focus();
  } catch(error) {
    msg("mfaSetupMessage","Einrichtung fehlgeschlagen: "+errText(error));
  } finally {
    button.disabled = false;
  }
}

async function verifyMfa(event) {
  event.preventDefault();
  const code = $("mfaVerifyCode").value.replace(/\s+/g,"");
  if(!/^\d{6}$/.test(code)) { msg("mfaSetupMessage","Bitte den 6-stelligen Code aus der App eingeben."); return; }
  if(!state.pendingFactor) return;
  $("mfaVerifyButton").disabled = true;
  try {
    const {error} = await db.auth.mfa.challengeAndVerify({factorId:state.pendingFactor,code});
    if(error) throw error;
    state.pendingFactor = null;
    $("mfaQr").removeAttribute("src");
    $("mfaSecret").value = "";
    $("mfaSetup").classList.add("hidden");
    msg("mfaSetupMessage","Zwei-Faktor-Anmeldung ist aktiv. Bewahre den Zugang zu deiner Authenticator-App gut auf.");
    await loadSecurity();
  } catch(error) {
    msg("mfaSetupMessage",/invalid|expired|code/i.test(String(error?.message))
      ? "Der Code stimmt nicht. Prüfe, ob die Uhrzeit am Handy stimmt, und gib den aktuellen Code ein."
      : "Aktivieren fehlgeschlagen: "+errText(error));
  } finally {
    $("mfaVerifyButton").disabled = false;
  }
}

async function cancelMfa() {
  const id = state.pendingFactor;
  state.pendingFactor = null;
  $("mfaSetup").classList.add("hidden");
  $("mfaQr").removeAttribute("src");
  $("mfaSecret").value = "";
  msg("mfaSetupMessage","");
  if(id) {
    try { await db.auth.mfa.unenroll({factorId:id}); } catch(_e) {}
  }
  await loadSecurity();
}

async function disableMfa() {
  const button = $("mfaDisable");
  if(button.dataset.confirm!=="1") {
    button.dataset.confirm = "1";
    button.textContent = "Wirklich ausschalten? Nochmal tippen";
    setTimeout(() => {
      button.dataset.confirm = "";
      button.textContent = "Zwei-Faktor-Anmeldung ausschalten";
    },5000);
    return;
  }
  button.disabled = true;
  try {
    const {data:list,error:listError} = await db.auth.mfa.listFactors();
    if(listError) throw listError;
    for(const f of (list?.totp||[])) {
      const {error} = await db.auth.mfa.unenroll({factorId:f.id});
      if(error) throw error;
    }
    msg("mfaSetupMessage","Zwei-Faktor-Anmeldung ist ausgeschaltet.");
  } catch(error) {
    msg("mfaSetupMessage","Ausschalten fehlgeschlagen: "+errText(error));
  } finally {
    button.disabled = false;
    button.dataset.confirm = "";
    button.textContent = "Zwei-Faktor-Anmeldung ausschalten";
    await loadSecurity();
  }
}
