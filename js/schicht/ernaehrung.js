import {$,VY,el} from "../lib/basis.js";
import {WD,addDays,fromMin,shiftOn,shiftText,shortDate,state,toMin,weekdayOf} from "./kern.js";

// -----------------------------------
// Ernährung: Essen & Koffein passend zur Schicht
// -----------------------------------

// Geplante Schlafenszeit (Minuten ab Mitternacht) für die Nacht nach „day“, oder null
function bedtimeAfter(day) {
  const t = shiftOn(day), m = shiftOn(addDays(day,1));
  if(t?.kind==="nacht") return null;
  if(m?.kind==="frueh" && m.start) {
    const bed = toMin(m.start)-75-450;
    const endT = t && t.kind!=="frei" && t.end ? toMin(t.end) : null;
    if(endT!=null && endT>=12*60 && endT+45>((bed%1440)+1440)%1440) return endT+45;
    return ((bed%1440)+1440)%1440;
  }
  if(t?.kind==="spaet" && t.end) return toMin(t.end)+60;
  return 23*60;
}

function foodLines(day) {
  const t = shiftOn(day);
  const out = [];
  if(t?.kind==="nacht" && t.start && t.end) {
    const a = toMin(t.start), e = toMin(t.end);
    out.push("Vor dem Dienst: warme Hauptmahlzeit etwa um "+fromMin(a-120)+" Uhr.");
    out.push("Im Dienst: eine kleine, leichte Mahlzeit gegen Mitternacht. Zwischen etwa 2 und 6 Uhr nur Kleinigkeiten (z. B. Obst, Joghurt, Nüsse, Gemüsesticks) – nachts verdaut der Körper schlechter.");
    out.push("Koffein: letzter Kaffee oder Energy-Drink etwa um "+fromMin(e+45-360)+" Uhr, damit du nach dem Dienst gut einschläfst.");
    out.push("Nach dem Dienst: nur ein kleines Frühstück, dann schlafen.");
  } else if(t?.kind==="frueh" && t.start) {
    out.push("Vor dem Dienst: kleines Frühstück oder etwas zum Mitnehmen (z. B. Brot, Joghurt, Obst).");
    out.push("In der Pause eine richtige Mahlzeit, am Nachmittag Hauptmahlzeit – abends eher leicht.");
  } else if(t?.kind==="spaet" && t.start) {
    out.push("Hauptmahlzeit mittags vor dem Dienst, etwa um "+fromMin(toMin(t.start)-90)+" Uhr.");
    out.push("In der Pause eher leicht essen. Nach Dienstende keine schwere Mahlzeit mehr – lieber ein kleiner Snack.");
  } else {
    out.push("Freier Tag: Mahlzeiten zu ähnlichen Zeiten wie sonst helfen deinem inneren Rhythmus.");
  }
  const bed = bedtimeAfter(day);
  if(bed!=null && t?.kind!=="nacht") {
    out.push("Koffein: letzter Kaffee etwa um "+fromMin(bed-360)+" Uhr – geplantes Schlafengehen gegen "+fromMin(bed)+" Uhr.");
  }
  if(t && t.kind!=="frei") out.push("Im Dienst regelmäßig trinken – am besten Wasser oder ungesüßten Tee.");
  return out;
}

export function renderFood() {
  const card = $("shiftFoodCard");
  if(!card) return;
  card.classList.toggle("hidden",!state.mode || !VY.uid);
  if(!state.mode) return;
  const day = $("nutritionDate")?.value || VY.localDate();
  $("shiftFoodBox").replaceChildren(
    el("p",{class:"muted"},(day===VY.localDate() ? "Heute" : WD[weekdayOf(day)]+", "+shortDate(day))+": "+shiftText(shiftOn(day))),
    el("ul",{class:"shift-list"},foodLines(day).map(l => el("li",{},l))));
}
