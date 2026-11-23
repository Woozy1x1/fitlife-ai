import re, os
from urllib.parse import urlparse
import sys, json
from playwright.sync_api import sync_playwright
html=open(sys.argv[1],encoding="utf-8").read(); mock=open(sys.argv[2],encoding="utf-8").read(); out=sys.argv[3]
SPLITROOT=os.path.dirname(os.path.abspath(sys.argv[1])) if not os.path.isdir(sys.argv[1]) else sys.argv[1]
errors=[]; r={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":390,"height":844},device_scale_factor=2)
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
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1000)
    pg.click("nav button[data-view=healthView]"); pg.wait_for_timeout(300)
    r["0_hint"]=pg.is_visible("#checkHint"); r["0_rows"]=pg.locator("#checkList .check-row").count()
    pg.click("#checkSettings summary")
    pg.select_option("#setBp","2"); pg.select_option("#setGlucose","4"); pg.select_option("#setInsulin","3"); pg.select_option("#setUnit","mmol_l")
    pg.click("#saveCheck"); pg.wait_for_timeout(400)
    r["1_msg"]=pg.text_content("#checkMessage"); r["1_goals"]=pg.evaluate("window.__tables.user_goals")
    r["1_rows"]=pg.locator("#checkList .check-count").all_text_contents()
    # BP
    pg.click("#checkList .check-row >> nth=0 >> button"); pg.wait_for_timeout(200)
    pg.fill("#mSys","128"); pg.fill("#mDia","82"); pg.fill("#mPulse","70"); pg.click("#saveMeasure"); pg.wait_for_timeout(400)
    r["2_msg"]=pg.text_content("#measureMessage"); r["2_latestBp"]=pg.text_content("#latestBp")
    # glucose mmol
    pg.click("#checkList .check-row >> nth=1 >> button"); pg.wait_for_timeout(200)
    r["3_label"]=pg.text_content("#mGlucoseLabel")
    pg.fill("#mGlucose","6.1"); pg.select_option("#mContext","nuechtern"); pg.click("#saveMeasure"); pg.wait_for_timeout(400)
    # insulin
    pg.click(".seg button[data-kind=insulin]"); pg.fill("#mUnits","6"); pg.fill("#mInsulinName","Testinsulin"); pg.fill("#mKe","4"); pg.click("#saveMeasure"); pg.wait_for_timeout(400)
    # invalid: no units
    pg.click(".seg button[data-kind=insulin]"); pg.click("#saveMeasure"); pg.wait_for_timeout(200); r["4_invalid"]=pg.text_content("#measureMessage")
    # future
    pg.fill("#measureTime","2099-01-01T10:00"); pg.fill("#mUnits","2"); pg.click("#saveMeasure"); pg.wait_for_timeout(200); r["4_future"]=pg.text_content("#measureMessage")
    r["5_rows"]=pg.locator("#checkList .check-count").all_text_contents()
    r["5_list"]=pg.locator("#measureList .meal-row strong").all_text_contents()
    r["5_db"]=pg.evaluate("window.__tables.measurements.map(m=>[m.kind,m.glucose_mg_dl,m.insulin_units,m.carbs_ke])")
    pg.locator("#checkCard").screenshot(path=out+"/check.png")
    pg.screenshot(path=out+"/health_full.png",full_page=True)
    pg.click("#measureList .meal-row >> nth=0 >> button"); pg.wait_for_timeout(400)
    r["6_afterDelete"]=pg.locator("#measureList .meal-row").count()
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
