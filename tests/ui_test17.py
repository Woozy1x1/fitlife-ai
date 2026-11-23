import re, os, sys, json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
SPLITROOT=os.path.dirname(os.path.abspath(sys.argv[1]))
html=open(sys.argv[1],encoding="utf-8").read(); mock=open(sys.argv[2],encoding="utf-8").read()
errors=[]; r={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    ctx=b.new_context(); pg=ctx.new_page()
    pg.on("pageerror",lambda e:errors.append(str(e)))
    def route(q):
        u=q.request.url
        if u.startswith("https://app.test/vendor/"): q.fulfill(body=mock,content_type="application/javascript")
        elif u.startswith("https://app.test/sw.js"): q.fulfill(status=404,body="")
        elif re.match(r"https://app\.test/(css|js)/", u):
            pth=os.path.join(SPLITROOT, urlparse(u).path.lstrip("/"))
            q.fulfill(body=open(pth,encoding="utf-8").read(),content_type="text/css" if pth.endswith(".css") else "application/javascript")
        elif u.startswith("https://app.test/"): q.fulfill(body=html,content_type="text/html")
        else: q.abort()
    pg.route("**/*",route)
    # Fall 1: ohne vorherige Bestätigung auf diesem Gerät -> Hinweis statt Dashboard
    pg.add_init_script("window.__netFail=true")
    pg.goto("https://app.test/"); pg.wait_for_timeout(1200)
    r["noflag"]=[pg.is_visible("#dashboard"),pg.is_visible("#consentCard"),pg.is_visible("#authCard")]
    # Fall 2: Einwilligung wurde hier schon bestätigt
    pg.evaluate("localStorage.setItem('vyora_consent_ok',JSON.stringify({uid:'u1',v:'2026-11-22',at:'2026-11-22T20:00:00Z'}))")
    pg.reload(); pg.wait_for_timeout(1500)
    r["withflag"]=[pg.is_visible("#dashboard"),pg.is_visible("#consentCard"),pg.is_visible("#authCard")]
    # Fall 3: falsche Version -> keine Freigabe
    pg.evaluate("localStorage.setItem('vyora_consent_ok',JSON.stringify({uid:'u1',v:'2020-01-01',at:'x'}))")
    pg.reload(); pg.wait_for_timeout(1500)
    r["oldversion"]=[pg.is_visible("#dashboard"),pg.is_visible("#consentCard")]
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
