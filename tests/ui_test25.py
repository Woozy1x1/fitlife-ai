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
    pg.add_init_script("window.__realTabs=true")
    pg.route("**/*",route); pg.goto("https://app.test/"); pg.wait_for_timeout(800)
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1500)
    r["hidden_before"]=pg.evaluate("['shiftTodayCard','shiftSleepCard','shiftMoveCard','shiftPlanCard'].map(i=>document.getElementById(i).classList.contains('hidden'))")
    pg.click("nav button[data-view=moreView]"); pg.wait_for_timeout(400)
    pg.check("#shiftMode"); pg.fill("#st-nacht-s","21:45")
    pg.click("#shiftSave"); pg.wait_for_timeout(400)
    r["msg"]=pg.inner_text("#shiftMessage")
    r["goals"]=pg.evaluate("window.__tables ? null : null")
    r["plan_visible"]=pg.is_visible("#shiftPlanCard")
    # Heute: Frühdienst morgen nach Spätdienst heute -> Ruhezeit-Hinweis
    today=pg.evaluate("(()=>{const b=document.querySelector('.sp-day.today');return b?b.getAttribute('aria-label'):null})()")
    r["today_label"]=today
    pg.click(".sp-day.today"); pg.wait_for_timeout(200)
    pg.click(".sp-kind.k-spaet"); pg.wait_for_timeout(300)
    r["after_click_sel"]=pg.evaluate("document.querySelector('.sp-day.sel')?.getAttribute('aria-label')")
    pg.click(".sp-kind.k-frueh"); pg.wait_for_timeout(300)
    # day after tomorrow: Nacht
    pg.click(".sp-kind.k-nacht"); pg.wait_for_timeout(300)
    r["counts"]=pg.inner_text("#spCounts")
    pg.screenshot(path=out+"/shift_plan.png",full_page=False)
    pg.locator("#shiftPlanCard").screenshot(path=out+"/shift_plan_card.png")
    pg.click("#spCopy"); pg.wait_for_timeout(300); r["copy"]=pg.inner_text("#spMessage")
    pg.click("nav button[data-view=homeView]"); pg.wait_for_timeout(400)
    r["today_card"]=pg.inner_text("#shiftTodayCard")
    pg.locator("#shiftTodayCard").screenshot(path=out+"/shift_today.png")
    pg.click("nav button[data-view=trainingView]"); pg.wait_for_timeout(300)
    r["move"]=pg.inner_text("#shiftMoveCard")
    pg.locator("#shiftMoveCard").screenshot(path=out+"/shift_move.png")
    pg.goto("https://app.test/#healthView/schlaf"); pg.wait_for_timeout(1500)
    r["sleep"]=pg.inner_text("#shiftSleepCard")
    pg.locator("#shiftSleepCard").screenshot(path=out+"/shift_sleep.png")
    # Nickerchen-Feld
    r["nap_field"]=pg.is_visible("#msNap")
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
