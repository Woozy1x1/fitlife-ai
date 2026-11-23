import re, os
from urllib.parse import urlparse
import sys, json
from playwright.sync_api import sync_playwright
html=open(sys.argv[1],encoding="utf-8").read(); mock=open(sys.argv[2],encoding="utf-8").read()
SPLITROOT=os.path.dirname(os.path.abspath(sys.argv[1])) if not os.path.isdir(sys.argv[1]) else sys.argv[1]
errors=[]; r={}
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
        elif "oura-connect" in u: q.fulfill(body='{"connected":false,"status":{}}',content_type="application/json")
        else: q.abort()
    pg.route("**/*",route); pg.goto("https://app.test/"); pg.wait_for_timeout(800)
    # logged-out view via deleted flag
    pg.evaluate("window.__deleted=true"); pg.evaluate("window.__authCb && window.__authCb('SIGNED_OUT')"); pg.wait_for_timeout(500)
    r["authVisible"]=pg.is_visible("#authCard")
    pg.click("#forgotButton"); r["noEmail"]=pg.text_content("#message")
    pg.fill("#email","test@example.com"); pg.click("#forgotButton"); pg.wait_for_timeout(200)
    r["reset"]=pg.evaluate("window.__reset"); r["msg"]=pg.text_content("#message")
    pg.evaluate("window.__deleted=false; window.__authCb('PASSWORD_RECOVERY')"); pg.wait_for_timeout(500)
    r["resetCard"]=pg.is_visible("#resetCard")
    pg.fill("#newPassword","abcdefgh"); pg.fill("#newPassword2","abcdefgX"); pg.click("#resetSave"); r["mismatch"]=pg.text_content("#resetMessage")
    pg.fill("#newPassword2","abcdefgh"); pg.click("#resetSave"); pg.wait_for_timeout(300)
    r["updated"]=pg.evaluate("window.__updated"); r["hidden"]=not pg.is_visible("#resetCard"); r["final"]=pg.text_content("#message")
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
