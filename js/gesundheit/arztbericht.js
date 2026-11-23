import {bpStats} from "./blutdruck-woche.js";
import {refText} from "./labor.js";
import {$,VY,avg,clockOf,dayOf,db,el,errText,fmtDate,fmtNum,hhmm,msg} from "../lib/basis.js";

// -----------------------------------
// Bericht für den Arzttermin (Drucken / PDF)
// -----------------------------------

export function setupReport() {
  if(!$("reportPrint")) return;
  $("reportPrint").addEventListener("click",buildReport);
  window.addEventListener("afterprint",() => {
    // Gesundheitsdaten nicht länger als nötig in der Seite lassen
    setTimeout(() => $("printReport")?.replaceChildren(),500);
  });
}

function table(headers,rows) {
  return el("table",{},
    el("thead",{},el("tr",{},headers.map(h => el("th",{scope:"col"},h)))),
    el("tbody",{},rows.map(r => el("tr",{},r.map(c => el("td",{},c==null ? "" : String(c)))))));
}

// Bericht: Dienstplan im Zeitraum (nur Beschreibung, keine Bewertung)
async function reportShift(section,none,since,today,uid) {
  const [plan,sleep] = await Promise.all([
    db.from("shift_plan").select("day,kind,start_time,end_time").eq("user_id",uid).gte("day",since).lte("day",today).order("day",{ascending:true}).limit(400),
    db.from("daily_metrics").select("day,source,sleep_minutes").eq("user_id",uid).gte("day",since).limit(400)
  ]);
  if(plan.error) throw plan.error;
  const rows = plan.data || [];
  if(!rows.length) { section("Schichtdienst",none("Kein Dienstplan im Zeitraum eingetragen.")); return; }
  const names = {frueh:"Frühdienst",spaet:"Spätdienst",nacht:"Nachtdienst",frei:"frei",sonder:"anderer Dienst"};
  const by = new Map(rows.map(r => [r.day,r]));
  const count = k => rows.filter(r => r.kind===k).length;
  const t = v => v ? String(v).slice(0,5) : "";
  const next = d => { const x = new Date(d+"T12:00:00"); x.setDate(x.getDate()+1); return VY.dayString(x); };
  let maxNights = 0, run = 0, quick = 0;
  for(const r of rows) {
    run = r.kind==="nacht" ? run+1 : 0; maxNights = Math.max(maxNights,run);
    const n = by.get(next(r.day));
    if(r.end_time && n?.start_time && r.kind!=="nacht" && n.kind!=="frei") {
      let rest = (Number(t(n.start_time).slice(0,2))*60+Number(t(n.start_time).slice(3)))-(Number(t(r.end_time).slice(0,2))*60+Number(t(r.end_time).slice(3)))+1440;
      if(rest<11*60) quick++;
    }
  }
  // Schlaf nach Diensttyp
  const sl = new Map();
  for(const m of sleep.data||[]) if(m.sleep_minutes && (!sl.has(m.day) || m.source==="apple_health")) sl.set(m.day,Number(m.sleep_minutes));
  const groups = {frueh:[],spaet:[],nacht:[],nachNacht:[],frei:[]};
  for(const [d,min] of sl) {
    const prev = new Date(d+"T12:00:00"); prev.setDate(prev.getDate()-1);
    const y = by.get(VY.dayString(prev)), r = by.get(d);
    if(y?.kind==="nacht" && r?.kind!=="nacht") groups.nachNacht.push(min);
    else if(r && groups[r.kind]) groups[r.kind].push(min);
  }
  const hmText = m => Math.floor(m/60)+" h "+String(Math.round(m%60)).padStart(2,"0")+" min";
  const sleepText = [["frueh","Frühdienst"],["spaet","Spätdienst"],["nacht","vor Nachtdienst"],["nachNacht","nach Nachtdienst"],["frei","frei"]]
    .filter(([k]) => groups[k].length).map(([k,l]) => l+": "+hmText(avg(groups[k]))+" ("+groups[k].length+")");
  section("Schichtdienst",
    el("p",{},count("frueh")+"× Frühdienst · "+count("spaet")+"× Spätdienst · "+count("nacht")+"× Nachtdienst · "+
      count("frei")+"× frei"+(count("sonder") ? " · "+count("sonder")+"× anderer Dienst" : "")+
      " · längste Folge von Nachtdiensten: "+maxNights+" · Wechsel mit weniger als 11 h Pause: "+quick),
    sleepText.length ? el("p",{},"Ø Schlafdauer nach Diensttyp: "+sleepText.join(" · ")) : null,
    table(["Datum","Dienst","Beginn","Ende"],rows.map(r => [fmtDate(r.day),names[r.kind] || r.kind,t(r.start_time),t(r.end_time)])));
}

