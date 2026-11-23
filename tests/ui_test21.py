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
    # Obst & Gemüse auf Heute
    pg.click("nav button[data-view=homeView]"); pg.wait_for_timeout(300)
    for _ in range(3): pg.click("#vegPlus"); pg.wait_for_timeout(100)
    pg.click("#vegMinus"); pg.wait_for_timeout(400)
    r["veg"]=[pg.text_content("#vegInfo"), pg.evaluate("window.__tables.veg_log")]
    pg.evaluate("document.querySelector('#vegInfo').scrollIntoView({block:'center'})"); pg.screenshot(path=out+"/veg.png")
    # Wohlbefinden
    pg.click("nav button[data-view=healthView]"); pg.wait_for_timeout(400)
    pg.click("#wellSave"); pg.wait_for_timeout(200); r["empty"]=pg.text_content("#wellMessage")
    pg.click("#wellForm input[name=wellMood][value='4'] + span")
    pg.click("#wellForm input[name=wellEnergy][value='3'] + span")
    pg.click("#wellForm input[name=wellStress][value='2'] + span")
    pg.fill("#wellNote","gut geschlafen")
    pg.click("#wellSave"); pg.wait_for_timeout(500)
    r["well"]=[pg.text_content("#wellMessage"), pg.evaluate("window.__tables.wellbeing_log"), pg.inner_text("#wellWeek").replace("\n"," ")]
    pg.evaluate("document.querySelector('#wellCard').scrollIntoView()"); pg.screenshot(path=out+"/well.png")
    # Atemübung
    pg.click("#breathCard input[name=breathMin][value='1'] + span")
    pg.click("#breathStart"); pg.wait_for_timeout(1200)
    r["breath1"]=[pg.text_content("#breathText"),pg.text_content("#breathTime"),pg.text_content("#breathStart")]
    pg.evaluate("document.querySelector('#breathCard').scrollIntoView()"); pg.wait_for_timeout(3500); pg.screenshot(path=out+"/breath.png")
    pg.wait_for_timeout(1500); r["breath2"]=pg.text_content("#breathText")
    pg.click("#breathStart"); pg.wait_for_timeout(200); r["breath3"]=[pg.text_content("#breathText"),pg.text_content("#breathStart")]
    # Neu laden -> Werte bleiben
    pg.reload(); pg.wait_for_timeout(1500)
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
