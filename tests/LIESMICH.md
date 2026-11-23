# VYORA AI – App-Tests

Die Tests starten die App in einem Test-Browser (Chrome) und klicken die
wichtigsten Abläufe durch: Anmelden, Einwilligung, Ernährung, Training,
Gesundheit, Schichtdienst, Arztbericht, Barrierefreiheit.

- Die Datenbank ist nachgebaut (`mock_supabase.js`) – es werden **keine echten
  Daten** gelesen oder geschrieben.
- Auf GitHub laufen die Tests bei jeder Änderung automatisch
  (`.github/workflows/app-tests.yml`). Unter „Actions“ siehst du das Ergebnis;
  bei einem Fehler schickt GitHub eine E-Mail.
- Lokal: `pip install playwright` und dann `python tests/run_all.py`.
