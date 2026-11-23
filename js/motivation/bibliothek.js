import {$} from "../lib/basis.js";
import {el,state} from "./kern.js";

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

export function setupLibrary() {
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
