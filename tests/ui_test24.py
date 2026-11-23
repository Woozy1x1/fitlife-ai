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
    pg.on("console",lambda m: errors.append("console:"+m.text) if m.type=="error" else None)
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
    pg.add_init_script("window.__realTabs=true")
    pg.route("**/*",route); pg.goto("https://app.test/#healthView/messen"); pg.wait_for_timeout(800)
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1500)
    vis=lambda: pg.evaluate("['heute','messen','schlaf','arzt'].filter(k=>!document.getElementById('hpanel-'+k).classList.contains('hidden'))")
    r["deeplink"]=vis(); r["active"]=pg.evaluate("location.hash")
    pg.screenshot(path=out+"/tabs_messen.png")
    pg.click("#htab-heute"); pg.wait_for_timeout(300); r["heute"]=vis()
    pg.screenshot(path=out+"/tabs_heute.png")
    pg.focus("#htab-heute"); pg.keyboard.press("ArrowRight"); pg.keyboard.press("ArrowRight"); r["keys"]=[vis(),pg.evaluate("document.activeElement.id")]
    pg.screenshot(path=out+"/tabs_schlaf.png")
    pg.click("#htab-arzt"); pg.wait_for_timeout(300); pg.screenshot(path=out+"/tabs_arzt.png")
    pg.evaluate("window.scrollTo(0,1500)"); pg.wait_for_timeout(300); pg.screenshot(path=out+"/tabs_sticky.png")
    pg.reload(); pg.wait_for_timeout(1500); pg.evaluate("location.hash=''"); r["remembered"]=vis()
    # Checkliste '+ Eintragen' springt zum Formular im selben Reiter
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
