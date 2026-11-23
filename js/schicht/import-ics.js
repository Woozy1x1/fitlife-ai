import {$,VY,db,el,errText,msg} from "../lib/basis.js";
import {guessKind} from "./dienstplan.js";
import {KINDS,WD,addDays,fromMin,mondayOf,shortDate,state,timesFor,toMin,weekdayOf} from "./kern.js";
import {renderAll} from "./start.js";
import {writeNightWindows} from "./tageswechsel.js";

// -----------------------------------
// Import aus einer Kalenderdatei (.ics), z. B. Supershift → Google/iCloud-Kalender
// Die Datei wird nur im Browser gelesen. Gespeichert werden nur Datum,
// Dienstart, Beginn und Ende – keine Titel, Orte oder Notizen.
// -----------------------------------

const ICS_MAX_BYTES = 3*1024*1024;
const ICS_MAX_EVENTS = 20000;
let importRows = [];

export async function onImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if(!file) return;
  msg("spMessage","");
  if(file.size>ICS_MAX_BYTES) { msg("spMessage","Die Datei ist zu groß (höchstens 3 MB). Exportiere am besten nur den Supershift-Kalender."); return; }
  let text;
  try { text = await file.text(); } catch { msg("spMessage","Die Datei konnte nicht gelesen werden."); return; }
  if(!/BEGIN:VCALENDAR/i.test(text)) { msg("spMessage","Das ist keine Kalenderdatei (.ics)."); return; }
  const events = parseIcs(text);
  importRows = buildImportRows(events);
  renderImport(events.length);
}

// Zeilen entfalten (RFC 5545: Folgezeilen beginnen mit Leerzeichen oder Tab)
function icsLines(text) {
  return text.replace(/\r\n|\r/g,"\n").replace(/\n[ \t]/g,"").split("\n");
}

function icsText(v) {
  return String(v||"").replace(/\\n/gi," ").replace(/\\([,;\\])/g,"$1").trim();
}

function parseIcs(text) {
  const out = [];
  let cur = null;
  for(const line of icsLines(text)) {
    if(/^BEGIN:VEVENT$/i.test(line)) { cur = {}; continue; }
    if(/^END:VEVENT$/i.test(line)) { if(cur) out.push(cur); cur = null; if(out.length>=ICS_MAX_EVENTS) break; continue; }
    if(!cur) continue;
    const i = line.indexOf(":");
    if(i<0) continue;
    const head = line.slice(0,i), value = line.slice(i+1);
    const [name,...params] = head.split(";");
    const key = name.toUpperCase();
    if(key==="DTSTART" || key==="DTEND") cur[key] = parseIcsDate(value,params);
    else if(key==="SUMMARY") cur.summary = icsText(value).slice(0,80);
    else if(key==="RRULE") cur.rrule = true;
    else if(key==="STATUS") cur.status = value.toUpperCase();
    else if(key==="DURATION") cur.duration = value;
  }
  return out;
}

