# VYORA AI – alle App-Tests nacheinander ausführen.
# Aufruf (im Hauptordner des Repos):  python tests/run_all.py
# Die Tests laufen gegen eine nachgebaute Supabase (mock_supabase.js) –
# es werden keine echten Daten gelesen oder geschrieben.
import os, subprocess, sys, glob, re
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)
# Meldungen, die in der Testumgebung immer kommen (Service Worker wird absichtlich nicht geladen)
HARMLESS = re.compile(r"unknown error occurred when fetching the script|ERR_FAILED")
PROBLEM = re.compile(r"Traceback|TypeError|ReferenceError|SyntaxError|console:|pageerror", re.I)

tests = sorted(glob.glob(os.path.join(HERE, "ui_test*.py")), key=lambda p: int(re.search(r"(\d+)", os.path.basename(p)).group(1)))
tests.append(os.path.join(HERE, "a11y.py"))
failed = []
for t in tests:
    name = os.path.basename(t)
    try:
        run = subprocess.run([sys.executable, t, os.path.join(ROOT, "index.html"), os.path.join(HERE, "mock_supabase.js"), OUT],
                             capture_output=True, text=True, timeout=240)
        output = run.stdout + run.stderr
        code = run.returncode
    except subprocess.TimeoutExpired:
        output, code = "Zeitüberschreitung", 1
    problems = [l for l in output.splitlines() if PROBLEM.search(l) and not HARMLESS.search(l)]
    if name == "a11y.py":
        # a11y.py meldet gefundene Probleme in der Liste "errors"
        m = re.search(r'"errors":\s*\[(.*?)\]', output, re.S)
        if m and m.group(1).strip(): problems.append("Barrierefreiheit: " + m.group(1).strip()[:500])
    ok = code == 0 and not problems
    print(("OK    " if ok else "FEHLER") + "  " + name, flush=True)
    if not ok:
        failed.append(name)
        print("\n".join(problems[:20]) or output[-2000:])
print()
if failed:
    print(f"{len(failed)} von {len(tests)} Tests fehlgeschlagen: " + ", ".join(failed))
    sys.exit(1)
print(f"Alle {len(tests)} Tests bestanden.")
