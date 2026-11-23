import re, os, sys, json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
SPLITROOT=os.path.dirname(os.path.abspath(sys.argv[1]))
html=open(sys.argv[1],encoding="utf-8").read(); mock=open(sys.argv[2],encoding="utf-8").read(); out=sys.argv[3]
errors=[]; r={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":390,"height":844},device_scale_factor=2)
    pg.on("pageerror",lambda e:errors.append(str(e)))
    def route(q):
        u=q.request.url
        if u.startswith("https://app.test/vendor/"): q.fulfill(body=mock,content_type="application/javascript")
        elif u.startswith("https://app.test/sw.js"): q.fulfill(status=404,body="")
        elif re.match(r"https://app\.test/(css|js)/", u):
            pth=os.path.join(SPLITROOT, urlparse(u).path.lstrip("/"))
            q.fulfill(body=open(pth,encoding="utf-8").read(),content_type="text/css" if pth.endswith(".css") else "application/javascript")
        elif u.startswith("https://app.test/"): q.fulfill(body=html,content_type="text/html")
        elif "/auth/v1/settings" in u: q.fulfill(body="{}",content_type="application/json")
        elif "oura-connect" in u: q.fulfill(body='{"connected":false,"status":{}}',content_type="application/json")
        else: q.abort()
    pg.route("**/*",route); pg.goto("https://app.test/#trainingView"); pg.wait_for_timeout(800)
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1200)
    view=pg.evaluate("document.getElementById('calcCard').closest('.view').id")
    r["view"]=view
    pg.evaluate("v=>switchViewForTest(v)" if False else "()=>0")
    pg.click(f"nav button[data-view={view}]"); pg.wait_for_timeout(500)
    # Unter 18 wird abgelehnt
    pg.select_option("#calcSex","m"); pg.fill("#calcBirthYear","2010"); pg.fill("#calcHeight","180"); pg.fill("#calcWeight","80")
    pg.select_option("#calcPal","1.6"); pg.select_option("#calcGoal","lose")
    pg.click("#calcSave"); pg.wait_for_timeout(300); r["minor"]=pg.text_content("#calcMessage")
    pg.fill("#calcBirthYear",str(2026-28)); pg.click("#calcSave"); pg.wait_for_timeout(500)
    r["msg"]=pg.text_content("#calcMessage"); r["result"]=pg.inner_text("#calcResult")
    r["form"]=[pg.input_value("#goalKcalInput"),pg.input_value("#goalProteinInput")]
    r["db1"]=pg.evaluate("window.__tables.user_goals")
    r["ring"]=pg.text_content("#goalKcalText")
    pg.evaluate("document.querySelector('#calcCard').scrollIntoView()"); pg.screenshot(path=out+"/calc.png")
    # neues Gewicht -> automatisch neu
    pg.click("nav button[data-view=healthView]"); pg.wait_for_timeout(400)
    pg.fill("#bodyWeight","76"); pg.click("#saveHealth"); pg.wait_for_timeout(900)
    g=pg.evaluate("window.__tables.user_goals")[0]
    r["auto"]=[g.get("kcal"),g.get("protein_g"),g.get("calc_weight_kg"),g.get("auto_goals")]
    # manuelle Änderung -> Automatik aus
    pg.click(f"nav button[data-view={view}]"); pg.wait_for_timeout(300)
    pg.fill("#goalKcalInput","2500"); pg.click("#saveGoals"); pg.wait_for_timeout(500)
    g=pg.evaluate("window.__tables.user_goals")[0]
    r["manual"]=[g.get("kcal"),g.get("auto_goals"),pg.text_content("#goalsMessage")]
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
