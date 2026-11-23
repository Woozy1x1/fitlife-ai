import re, os, sys, json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
SPLITROOT=os.path.dirname(os.path.abspath(sys.argv[1]))
html=open(sys.argv[1],encoding="utf-8").read(); mock=open(sys.argv[2],encoding="utf-8").read(); out=sys.argv[3]
errors=[]; r={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":390,"height":844}); pg=ctx.new_page()
    pg.on("pageerror",lambda e:errors.append(str(e))); pg.on("dialog",lambda d:d.accept())
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
    r["flag"]=pg.evaluate("localStorage.getItem('vyora_consent_ok')")
    ctx.set_offline(True); pg.wait_for_timeout(300)
    r["banner_off"]=[pg.is_visible("#offlineBanner"),pg.text_content("#offlineBanner")]
    pg.click("#waterPlus"); pg.click("#waterPlus"); pg.wait_for_timeout(300)
    pg.click("nav button[data-view=healthView]"); pg.wait_for_timeout(200)
    pg.select_option("#measureKind","bp") if pg.query_selector("#measureKind") else None
    # Gesundheitswert (Gewicht) offline
    pg.fill("#bodyWeight","80.5") if pg.query_selector("#bodyWeight") else None
    pg.click("#saveHealth"); pg.wait_for_timeout(300)
    r["healthMsg"]=pg.text_content("#healthMessage")
    q=pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('vyora_offline_')).map(k=>JSON.parse(localStorage[k]))")
    r["queue"]=[[i["table"],i["onConflict"],i["row"].get("glasses") or i["row"].get("weight_kg"),bool(i["row"].get("id"))] for i in q[0]] if q else q
    r["db_before"]=[len(pg.evaluate("window.__tables.water_log")),len(pg.evaluate("window.__tables.health_entries"))]
    r["banner_wait"]=pg.text_content("#offlineBanner")
    ctx.set_offline(False); pg.wait_for_timeout(1200)
    r["db_after"]=[pg.evaluate("window.__tables.water_log.map(x=>x.glasses)"),pg.evaluate("window.__tables.health_entries.map(x=>x.weight_kg)")]
    r["queue_after"]=pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('vyora_offline_')).length")
    r["msg"]=pg.text_content("#message"); r["banner_hidden"]=not pg.is_visible("#offlineBanner")
    # Doppelte Übertragung derselben ID wird ignoriert
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
