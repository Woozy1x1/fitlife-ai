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
    pg.clock.install(time="2026-11-24T03:00:00")  # Di 03:00, mitten im Nachtdienst Mo->Di
    pg.route("**/*",route); pg.goto("https://app.test/"); pg.wait_for_timeout(800)
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1500)
    r["date_before"]=pg.evaluate("document.getElementById('nutritionDate').value")
    pg.click("nav button[data-view=moreView]"); pg.wait_for_timeout(400)
    pg.check("#shiftMode"); pg.check("#shiftQuietWork"); pg.click("#shiftSave"); pg.wait_for_timeout(400)
    # Mo 23.11. Nachtdienst eintragen
    pg.evaluate("[...document.querySelectorAll('.sp-day')].find(b=>b.getAttribute('aria-label').startsWith('Mo 23.11.')).click()"); pg.wait_for_timeout(200)
    pg.click(".sp-kind.k-nacht"); pg.wait_for_timeout(600)
    pg.click(".sp-kind.k-frei"); pg.wait_for_timeout(300)   # Di frei
    pg.click(".sp-kind.k-frueh"); pg.wait_for_timeout(300)  # Mi früh
    r["windows"]=pg.evaluate("localStorage.getItem('vyora_night_days')")
    r["date_after"]=pg.evaluate("document.getElementById('nutritionDate').value")
    r["goals"]=pg.evaluate("JSON.stringify(window.__tables?.user_goals||null)")
    pg.click("nav button[data-view=nutritionView]"); pg.wait_for_timeout(400)
    r["food"]=pg.inner_text("#shiftFoodCard")
    pg.locator("#shiftFoodCard").screenshot(path=out+"/shift_food.png")
    pg.click("nav button[data-view=trainingView]"); pg.wait_for_timeout(1500)
    r["recovery"]=pg.inner_text("#recoveryShift")
    pg.click("#wpShiftSuggest"); pg.wait_for_timeout(200)
    r["wp"]=[pg.inner_text("#wpShiftMessage"),pg.evaluate("[...document.querySelectorAll('input[name=wpDay]')].map(b=>b.checked)")]
    pg.locator("#weekPlanCard").screenshot(path=out+"/shift_weekplan.png")
    pg.click("nav button[data-view=healthView]"); pg.wait_for_timeout(300)
    r["med"]=pg.evaluate("(()=>{const e=document.getElementById(\"medShiftNote\");return e?[e.className,getComputedStyle(e).display,e.closest(\".hidden\")?.id]:null})()")
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
