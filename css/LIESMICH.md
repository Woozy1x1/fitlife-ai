# VYORA AI – Design (CSS)

`index.html` lädt die Dateien **in dieser Reihenfolge** (spätere Regeln überschreiben frühere):

| Datei | Inhalt |
|---|---|
| `basis.css` | Farben, Schrift, Kopfzeile, Karten, Startseite, Knöpfe, Diagramme, Navigation |
| `formulare-listen.css` | Formulare, Ernährung, Tracker & Schlaf, Tagesziele, Calisthenics, Checkliste |
| `mobil.css` | Anpassungen für kleine Bildschirme |
| `gesundheit.css` | Gesundheit: Medikamente, Symptome, Labor, Arztbericht, 2FA, Bestleistungen |
| `erweiterungen.css` | Challenges, Küche, Auswertung, Gesundheit-Reiter |
| `schichtdienst.css` | Dienstplan, Schicht-Karten, Import, Tabelle nach Schicht |

Nach Änderungen `python3 stamp.py` ausführen (neue Prüfsummen in `index.html`).
