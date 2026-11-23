// VYORA AI – Erfolge, 30-Tage-Challenges, Wochenplanung und Übungsbibliothek
// Bewusst ohne Abnehm-Challenges, Ranglisten oder Vergleiche mit anderen.

let VY = null;
let db = null;
let $ = null;

const state = {challenges:[],week:null,plan:null,load:0,stats:null,libCat:"alle"};

function el(tag,props={},...children) {
  const node = document.createElement(tag);
  for(const [key,value] of Object.entries(props||{})) {
    if(value==null || value===false) continue;
    if(key==="class") node.className = value;
    else if(key.startsWith("on")) node.addEventListener(key.slice(2),value);
    else if(key in node && typeof value!=="string") node[key] = value;
    else node.setAttribute(key,value===true ? "" : value);
  }
  for(const child of children.flat()) {
    if(child==null || child===false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const errText = e => /fetch|network/i.test(String(e?.message||e)) ? "Keine Verbindung. Bitte später erneut versuchen." : String(e?.message||e);
const msg = (id,text) => { if($(id)) $(id).textContent = text || ""; };

function addDays(day,n) {
  const d = new Date(day+"T12:00:00");
  d.setDate(d.getDate()+n);
  return VY.dayString(d);
}
function mondayOf(day) {
  const d = new Date(day+"T12:00:00");
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  return VY.dayString(d);
}
const shortDate = day => new Date(day+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
const daysBetween = (a,b) => Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/864e5);

export function init(api) {
  VY = api;
  db = api.supabase;
  $ = api.$;
  setupChallenges();
  setupWeekPlan();
  setupLibrary();
  VY.on("user",loadAll);
  VY.on("reset",resetAll);
  VY.on("refresh",() => { if(state.week && state.week!==mondayOf(VY.localDate())) loadAll(); else renderChallenges(); });
  if(VY.uid) loadAll();
}

function resetAll() {
  state.challenges = []; state.plan = null; state.stats = null;
  state.load++;
  for(const id of ["challengeBox","milestoneBox","weekPlanBox"]) $(id)?.replaceChildren();
}

async function loadAll() {
  const uid = VY.uid;
  if(!uid) return;
  const id = ++state.load;
  state.week = mondayOf(VY.localDate());
  const [c,p] = await Promise.all([
    db.from("user_challenges").select("id,kind,started_on,ended_on,done_days").eq("user_id",uid).order("started_on",{ascending:false}).limit(50),
    db.from("week_plans").select("week_start,train_days,goals,note").eq("user_id",uid).eq("week_start",state.week).maybeSingle()
  ]);
  if(id!==state.load || uid!==VY.uid) return;
  state.challenges = c.error ? [] : (c.data||[]);
  state.plan = p.error ? null : (p.data || {week_start:state.week,train_days:[],goals:[],note:""});
  renderChallenges();
  renderWeekPlan();
  setTimeout(loadMilestones,2500);
}

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

function setupChallenges() {
  const sel = $("challengeKind");
  if(!sel) return;
  sel.replaceChildren(...Object.entries(CHALLENGES).map(([k,c]) => el("option",{value:k},c.icon+" "+c.name)));
  $("challengeStart").addEventListener("click",startChallenge);
}

function activeChallenges() {
  const today = VY.localDate();
  return state.challenges.filter(c => !c.ended_on && daysBetween(c.started_on,today)<30);
}

function renderChallenges() {
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

// -----------------------------------
// Erfolge (aus deinen Einträgen berechnet)
// -----------------------------------

async function loadMilestones() {
  const uid = VY.uid;
  if(!uid || !$("milestoneBox")) return;
  const id = state.load;
  const q = p => p.then(r => r.error ? [] : (r.data||[])).catch(() => []);
  const [w,well,water,veg,food] = await Promise.all([
    q(db.from("workout_entries").select("entry_date").eq("user_id",uid).order("entry_date",{ascending:true}).limit(10000)),
    q(db.from("wellbeing_log").select("day").eq("user_id",uid).order("day",{ascending:true}).limit(2000)),
    q(db.from("water_log").select("day,glasses").eq("user_id",uid).order("day",{ascending:true}).limit(2000)),
    q(db.from("veg_log").select("day,portions").eq("user_id",uid).order("day",{ascending:true}).limit(2000)),
    q(db.from("nutrition_entries").select("entry_date").eq("user_id",uid).order("entry_date",{ascending:true}).limit(10000))
  ]);
  if(id!==state.load || uid!==VY.uid) return;
  const uniq = list => [...new Set(list)].sort();
  const goal = Number(VY.goals?.water_glasses)||8;
  state.stats = {
    train:uniq(w.map(x => x.entry_date)),
    well:uniq(well.map(x => x.day)),
    water:uniq(water.filter(x => Number(x.glasses)>=goal).map(x => x.day)),
    veg:uniq(veg.filter(x => Number(x.portions)>=5).map(x => x.day)),
    food:uniq(food.map(x => x.entry_date))
  };
  renderMilestones();
}

function longestStreak(days) {
  let best = 0, cur = 0, prev = null;
  for(const d of days) {
    cur = prev && daysBetween(prev,d)===1 ? cur+1 : 1;
    best = Math.max(best,cur);
    prev = d;
  }
  return best;
}

function renderMilestones() {
  const box = $("milestoneBox");
  const s = state.stats;
  if(!box || !s) return;
  box.replaceChildren();
  const active = uniqAll(s);
  const chDone = state.challenges.filter(c => (c.done_days||[]).length>=20).length;
  const list = [
    ["🏋️","Erstes Training",s.train,1],["🏋️","10 Trainingstage",s.train,10],["🏋️","50 Trainingstage",s.train,50],["🏆","100 Trainingstage",s.train,100],
    ["🌿","7 Check-ins",s.well,7],["🌿","30 Check-ins",s.well,30],
    ["💧","Wasserziel an 7 Tagen",s.water,7],["🥦","5 am Tag an 7 Tagen",s.veg,7],
    ["🥗","30 Tage Ernährung eingetragen",s.food,30],
    ["🔥","7 Tage am Stück aktiv",null,7,longestStreak(active)],
    ["🔥","30 Tage am Stück aktiv",null,30,longestStreak(active)],
    ["🎯","Challenge mit mind. 20 von 30 Tagen",null,1,chDone]
  ];
  const grid = el("div",{class:"badge-grid"});
  let reached = 0;
  for(const [icon,name,days,need,value] of list) {
    const have = value ?? days.length;
    const ok = have>=need;
    if(ok) reached++;
    const when = ok && days ? days[need-1] : null;
    grid.append(el("div",{class:"badge"+(ok ? " ok" : ""),"aria-label":name+(ok ? ", erreicht" : ", noch "+(need-have)+" bis zum Ziel")},
      el("span",{class:"badge-icon","aria-hidden":"true"},ok ? icon : "○"),
      el("strong",{},name),
      el("small",{class:"muted"},ok ? (when ? "am "+shortDate(when) : "erreicht") : Math.min(have,need)+" / "+need)));
  }
  box.append(el("p",{class:"muted"},reached+" von "+list.length+" Erfolgen erreicht · „aktiv“ = Training, Check-in, Wasser oder Ernährung eingetragen"),grid);
}

function uniqAll(s) {
  return [...new Set([...s.train,...s.well,...s.food,...s.water])].sort();
}

// -----------------------------------
// Wochenplanung
// -----------------------------------

const WD = ["Mo","Di","Mi","Do","Fr","Sa","So"];

function setupWeekPlan() {
  if(!$("weekPlanCard")) return;
  $("weekPlanSave").addEventListener("click",saveWeekPlan);
}

function renderWeekPlan() {
  const box = $("weekPlanBox");
  if(!box || !state.plan) return;
  box.replaceChildren();
  const today = VY.localDate();
  const todayNo = ((new Date(today+"T12:00:00").getDay()+6)%7)+1;
  const plan = state.plan;
  $("weekPlanLabel").textContent = "Woche vom "+shortDate(state.week)+" bis "+shortDate(addDays(state.week,6));

  const picker = el("div",{class:"day-picker days7",role:"group","aria-label":"Geplante Trainingstage"});
  WD.forEach((name,i) => picker.append(el("label",{},
    el("input",{type:"checkbox",name:"wpDay",value:String(i+1),checked:(plan.train_days||[]).map(Number).includes(i+1)}),
    el("span",{class:i+1===todayNo ? "is-today" : ""},name))));
  box.append(el("span",{class:"label"},"Trainingstage"),picker);

  const goals = [...(plan.goals||[])];
  while(goals.length<3) goals.push({text:"",done:false});
  const list = el("div",{class:"wp-goals"});
  goals.slice(0,3).forEach((g,i) => list.append(el("div",{class:"wp-goal"},
    el("input",{type:"checkbox",class:"wp-done",checked:!!g.done,"aria-label":"Ziel "+(i+1)+" erledigt"}),
    el("input",{type:"text",class:"wp-text",maxlength:"80",value:g.text||"",placeholder:["z. B. 3× Training","z. B. jeden Tag 5 am Tag","z. B. vor 23 Uhr ins Bett"][i],
      "aria-label":"Wochenziel "+(i+1)}))));
  box.append(el("span",{class:"label"},"Bis zu 3 Ziele für diese Woche"),list);

  const planned = (plan.train_days||[]).map(Number);
  if(planned.includes(todayNo)) box.prepend(el("p",{class:"tip"},el("strong",{},"Heute: "),"Laut deinem Plan ist heute ein Trainingstag."));
}

async function saveWeekPlan() {
  const uid = VY.uid;
  if(!uid || !state.plan) return;
  const train_days = [...document.querySelectorAll("input[name=wpDay]:checked")].map(i => Number(i.value));
  const texts = [...document.querySelectorAll("#weekPlanBox .wp-text")];
  const dones = [...document.querySelectorAll("#weekPlanBox .wp-done")];
  const goals = texts.map((t,i) => ({text:t.value.trim().slice(0,80),done:dones[i].checked})).filter(g => g.text);
  $("weekPlanSave").disabled = true;
  const {error} = await db.from("week_plans").upsert({user_id:uid,week_start:state.week,train_days,goals,updated_at:new Date().toISOString()},
    {onConflict:"user_id,week_start"});
  $("weekPlanSave").disabled = false;
  if(error) { msg("weekPlanMessage","Speichern fehlgeschlagen: "+errText(error)); return; }
  state.plan = {...state.plan,train_days,goals};
  const done = goals.filter(g => g.done).length;
  msg("weekPlanMessage","✓ Gespeichert"+(goals.length ? " · "+done+" von "+goals.length+" Zielen erledigt" : "")+".");
  renderWeekPlan();
}

// -----------------------------------
// Übungsbibliothek (Text, ohne fremde Videos oder Bilder)
// -----------------------------------

const LIB = [
  {n:"Kniebeuge",c:"Beine",e:"ohne Geräte",how:"Füße etwa schulterbreit, Zehen leicht nach außen. Hüfte nach hinten und unten, als würdest du dich setzen. Brust aufrecht, dann über die ganze Fußsohle hochdrücken.",cue:"Knie zeigen in Richtung der Zehen, Fersen bleiben am Boden.",easy:"auf einen Stuhl setzen und wieder aufstehen",hard:"Bulgarian Split Squat oder mit Gewicht"},
  {n:"Ausfallschritt",c:"Beine",e:"ohne Geräte",how:"Großer Schritt nach vorn, hinteres Knie senkt sich Richtung Boden. Über das vordere Bein zurückdrücken.",cue:"Oberkörper aufrecht, vorderes Knie bleibt stabil über dem Fuß.",easy:"kleinere Schritte, an der Wand festhalten",hard:"Gehende Ausfallschritte mit Gewicht"},
  {n:"Hüftheben (Glute Bridge)",c:"Beine",e:"ohne Geräte",how:"Rückenlage, Füße aufgestellt. Gesäß anspannen und Hüfte heben, bis Knie, Hüfte und Schultern eine Linie bilden. Langsam absenken.",cue:"Nicht ins Hohlkreuz drücken – die Kraft kommt aus dem Gesäß.",easy:"kleinere Bewegung",hard:"einbeinig oder Schultern auf einer Bank"},
  {n:"Liegestütz",c:"Brust",e:"ohne Geräte",how:"Hände etwas weiter als schulterbreit, Körper bildet eine Linie. Brust kontrolliert Richtung Boden senken und wieder hochdrücken.",cue:"Bauch und Gesäß fest, Ellbogen etwa 45° vom Körper.",easy:"an der Wand, auf einer Bank oder auf den Knien",hard:"Füße erhöht oder langsame Abwärtsphase"},
  {n:"Dips am Stuhl",c:"Arme",e:"stabiler Stuhl",how:"Hände hinter dir auf der Stuhlkante, Beine nach vorn. Ellbogen nach hinten beugen und wieder strecken.",cue:"Schultern weg von den Ohren, nicht zu tief gehen.",easy:"Beine angewinkelt",hard:"Beine gestreckt oder am Barren"},
  {n:"Rudern mit Hanteln",c:"Rücken",e:"Kurzhanteln oder Wasserflaschen",how:"Oberkörper mit geradem Rücken nach vorn neigen. Gewichte zur Hüfte ziehen, Schulterblätter zusammen, langsam ablassen.",cue:"Nacken lang, kein Schwung.",easy:"leichtere Gewichte, abgestützt an einer Bank",hard:"schwerere Gewichte, langsamer"},
  {n:"Australian Pull-up",c:"Rücken",e:"stabiler Tisch oder tiefe Stange",how:"Unter die Stange legen, Körper gestreckt. Brust zur Stange ziehen und kontrolliert ablassen.",cue:"Körper bleibt eine Linie, Schulterblätter nach hinten-unten.",easy:"Knie gebeugt, Körper steiler",hard:"Füße erhöht"},
  {n:"Klimmzug",c:"Rücken",e:"Klimmzugstange",how:"Schulterbreit greifen, aus dem Hang Brust zur Stange ziehen, kontrolliert ablassen.",cue:"Erst Schulterblätter nach unten ziehen, dann die Arme beugen.",easy:"mit Band oder nur langsam ablassen (Negativ)",hard:"mit Zusatzgewicht"},
  {n:"Unterarmstütz (Plank)",c:"Core",e:"ohne Geräte",how:"Auf Unterarmen und Zehen stützen, Körper bildet eine gerade Linie. Ruhig weiteratmen.",cue:"Bauchnabel leicht einziehen, kein Hohlkreuz, Blick zum Boden.",easy:"auf den Knien",hard:"ein Bein oder einen Arm anheben"},
  {n:"Seitstütz",c:"Core",e:"ohne Geräte",how:"Seitlich auf einen Unterarm stützen, Hüfte heben, Körper in einer Linie halten.",cue:"Hüfte nicht absinken lassen.",easy:"unteres Knie am Boden",hard:"oberes Bein anheben"},
  {n:"Dead Bug",c:"Core",e:"ohne Geräte",how:"Rückenlage, Arme nach oben, Knie 90°. Gegengleich Arm und Bein langsam strecken, zurück, Seite wechseln.",cue:"Lendenwirbelsäule bleibt am Boden.",easy:"nur die Beine bewegen",hard:"langsamer, mit Gewicht in den Händen"},
  {n:"Vierfüßlerstand Arm-Bein",c:"Core",e:"ohne Geräte",how:"Im Vierfüßlerstand gegengleich Arm und Bein strecken, kurz halten, zurück.",cue:"Becken bleibt waagerecht.",easy:"nur ein Bein oder nur ein Arm",hard:"Ellbogen und Knie unter dem Bauch zusammenführen"},
  {n:"Schulterkreisen",c:"Mobility",e:"ohne Geräte",how:"Schultern langsam groß nach hinten und nach vorn kreisen, je 10-mal.",cue:"Bewegung ohne Schmerz, ruhig atmen.",easy:"kleinere Kreise",hard:"mit gestreckten Armen"},
  {n:"Hüftbeuger-Dehnung",c:"Mobility",e:"ohne Geräte",how:"Kniestand im Ausfallschritt, Becken leicht nach vorn schieben, 30–45 Sekunden halten, Seite wechseln.",cue:"Gesäß des hinteren Beins anspannen, kein Hohlkreuz.",easy:"Kissen unter das Knie",hard:"Arm auf der Seite des hinteren Beins nach oben strecken"},
  {n:"Brustwirbelsäule öffnen",c:"Mobility",e:"ohne Geräte",how:"Seitlich liegen, Knie angewinkelt, Arme vor dir. Oberen Arm im Bogen zur anderen Seite öffnen, Blick folgt der Hand.",cue:"Knie bleiben zusammen am Boden.",easy:"kleinerer Bogen",hard:"am Ende ausatmen und kurz halten"},
  {n:"Wadenheben",c:"Beine",e:"Treppenstufe optional",how:"Auf die Zehenspitzen drücken, kurz halten, langsam absenken.",cue:"Ganze Bewegung kontrolliert, nicht wippen.",easy:"beidbeinig am Boden",hard:"einbeinig an einer Stufe"},
  {n:"Hampelmann",c:"Ausdauer",e:"ohne Geräte",how:"Im Sprung Beine öffnen und Arme über den Kopf, zurück in die Ausgangsstellung.",cue:"Weich landen.",easy:"Schritt statt Sprung zur Seite",hard:"schneller oder länger"},
  {n:"Bergsteiger (Mountain Climber)",c:"Ausdauer",e:"ohne Geräte",how:"Im Liegestütz abwechselnd Knie zur Brust ziehen.",cue:"Hüfte tief, Schultern über den Händen.",easy:"langsam im Wechsel steigen",hard:"zügiger Rhythmus"}
];

function setupLibrary() {
  if(!$("libCard")) return;
  const cats = ["alle",...new Set(LIB.map(x => x.c))];
  const chips = $("libCats");
  chips.replaceChildren(...cats.map(c => el("button",{type:"button",class:"chip"+(c==="alle" ? " active" : ""),"aria-pressed":String(c==="alle"),
    onclick:e => {
      state.libCat = c;
      for(const b of chips.children) { b.classList.toggle("active",b===e.currentTarget); b.setAttribute("aria-pressed",String(b===e.currentTarget)); }
      renderLibrary();
    }},c==="alle" ? "Alle" : c)));
  $("libSearch").addEventListener("input",renderLibrary);
  renderLibrary();
}

function renderLibrary() {
  const box = $("libList");
  const q = ($("libSearch").value||"").trim().toLowerCase();
  box.replaceChildren();
  const hits = LIB.filter(x => (state.libCat==="alle" || x.c===state.libCat) && (!q || (x.n+" "+x.c+" "+x.e).toLowerCase().includes(q)));
  if(!hits.length) { box.append(el("p",{class:"muted"},"Keine passende Übung gefunden.")); return; }
  for(const x of hits) {
    box.append(el("details",{class:"cx-extra lib-item"},
      el("summary",{},x.n,el("small",{class:"muted"}," · "+x.c+" · "+x.e)),
      el("div",{class:"lib-body"},
        el("p",{},x.how),
        el("p",{},el("strong",{},"Darauf achten: "),x.cue),
        el("p",{},el("strong",{},"Leichter: "),x.easy," · ",el("strong",{},"Schwerer: "),x.hard),
        el("button",{type:"button",class:"btn secondary",onclick:() => {
          const input = $("exercise");
          if(!input) return;
          input.value = x.n;
          input.dispatchEvent(new Event("input",{bubbles:true}));
          $("workoutForm")?.scrollIntoView({behavior:"smooth",block:"start"});
          setTimeout(() => $("sets")?.focus(),400);
        }},"Ins Trainingstagebuch übernehmen"))));
  }
}
