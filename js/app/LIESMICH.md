# VYORA AI – Aufbau des App-Codes

Der Code der App ist in kleine Dateien aufgeteilt. Jede Datei kümmert sich
um einen Bereich der App. `index.html` lädt sie **in dieser Reihenfolge**:

| Datei | Inhalt |
|---|---|
| `00-supabase.js` | lädt die Supabase-Bibliothek (Modul) |
| `01-grundlagen.js` | Verbindung, Hilfsfunktionen, Datum (inkl. Nachtdienst-Tag), Navigation |
| `01b-anzeige.js` | Datumsanzeige, Diagramme, Schlaf- und Ernährungsübersicht |
| `02-offline-und-erinnerungen.js` | Offline-Speicher, Push-Erinnerungen |
| `03-schlaf.js` | Schlaf selbst eintragen, Apple-Health-Import |
| `04-messtagebuch.js` | Tages-Checkliste, Blutdruck, Blutzucker, Insulin |
| `05-calisthenics.js` | Calisthenics: Programm, Schwierigkeit, Wochentage |
| `05b-calisthenics-training.js` | Calisthenics: Übungen, Speichern, Laden, Pausen-Timer |
| `06-dehnen.js` | Dehnen & Beweglichkeit |
| `07-woche-und-ziele.js` | Wochenrückblick, Verläufe |
| `07b-tagesziele-und-bedarf.js` | Tagesziele, Bedarfsrechner |
| `08-alltag.js` | Einführung, Wasser, 5 am Tag, Wohlbefinden, Atemübung |
| `09-lebensmittelsuche.js` | „Oft gegessen“, Mahlzeiten des Tages laden |
| `09b-lebensmittelsuche.js` | Lebensmittelsuche |
| `10-barcode-scanner.js` | Barcode-Scanner |
| `11-mahlzeiten.js` | Mahlzeiten speichern und anzeigen |
| `12-training.js` | Trainingstagebuch |
| `13-gesundheitswerte.js` | Gewicht, Blutdruck, Puls |
| `14-tracker.js` | Oura Ring und Apple Health |
| `15-trainingsplaene.js` | eigene Trainingspläne |
| `16-einwilligung-und-2fa.js` | Google-/Apple-Anmeldung, Einwilligung, Zwei-Faktor-Anmeldung |
| `17-anmeldung.js` | Anmelden, Abmelden, alle Daten laden |
| `18-start.js` | automatisch aktualisieren, Passwort, App-Installation, Erweiterungen |

Die neueren Funktionen liegen als ES-Module in den Ordnern von `js/`
(Übersicht: `js/LIESMICH.md`). `18-start.js` lädt `js/plus.js`, das alle Module startet.

## Wichtig beim Bearbeiten

- Alle Dateien `01`–`18` teilen sich **einen gemeinsamen Bereich**: Eine
  Funktion aus `04-messtagebuch.js` kann in `17-anmeldung.js` benutzt werden.
- Code, der **sofort beim Laden** läuft (nicht in einer Funktion), darf nur
  Funktionen aus derselben oder einer **früheren** Datei aufrufen.
  Startaufrufe gehören deshalb ans Ende von `18-start.js`.
- Jeder Name (Funktion, `let`, `const`) darf nur **einmal** in allen Dateien vorkommen.
- Nach jeder Änderung `python3 stamp.py` ausführen: Das aktualisiert die
  `?v=`-Nummern in `index.html`, damit Handys die neue Version laden.
