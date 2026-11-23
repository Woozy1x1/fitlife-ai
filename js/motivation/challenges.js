import {$,VY,db} from "../lib/basis.js?v=5c0fb232ee";
import {addDays,daysBetween,el,errText,msg,state} from "./kern.js?v=5c0fb232ee";
import {loadAll} from "./start.js?v=5c0fb232ee";

// -----------------------------------
// 30-Tage-Challenges
// -----------------------------------

const CHALLENGES = {
  walk:{icon:"🚶",name:"30 Tage gehen",task:"Mindestens 30 Minuten zügig gehen"},
  water:{icon:"💧",name:"30 Tage trinken",task:"Dein Wasserziel erreichen"},
  veg:{icon:"🥦",name:"30 Tage bunt essen",task:"5 Portionen Obst und Gemüse"},
  mobility:{icon:"🤸",name:"30 Tage beweglich",task:"10 Minuten dehnen oder Mobility"},
  sleep:{icon:"😴",name:"30 Tage Schlafrhythmus",task:"Zur gewohnten Zeit ins Bett (± 30 Minuten)"},
  breath:{icon:"🫁",name:"30 Tage durchatmen",task:"3 Minuten ruhig atmen"},
  strength:{icon:"💪",name:"30 Tage kräftigen",task:"10 Minuten Kräftigung, z. B. Kniebeugen und Liegestütze"}
};

export function setupChallenges() {
  const sel = $("challengeKind");
  if(!sel) return;
  sel.replaceChildren(...Object.entries(CHALLENGES).map(([k,c]) => el("option",{value:k},c.icon+" "+c.name)));
  $("challengeStart").addEventListener("click",startChallenge);
}

function activeChallenges() {
  const today = VY.localDate();
  return state.challenges.filter(c => !c.ended_on && daysBetween(c.started_on,today)<30);
}

export function renderChallenges() {
  const box = $("challengeBox");
  if(!box || !VY.uid) return;
  box.replaceChildren();
  const today = VY.localDate();
  const active = activeChallenges();
  for(const c of active) {
    const def = CHALLENGES[c.kind];
    const dayNo = daysBetween(c.started_on,today)+1;
    const done = new Set(c.done_days||[]);
    const doneToday = done.has(today);
    const dots = el("div",{class:"ch-dots","aria-hidden":"true"});
    for(let i=0;i<30;i++) {
      const d = addDays(c.started_on,i);
      dots.append(el("span",{class:(done.has(d) ? "on" : "")+(d===today ? " now" : "")+(d>today ? " future" : "")}));
    }
    box.append(el("div",{class:"challenge"},
      el("div",{class:"ch-head"},
        el("strong",{},def.icon+" "+def.name),
        el("small",{class:"muted"},"Tag "+dayNo+" von 30 · "+done.size+" geschafft")),
      el("p",{class:"ch-task"},def.task),
      dots,
      el("div",{class:"st-actions"},
        el("button",{type:"button",class:"btn "+(doneToday ? "secondary" : ""),"aria-pressed":String(doneToday),
          onclick:e => toggleDay(c,e.currentTarget)},doneToday ? "✓ Heute geschafft" : "Heute geschafft"),
        el("button",{type:"button",class:"link-btn",onclick:e => stopChallenge(c,e.currentTarget)},"Beenden"))));
  }
  $("challengeNew").classList.toggle("hidden",active.length>=2);
  if(!active.length) box.append(el("p",{class:"muted"},"Keine Challenge aktiv. Such dir eine kleine Gewohnheit für die nächsten 30 Tage aus."));
  const finished = state.challenges.filter(c => !activeChallenges().includes(c)).slice(0,3);
  if(finished.length) {
    box.append(el("p",{class:"muted small-note"},"Zuletzt: "+finished.map(c =>
      CHALLENGES[c.kind].icon+" "+CHALLENGES[c.kind].name+" ("+(c.done_days||[]).length+"/30)").join(" · ")));
  }
}

async function startChallenge() {
  const uid = VY.uid;
  if(!uid) return;
  const kind = $("challengeKind").value;
  if(activeChallenges().some(c => c.kind===kind)) { msg("challengeMessage","Diese Challenge läuft schon."); return; }
  $("challengeStart").disabled = true;
  const {error} = await db.from("user_challenges").insert({user_id:uid,kind,started_on:VY.localDate()});
  $("challengeStart").disabled = false;
  if(error) { msg("challengeMessage","Starten fehlgeschlagen: "+errText(error)); return; }
  msg("challengeMessage","Los geht's! Hake jeden Tag ab, an dem du es geschafft hast. Ein verpasster Tag ist kein Problem – einfach weitermachen.");
  await loadAll();
}

async function toggleDay(c,button) {
  const today = VY.localDate();
  const days = new Set(c.done_days||[]);
  if(days.has(today)) days.delete(today); else days.add(today);
  button.disabled = true;
  const next = [...days].sort();
  const {error} = await db.from("user_challenges").update({done_days:next}).eq("id",c.id).eq("user_id",VY.uid);
  button.disabled = false;
  if(error) { msg("challengeMessage","Speichern fehlgeschlagen: "+errText(error)); return; }
  c.done_days = next;
  const def = CHALLENGES[c.kind];
  msg("challengeMessage",days.has(today) ? (next.length===30 ? "🎉 30 von 30 – stark!" : "✓ "+def.name+": "+next.length+" von 30 Tagen geschafft.") : "");
  renderChallenges();
}

async function stopChallenge(c,button) {
  if(button.dataset.confirm!=="1") {
    button.dataset.confirm = "1";
    button.textContent = "Wirklich beenden?";
    setTimeout(() => { button.dataset.confirm = ""; button.textContent = "Beenden"; },4000);
    return;
  }
  const {error} = await db.from("user_challenges").update({ended_on:VY.localDate()}).eq("id",c.id).eq("user_id",VY.uid);
  if(error) { msg("challengeMessage","Beenden fehlgeschlagen: "+errText(error)); return; }
  msg("challengeMessage","Challenge beendet. Was du geschafft hast, bleibt gespeichert.");
  await loadAll();
}
