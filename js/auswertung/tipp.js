import {addDays,el,state} from "./kern.js?v=5c0fb232ee";
import {$,VY} from "../lib/basis.js?v=5c0fb232ee";

// -----------------------------------
// Tipp des Tages (Heute)
// -----------------------------------

const TIPS = [
  {k:"move",t:"150 bis 300 Minuten mäßige Bewegung pro Woche – etwa zügiges Gehen – empfiehlt die WHO Erwachsenen. Auch kurze Einheiten zählen.",s:"WHO-Bewegungsempfehlungen 2020"},
  {k:"strength",t:"An mindestens 2 Tagen pro Woche Muskeln kräftigen – das empfiehlt die WHO zusätzlich zur Ausdauerbewegung.",s:"WHO-Bewegungsempfehlungen 2020"},
  {k:"sit",t:"Lange Sitzzeiten regelmäßig unterbrechen: aufstehen, ein paar Schritte gehen, dehnen.",s:"WHO-Bewegungsempfehlungen 2020"},
  {k:"veg",t:"5 Portionen Obst und Gemüse am Tag – zum Beispiel 3 Portionen Gemüse und 2 Portionen Obst.",s:"DGE: Gut essen und trinken (2024)"},
  {k:"water",t:"Wasser oder ungesüßter Tee sind die besten Durstlöscher. Etwa 1,5 Liter am Tag sind eine gute Orientierung, bei Hitze und Sport mehr.",s:"DGE: Gut essen und trinken (2024)"},
  {k:"fiber",t:"Mindestens 30 g Ballaststoffe am Tag – zum Beispiel aus Vollkorn, Hülsenfrüchten, Gemüse, Obst und Nüssen.",s:"DGE-Referenzwerte"},
  {k:"legumes",t:"Hülsenfrüchte wie Linsen, Bohnen oder Kichererbsen einmal pro Woche oder öfter: viel Eiweiß und Ballaststoffe.",s:"DGE: Gut essen und trinken (2024)"},
  {k:"sleep",t:"Erwachsenen wird empfohlen, regelmäßig mindestens 7 Stunden zu schlafen. Feste Zeiten – auch am Wochenende – helfen dem inneren Rhythmus.",s:"American Academy of Sleep Medicine / Sleep Research Society"},
  {k:"screen",t:"Eine ruhige Stunde vor dem Schlafen ohne helle Bildschirme kann das Einschlafen erleichtern.",s:"Deutsche Gesellschaft für Schlafforschung und Schlafmedizin"},
  {k:"protein",t:"Eiweiß über den Tag verteilt (z. B. zu jeder Mahlzeit) unterstützt den Muskelaufbau beim Krafttraining.",s:"International Society of Sports Nutrition"},
  {k:"breath",t:"Langsames Atmen – etwa 6 Atemzüge pro Minute – hilft vielen, zur Ruhe zu kommen. Probier die Atemübung unter „Gesundheit“.",s:"allgemeine Entspannungsempfehlung"},
  {k:"sugar",t:"Zuckergesüßte Getränke möglichst selten – Wasser ist die beste Wahl.",s:"DGE: Gut essen und trinken (2024)"},
  {k:"outdoor",t:"Tageslicht am Morgen hilft dem Schlaf-Wach-Rhythmus. Ein kurzer Spaziergang nach dem Aufstehen reicht oft schon.",s:"Deutsche Gesellschaft für Schlafforschung und Schlafmedizin"}
];

function pickTip() {
  const d = state.data;
  const today = VY.localDate();
  const yesterday = addDays(today,-1);
  const hour = new Date().getHours();
  // Passend zum Tag, wenn sich etwas anbietet – sonst täglich wechselnd
  if(d) {
    if((d.water.get(today) ?? 0)<3 && hour>=14) return TIPS.find(t => t.k==="water");
    if((d.veg.get(yesterday) ?? 5)<3) return TIPS.find(t => t.k==="veg");
    const s = d.sleep.get(today);
    if(s!=null && s<420) return TIPS.find(t => t.k==="sleep");
    const stepsY = d.steps.get(yesterday);
    if(stepsY!=null && stepsY<5000) return TIPS.find(t => t.k==="move");
  }
  const n = Math.floor(new Date(today+"T12:00:00").getTime()/864e5);
  return TIPS[n%TIPS.length];
}

export function renderTip() {
  const box = $("tipBox");
  if(!box || !VY.uid) return;
  const tip = pickTip();
  box.replaceChildren(
    el("p",{},tip.t),
    el("small",{class:"muted"},"Allgemeiner Tipp · Quelle: "+tip.s));
}
