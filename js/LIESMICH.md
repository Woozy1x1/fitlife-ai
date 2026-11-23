# VYORA AI – Module in `js/`

Neben dem App-Kern (`js/app/`, klassische Skripte, siehe `js/app/LIESMICH.md`)
liegen alle neueren Funktionen als kleine **ES-Module** in Ordnern.
`js/app/18-start.js` lädt `js/plus.js`, und `plus.js` startet alle Module.

| Ordner / Datei | Inhalt |
|---|---|
| `plus.js` | Start: verbindet die App-Schnittstelle, lädt alle Module |
| `lib/basis.js` | gemeinsame Bausteine: `VY`, `db`, `$`, `el()`, `msg()`, Datum/Zahl formatieren |
| `gesundheit/reiter.js` | Gesundheit: Reiter Heute · Messen · Schlaf · Arzt |
| `gesundheit/medikamente.js` | Medikamentenplan und Einnahme-Häkchen |
| `gesundheit/symptome.js` | Symptom-Tagebuch |
| `gesundheit/labor.js` | Laborwerte |
| `gesundheit/blutdruck-woche.js` | Blutdruck der letzten 7 Tage |
| `gesundheit/arztbericht.js` | Bericht für den Arzttermin (inkl. Dienstplan) |
| `gesundheit/zustand.js` | gemeinsamer Zwischenspeicher der Gesundheits-Module |
| `konto/zwei-faktor.js` | Zwei-Faktor-Anmeldung |
| `konto/tagesbeginn.js` | fester Tageswechsel (0–6 Uhr) |
| `training/bestleistungen.js` | Fortschritt und Bestleistungen |
| `auswertung/` | Zusammenhänge, Tagesansicht, Erholung, Tipp des Tages |
| `kueche/` | Rezepte, Rezept-Editor, Essensplan, Einkaufsliste |
| `motivation/` | Challenges, Erfolge, Wochenplanung, Übungsbibliothek |
| `schicht/` | Schichtdienst: Einstellungen, Dienstplan, .ics-Import, Schlaf, Ernährung, Training, Nachtdienst-Tag |

In jedem Ordner gilt: `kern.js` = gemeinsame Daten und Hilfsfunktionen,
`start.js` = `init()` (Laden, Zurücksetzen, Anzeigen), die übrigen Dateien = je eine Funktion der App.

## Beim Bearbeiten

- Ein Modul holt sich, was es braucht, mit `import {…} from "./datei.js?v=…"`.
  Was andere Dateien brauchen, steht dort mit `export`.
- Nach jeder Änderung `python3 stamp.py` ausführen. Es setzt eine gemeinsame
  Versionsnummer in alle `?v=` der Module, damit Handys immer zusammenpassende Dateien laden.
