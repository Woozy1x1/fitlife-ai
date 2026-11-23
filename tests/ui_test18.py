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
    r["hashView"]=pg.evaluate("document.querySelector('.view.active')?.id")
    pg.click("nav button[data-view=moreView]"); pg.wait_for_timeout(500)
    r["rows"]=pg.locator("#remindList .remind-row").count(); r["status"]=pg.text_content("#pushStatus")
    r["btns"]=[pg.is_visible("#pushEnable"),pg.is_visible("#pushTest")]
    pg.check("#rem-bp"); pg.fill("#remt-bp","07:45"); pg.check("#rem-water")
    pg.click("#remindSave"); pg.wait_for_timeout(400)
    r["msg"]=pg.text_content("#remindMessage")
    r["db"]=[[x["kind"],x["at_time"],x["enabled"],x["tz"]] for x in pg.evaluate("window.__tables.reminders")]
    pg.evaluate("document.querySelector('#remindCard').scrollIntoView()"); pg.screenshot(path=out+"/remind.png")
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
