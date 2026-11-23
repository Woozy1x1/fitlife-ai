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
    pg.route("**/*",route); pg.add_init_script("window.__allowTour=true")
    pg.goto("https://app.test/"); pg.wait_for_timeout(800)
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1200)
    r["open"]=pg.evaluate("document.querySelector('#tourDialog').open"); r["s1"]=pg.text_content("#tourTitle")
    pg.screenshot(path=out+"/tour1.png")
    pg.click("#tourNext"); r["s2"]=pg.text_content("#tourTitle"); pg.click("#tourNext"); r["s3"]=[pg.text_content("#tourTitle"),pg.text_content("#tourNext"),pg.text_content("#tourSkip")]
    pg.click("#tourNext"); pg.wait_for_timeout(500)
    r["after"]=[pg.evaluate("document.querySelector('#tourDialog').open"),pg.evaluate("document.querySelector('#moreView').classList.contains('active')"),pg.evaluate("!!window.__tables.user_goals[0]?.tour_done_at")]
    # relogin same user -> no tour
    pg.reload(); pg.wait_for_timeout(300); pg.evaluate("window.__tables.user_goals.push({user_id:'u1',tour_done_at:'2026-11-22T20:00:00Z'})")
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1200)
    r["second"]=pg.evaluate("document.querySelector('#tourDialog').open")
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