// Liefert {day:"YYYY-MM-DD", time:"HH:MM"|null, allDay:boolean}
function parseIcsDate(value,params) {
  const v = value.trim();
  const isDate = params.some(p => /^VALUE=DATE$/i.test(p)) || /^\d{8}$/.test(v);
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if(!m) return null;
  const [,Y,M,D,h,mi,,z] = m;
  if(isDate || h==null) return {day:Y+"-"+M+"-"+D,time:null,allDay:true};
  if(z) {
    // UTC → Ortszeit des Geräts
    const d = new Date(Date.UTC(+Y,+M-1,+D,+h,+mi));
    return {day:VY.dayString(d),time:String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"),allDay:false};
  }
  // Mit TZID oder ohne Zeitzone: Uhrzeit so übernehmen, wie sie im Kalender steht
  return {day:Y+"-"+M+"-"+D,time:h+":"+mi,allDay:false};
}

function durationMinutes(iso) {
  const m = String(iso||"").match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
  if(!m) return null;
  return (+m[1]||0)*1440+(+m[2]||0)*60+(+m[3]||0);
}

// Dienstart am Titel erkennen (FD/SD/ND, Früh, Spät, Nacht, Frei, Urlaub …)
function kindFromTitle(title) {
  const t = String(title||"").toLowerCase().normalize("NFC");
  const w = t.replace(/[^a-zäöüß0-9]+/g," ").trim();
  const words = w.split(" ");
  const has = re => re.test(w);
  if(has(/\b(frei|freizeit|frei tag|ruhetag|urlaub|ul|ue|ausgleich|zeitausgleich|az|fza|krank|ku)\b/)) return "frei";
  if(has(/\b(nacht\w*|nd|night)\b/) || (words.length<=2 && words[0]==="n")) return "nacht";
  if(has(/\b(spät\w*|spaet\w*|sd|late)\b/) || (words.length<=2 && words[0]==="s")) return "spaet";
  if(has(/\b(früh\w*|frueh\w*|fd|early)\b/) || (words.length<=2 && words[0]==="f")) return "frueh";
  if(has(/\b(mittel\w*|zwischen\w*|md|zd|tag\w*dienst|td|bereitschaft\w*|rufbereitschaft|bd|rb|dienst|schicht)\b/)) return "sonder";
  return null;
}

function buildImportRows(events) {
  const from = VY.daysAgo(60), until = addDays(VY.localDate(),400);
  const byDay = new Map();
  for(const e of events) {
    if(!e.DTSTART || e.status==="CANCELLED") continue;
    const start = e.DTSTART;
    if(start.day<from || start.day>until) continue;
    const title = e.summary || "";
    let kind = kindFromTitle(title);
    let startT = start.time, endT = null, minutes = null;
    if(!start.allDay) {
      if(e.DTEND && e.DTEND.time) {
        endT = e.DTEND.time;
        const dayDiff = Math.round((new Date(e.DTEND.day+"T12:00:00")-new Date(start.day+"T12:00:00"))/864e5);
        minutes = dayDiff*1440+toMin(endT)-toMin(startT);
      } else if(e.duration) {
        minutes = durationMinutes(e.duration);
        if(minutes!=null) endT = fromMin(toMin(startT)+minutes);
      }
    }
    let sure = !!kind;
    if(!kind) {
      // Ohne passenden Titel: nur Termine, die wie ein Dienst aussehen (3–13 Stunden)
      if(start.allDay || minutes==null || minutes<180 || minutes>780) continue;
      kind = guessKind(startT,endT);
    }
    if(start.allDay && kind!=="frei") {
      // Ganztägig, aber mit Dienst-Titel: Standardzeiten der Dienstart verwenden
      startT = null; endT = null;
    }
    if(kind==="frei") { startT = null; endT = null; }
    const row = {day:start.day,kind,start:startT,end:endT,title,sure,repeat:!!e.rrule};
    const old = byDay.get(start.day);
    // Pro Tag ein Dienst: echte Dienste vor „frei“, sichere vor geratenen
    const rank = r => (r.kind==="frei" ? 0 : 2)+(r.sure ? 1 : 0);
    if(!old || rank(row)>rank(old)) byDay.set(start.day,row);
  }
  return [...byDay.values()].sort((a,b) => a.day<b.day ? -1 : 1)
    .map(r => ({...r,checked:r.sure && !r.repeat,exists:state.plan.has(r.day)}));
}

function renderImport(total) {
  const box = $("spImport");
  if(!box) return;
  box.classList.remove("hidden");
  box.replaceChildren();
  if(!importRows.length) {
    box.append(el("p",{class:"muted"},"In der Datei ("+total+" Termine) wurden keine Dienste gefunden. "+
      "Tipp: In Supershift die Schichten mit Kürzeln wie F, S, N oder Früh, Spät, Nacht benennen und erneut exportieren."),
      el("button",{type:"button",class:"btn secondary full",onclick:closeImport},"Schließen"));
    return;
  }
  const count = () => importRows.filter(r => r.checked).length;
  const saveBtn = el("button",{type:"button",class:"btn full",onclick:saveImport});
  const update = () => {
    const n = count();
    saveBtn.textContent = n ? n+" Dienste übernehmen" : "Nichts ausgewählt";
    saveBtn.disabled = !n;
  };
  const replacing = importRows.filter(r => r.exists).length;
  box.append(
    el("h3",{},"Vorschau: "+importRows.length+" Tage gefunden"),
    el("p",{class:"muted small-note"},"Aus "+total+" Kalenderterminen. Haken = wird übernommen. "+
      "Unsichere Einträge (nur an der Uhrzeit erkannt) sind nicht angehakt."+
      (replacing ? " "+replacing+" Tage haben schon einen Eintrag und werden ersetzt." : "")),
    el("div",{class:"sp-import-list",role:"group","aria-label":"Gefundene Dienste"},
      importRows.map((r,i) => {
        const k = KINDS[r.kind];
        const box2 = el("input",{type:"checkbox",checked:r.checked,onchange:e => { importRows[i].checked = e.target.checked; update(); }});
        const times = r.kind!=="frei" ? " "+(r.start || timesFor(r.kind)?.[0])+"–"+(r.end || timesFor(r.kind)?.[1]) : "";
        return el("label",{class:"sp-import-row k-"+r.kind},
          box2,
          el("span",{},el("strong",{},WD[weekdayOf(r.day)]+" "+shortDate(r.day)+" · "+k.icon+" "+k.label+times),
            el("small",{},(r.title ? "„"+r.title+"“" : "ohne Titel")+(r.sure ? "" : " · an der Uhrzeit erkannt")+
              (r.repeat ? " · Serientermin, bitte prüfen" : "")+(r.exists ? " · ersetzt Eintrag" : ""))));
      })),
    saveBtn,
    el("button",{type:"button",class:"btn secondary full",onclick:closeImport},"Abbrechen"));
  update();
  box.scrollIntoView({behavior:"smooth",block:"start"});
}

function closeImport() {
  importRows = [];
  $("spImport")?.classList.add("hidden");
  $("spImport")?.replaceChildren();
}

async function saveImport() {
  const uid = VY.uid;
  if(!uid) return;
  const now = new Date().toISOString();
  const rows = importRows.filter(r => r.checked).map(r => {
    const def = timesFor(r.kind);
    return {user_id:uid,day:r.day,kind:r.kind,
      start_time:r.kind==="frei" ? null : (r.start || def?.[0] || null),
      end_time:r.kind==="frei" ? null : (r.end || def?.[1] || null),
      updated_at:now};
  });
  if(!rows.length) return;
  for(let i=0;i<rows.length;i+=200) {
    const {error} = await db.from("shift_plan").upsert(rows.slice(i,i+200),{onConflict:"user_id,day"});
    if(error) { msg("spMessage","Import fehlgeschlagen: "+errText(error)+(i ? " ("+i+" Tage wurden schon gespeichert.)" : "")); return; }
    for(const r of rows.slice(i,i+200)) state.plan.set(r.day,r);
  }
  closeImport();
  writeNightWindows();
  state.start = mondayOf(rows.find(r => r.day>=VY.localDate())?.day || rows[0].day);
  msg("spMessage","✓ "+rows.length+" Dienste importiert.");
  renderAll();
}
