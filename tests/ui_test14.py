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
    pg.route("**/*",route); pg.goto("https://app.test/"); pg.wait_for_timeout(800)
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1200)
    r["0"]=[pg.text_content("#waterInfo"),pg.text_content("#goalWaterText"),pg.is_disabled("#waterMinus")]
    for _ in range(5): pg.click("#waterPlus")
    pg.click("#waterMinus"); pg.wait_for_timeout(600)
    r["1"]=[pg.text_content("#waterInfo"),pg.evaluate("window.__tables.water_log")]
    pg.click("nav button[data-view=moreView]"); pg.wait_for_timeout(300)
    pg.fill("#goalWaterInput","8"); pg.click("#saveGoals"); pg.wait_for_timeout(400)
    r["2"]=[pg.text_content("#goalsMessage"),pg.evaluate("window.__tables.user_goals")]
    pg.fill("#goalWaterInput","50"); pg.click("#saveGoals"); pg.wait_for_timeout(300); r["2b"]=pg.text_content("#goalsMessage")
    pg.fill("#goalWaterInput","8"); pg.click("#saveGoals"); pg.wait_for_timeout(300)
    pg.click("nav button[data-view=homeView]"); pg.wait_for_timeout(300)
    r["3"]=[pg.text_content("#goalWaterText"),pg.text_content("#goalWaterValue")]
    pg.evaluate("document.querySelector('.goal-rings').scrollIntoView({block:'center'})"); pg.screenshot(path=out+"/water.png")
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
