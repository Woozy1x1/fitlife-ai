import re, os
from urllib.parse import urlparse
import sys, json
from playwright.sync_api import sync_playwright
html=open(sys.argv[1],encoding="utf-8").read(); mock=open(sys.argv[2],encoding="utf-8").read()
SPLITROOT=os.path.dirname(os.path.abspath(sys.argv[1])) if not os.path.isdir(sys.argv[1]) else sys.argv[1]
errors=[]; r={}; calls=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    pg=b.new_page(); pg.on("pageerror",lambda e:errors.append(str(e)))
    def route(q):
        u=q.request.url
        if u.startswith("https://app.test/vendor/"): q.fulfill(body=mock,content_type="application/javascript")
        elif u.startswith("https://app.test/sw.js"): q.fulfill(status=404,body="")
        elif re.match(r"https://app\.test/(css|js)/", u):
            pth=os.path.join(SPLITROOT, urlparse(u).path.lstrip("/"))
            q.fulfill(body=open(pth,encoding="utf-8").read(),content_type="text/css" if pth.endswith(".css") else "application/javascript")
        elif u.startswith("https://app.test/"): q.fulfill(body=html,content_type="text/html")
        elif "/auth/v1/settings" in u: q.fulfill(body="{}",content_type="application/json")
        elif "oura-connect" in u:
            from urllib.parse import parse_qs, urlsplit; act=parse_qs(urlsplit(u).query).get("action",[None])[0]
            calls.append(act)
            if act=="status": q.fulfill(body='{"connected":true,"status":{}}',content_type="application/json")
            elif act=="daily": q.fulfill(body='{"data":[{"day":"2026-11-22","score":77}]}',content_type="application/json")
            else: q.fulfill(body='{"data":[]}',content_type="application/json")
        else: q.abort()
    pg.route("**/*",route); pg.clock.install(); pg.goto("https://app.test/",wait_until="commit"); pg.clock.run_for(2000)
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.clock.run_for(1500)
    r["0_calls"]=list(calls); r["0_score"]=pg.text_content("#mainScore"); r["oura"]=[pg.text_content("#trackerTitle"),pg.text_content("#ouraStatus"),pg.text_content("#miniSleepSrc"),pg.text_content("#trackerCardTitle")]
    n=len(calls)
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.clock.run_for(500)
    r["1_tooSoon"]=len(calls)-n
    pg.clock.fast_forward(4*60*1000); n=len(calls)
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.clock.run_for(1500)
    r["2_after4min"]=calls[n:]; r["2_msg"]=pg.text_content("#ouraMessage") if pg.query_selector("#ouraMessage") else None
    n=len(calls)
    for i in range(16): pg.clock.run_for(60*1000)
    r["3_interval"]=calls[n:]
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