async function buildReport() {
  const uid = VY.uid;
  if(!uid) return;
  const days = Number(document.querySelector("input[name=reportDays]:checked")?.value || 30);
  const parts = new Set([...document.querySelectorAll("input[name=reportPart]:checked")].map(i => i.value));
  if(!parts.size) { msg("reportMessage","Bitte mindestens einen Inhalt auswählen."); return; }

  const button = $("reportPrint");
  button.disabled = true;
  msg("reportMessage","Bericht wird erstellt ...");

  const since = VY.daysAgo(days-1);
  const today = VY.localDate();
  const sinceTs = new Date(since+"T00:00:00").toISOString();
  const yearAgo = VY.daysAgo(365);

  const q = (promise) => promise.then(r => {
    if(r.error) throw r.error;
    return r.data||[];
  });

  try {
    const [measures,health,meds,intakes,symptoms,labs,wellbeing,sleep] = await Promise.all([
      (parts.has("bp") || parts.has("glucose"))
        ? q(db.from("measurements").select("kind,measured_at,systolic,diastolic,pulse,glucose_mg_dl,glucose_context,insulin_units,insulin_kind,insulin_name,carbs_ke,notes")
          .eq("user_id",uid).gte("measured_at",sinceTs).order("measured_at",{ascending:true}).limit(3000)) : [],
      (parts.has("weight") || parts.has("bp"))
        ? q(db.from("health_entries").select("entry_date,weight_kg,systolic,diastolic,pulse,notes")
          .eq("user_id",uid).gte("entry_date",since).order("entry_date",{ascending:true}).limit(1000)) : [],
      parts.has("meds") ? q(db.from("medications").select("id,name,amount,times,active,note").eq("user_id",uid).order("created_at",{ascending:true})) : [],
      parts.has("meds") ? q(db.from("medication_intakes").select("medication_id,day,slot").eq("user_id",uid).gte("day",since).limit(5000)) : [],
      parts.has("symptoms") ? q(db.from("symptom_log").select("day,symptom,intensity,note").eq("user_id",uid).gte("day",since).order("day",{ascending:true}).limit(2000)) : [],
      parts.has("labs") ? q(db.from("lab_results").select("day,name,value,unit,ref_low,ref_high,note").eq("user_id",uid).gte("day",yearAgo).order("day",{ascending:true}).limit(1000)) : [],
      parts.has("wellbeing") ? q(db.from("wellbeing_log").select("day,mood,energy,stress").eq("user_id",uid).gte("day",since).limit(400)) : [],
      parts.has("sleep") ? q(db.from("daily_metrics").select("day,source,sleep_minutes,sleep_quality").eq("user_id",uid).gte("day",since).order("day",{ascending:true}).limit(400)) : []
    ]);

    const out = $("printReport");
    out.replaceChildren();
    out.append(
      el("header",{class:"pr-head"},
        el("h1",{},"Gesundheitsbericht"),
        el("p",{},"Zeitraum: "+fmtDate(since)+" – "+fmtDate(today)+" · erstellt am "+
          new Date().toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"})+" mit VYORA AI"),
        el("p",{class:"pr-fill"},"Name: ______________________________   Geburtsdatum: ______________"),
        el("p",{class:"pr-note"},"Alle Werte wurden von der Person selbst erfasst oder aus verbundenen "+
          "Geräten übernommen. VYORA AI ist kein Medizinprodukt und bewertet die Werte nicht.")));

    const section = (title,...content) => out.append(el("section",{},el("h2",{},title),...content));
    const none = text => el("p",{class:"pr-empty"},text);

    if(parts.has("bp")) {
      const bp = measures.filter(m => m.kind==="bp");
      const legacy = health.filter(h => h.systolic && h.diastolic);
      if(!bp.length && !legacy.length) section("Blutdruck & Puls",none("Keine Messungen im Zeitraum."));
      else {
        const s = bpStats(bp);
        const fmtS = (x,label) => label+": "+(x.n ? Math.round(x.sys)+"/"+Math.round(x.dia)+" mmHg ("+x.n+" Messung"+(x.n===1 ? "" : "en")+")" : "–");
        const sys = bp.map(r => r.systolic), dia = bp.map(r => r.diastolic);
        section("Blutdruck & Puls",
          bp.length ? el("p",{},[fmtS(s.morning,"Ø morgens (4–12 Uhr)"),fmtS(s.evening,"Ø abends (ab 17 Uhr)"),fmtS(s.all,"Ø gesamt")].join(" · ")) : null,
          bp.length ? el("p",{},"Spannweite: systolisch "+Math.min(...sys)+"–"+Math.max(...sys)+
            ", diastolisch "+Math.min(...dia)+"–"+Math.max(...dia)+" mmHg"+
            (s.all.pulse!=null ? " · Ø Puls "+Math.round(s.all.pulse)+"/min" : "")) : null,
          table(["Datum","Uhrzeit","Blutdruck (mmHg)","Puls","Notiz"],[
            ...bp.map(r => [dayOf(r.measured_at),clockOf(r.measured_at),r.systolic+"/"+r.diastolic,r.pulse ?? "",r.notes || ""]),
            ...legacy.map(r => [r.entry_date,"",r.systolic+"/"+r.diastolic,r.pulse ?? "",r.notes || ""])
          ].sort((x,y) => (x[0]+x[1]).localeCompare(y[0]+y[1]))
           .map(r => [fmtDate(r[0]),...r.slice(1)])));
      }
    }

    if(parts.has("glucose")) {
      const unit = VY.glucoseUnit==="mmol_l" ? "mmol/l" : "mg/dl";
      const g = v => VY.glucoseUnit==="mmol_l" ? fmtNum(v/18.0182,1) : fmtNum(v,0);
      const ctx = {nuechtern:"nüchtern",vor_essen:"vor dem Essen",nach_essen:"nach dem Essen",nacht:"nachts",sonstiges:"sonstiges"};
      const kinds = {mahlzeit:"Mahlzeit",korrektur:"Korrektur",basal:"Basal",misch:"Misch",sonstiges:"sonstiges"};
      const gl = measures.filter(m => m.kind==="glucose");
      const ins = measures.filter(m => m.kind==="insulin");
      if(!gl.length && !ins.length) section("Blutzucker & Insulin",none("Keine Einträge im Zeitraum."));
      else {
        const byCtx = Object.entries(ctx).map(([k,label]) => {
          const list = gl.filter(r => r.glucose_context===k).map(r => Number(r.glucose_mg_dl));
          return list.length ? "Ø "+label+": "+g(avg(list))+" "+unit+" ("+list.length+")" : null;
        }).filter(Boolean);
        section("Blutzucker & Insulin",
          byCtx.length ? el("p",{},byCtx.join(" · ")) : null,
          gl.length ? table(["Datum","Uhrzeit","Blutzucker ("+unit+")","Situation","Notiz"],
            gl.map(r => [fmtDate(dayOf(r.measured_at)),clockOf(r.measured_at),g(r.glucose_mg_dl),ctx[r.glucose_context] || "",r.notes || ""])) : null,
          ins.length ? el("h3",{},"Insulin (wie eingetragen)") : null,
          ins.length ? table(["Datum","Uhrzeit","Einheiten","Art","Name","KE","Notiz"],
            ins.map(r => [fmtDate(dayOf(r.measured_at)),clockOf(r.measured_at),fmtNum(r.insulin_units,1),kinds[r.insulin_kind] || "",r.insulin_name || "",r.carbs_ke!=null ? fmtNum(r.carbs_ke,1) : "",r.notes || ""])) : null);
      }
    }

    if(parts.has("weight")) {
      const w = health.filter(h => h.weight_kg!=null);
      section("Gewicht", w.length
        ? el("p",{},"Erster Wert: "+fmtNum(w[0].weight_kg)+" kg ("+fmtDate(w[0].entry_date)+") · letzter Wert: "+
            fmtNum(w[w.length-1].weight_kg)+" kg ("+fmtDate(w[w.length-1].entry_date)+") · "+w.length+" Messungen")
        : none("Keine Gewichtseinträge im Zeitraum."));
    }

    if(parts.has("meds")) {
      if(!meds.length) section("Medikamente",none("Kein Medikamentenplan eingetragen."));
      else {
        const count = id => intakes.filter(i => i.medication_id===id).length;
        section("Medikamente",
          el("p",{class:"pr-note"},"Plan wie von der Person eingetragen. Abgehakt = in der App als genommen markiert."),
          table(["Medikament","Menge laut Plan","Uhrzeiten","Status","abgehakt im Zeitraum","Notiz"],
            meds.map(m => [m.name,m.amount || "",(m.times||[]).map(hhmm).join(", "),m.active ? "aktiv" : "pausiert",count(m.id)+"×",m.note || ""])));
      }
    }

    if(parts.has("symptoms")) {
      section("Symptome",symptoms.length
        ? table(["Datum","Beschwerde","Stärke (eigene Einschätzung 0–10)","Notiz"],
            symptoms.map(s => [fmtDate(s.day),s.symptom,s.intensity,s.note || ""]))
        : none("Keine Einträge im Zeitraum."));
    }

    if(parts.has("labs")) {
      section("Laborwerte (letzte 12 Monate)",labs.length
        ? table(["Datum","Wert","Ergebnis","Referenz laut Befund","Notiz"],
            labs.map(l => [fmtDate(l.day),l.name,fmtNum(l.value,3)+(l.unit ? " "+l.unit : ""),refText(l),l.note || ""]))
        : none("Keine Laborwerte eingetragen."));
    }

    if(parts.has("wellbeing")) {
      const a = key => avg(wellbeing.map(w => w[key]).filter(v => v!=null));
      section("Wohlbefinden",wellbeing.length
        ? el("p",{},wellbeing.length+" Check-ins · Ø Stimmung "+fmtNum(a("mood"))+"/5 · Ø Energie "+
            fmtNum(a("energy"))+"/5 · Ø Stress "+fmtNum(a("stress"))+"/5 (jeweils eigene Einschätzung)")
        : none("Keine Check-ins im Zeitraum."));
    }

    if(parts.has("sleep")) {
      const s = sleep.filter(x => x.sleep_minutes);
      const mins = avg(s.map(x => x.sleep_minutes));
      section("Schlaf",s.length
        ? el("p",{},s.length+" Nächte erfasst · Ø Schlafdauer "+Math.floor(mins/60)+" h "+
            String(Math.round(mins%60)).padStart(2,"0")+" min")
        : none("Keine Schlafdaten im Zeitraum."));
    }

    if(parts.has("shift")) await reportShift(section,none,since,today,uid);

    msg("reportMessage","Fertig. Im Druckfenster kannst du „Als PDF sichern“ wählen.");
    window.print();
  } catch(error) {
    msg("reportMessage","Bericht konnte nicht erstellt werden: "+errText(error));
  } finally {
    button.disabled = false;
  }
}
