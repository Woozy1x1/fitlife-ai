import re, os
from urllib.parse import urlparse
import sys, json, datetime
from playwright.sync_api import sync_playwright
html=open(sys.argv[1],encoding="utf-8").read(); mock=open(sys.argv[2],encoding="utf-8").read(); out=sys.argv[3]
SPLITROOT=os.path.dirname(os.path.abspath(sys.argv[1])) if not os.path.isdir(sys.argv[1]) else sys.argv[1]
errors=[]; r={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":390,"height":844},device_scale_factor=2)
    ctx.grant_permissions(["clipboard-read","clipboard-write"],origin="https://app.test")
    pg=ctx.new_page()
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
    r["none"]=[pg.text_content("#trackerTitle"),pg.text_content("#ouraStatus"),pg.text_content("#miniSleepSrc")]
    r["0_hero"]=[pg.text_content("#mainScore"),pg.text_content("#scoreLabel"),pg.text_content("#scoreSource")]
    pg.click("nav button[data-view=healthView]"); pg.wait_for_timeout(300)
    r["0_day"]=pg.input_value("#msDay")
    pg.fill("#msBed","23:40"); pg.fill("#msWake","07:10"); pg.select_option("#msQuality","4")
    pg.click("#msSave"); pg.wait_for_timeout(400)
    r["1_msg"]=pg.text_content("#msMessage"); r["1_rows"]=pg.evaluate("window.__tables.daily_metrics")
    # second night yesterday
    y=(datetime.date.today()-datetime.timedelta(days=1)).isoformat()
    pg.fill("#msDay",y); pg.fill("#msBed","01:00"); pg.fill("#msWake","06:00"); pg.select_option("#msQuality","")
    pg.click("#msSave"); pg.wait_for_timeout(400)
    r["2_count"]=len(pg.evaluate("window.__tables.daily_metrics"))
    r["2_list"]=pg.locator("#metricsList .meal-row").all_text_contents()
    # bad times
    pg.fill("#msBed","07:00"); pg.fill("#msWake","07:10"); pg.click("#msSave"); pg.wait_for_timeout(200)
    r["3_bad"]=pg.text_content("#msMessage")
    pg.screenshot(path=out+"/health_sleep.png",full_page=False)
    pg.click("nav button[data-view=homeView]"); pg.wait_for_timeout(300)
    r["4_hero"]=[pg.text_content("#mainScore"),pg.text_content("#scoreLabel"),pg.text_content("#scoreRating"),pg.text_content("#scoreSource"),pg.text_content("#miniSleep")]
    pg.screenshot(path=out+"/home_fallback.png")
    # apple
    pg.click("nav button[data-view=moreView]"); pg.wait_for_timeout(400)
    r["5_status"]=pg.text_content("#appleStatus"); r["5_url"]=pg.text_content("#appleUrl")
    pg.click("#appleCreate"); pg.wait_for_timeout(500)
    key=pg.input_value("#appleKey"); r["6_keylen"]=len(key); r["6_prefix"]=key[:3]
    tok=pg.evaluate("window.__tables.import_tokens"); r["6_tok"]=tok
    import hashlib; r["6_hashok"]=tok[0]["token_hash"]==hashlib.sha256(key.encode()).hexdigest()
    r["apple"]=[pg.text_content("#trackerTitle"),pg.text_content("#ouraStatus"),pg.text_content("#miniSleepSrc")]
    r["6_status"]=pg.text_content("#appleStatus"); r["6_delVisible"]=pg.is_visible("#appleDelete")
    pg.click("#appleCopy"); pg.wait_for_timeout(200); r["7_copy"]=pg.text_content("#appleMessage")
    pg.locator("#appleCard details summary").click()
    pg.screenshot(path=out+"/apple.png",full_page=True)
    # simulate an apple import today with steps
    pg.evaluate("""()=>{const d=new Date();const t=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      window.__tables.daily_metrics.push({user_id:'u1',day:t,source:'apple_health',sleep_minutes:445,steps:8123,resting_hr:58,active_kcal:410});}""")
    pg.click("#appleDelete"); pg.wait_for_timeout(400)
    r["apple_off"]=[pg.text_content("#trackerTitle"),pg.text_content("#ouraStatus")]
    r["8_tok"]=pg.evaluate("window.__tables.import_tokens"); r["8_status"]=pg.text_content("#appleStatus"); r["8_keyHidden"]=not pg.is_visible("#appleKeyBox")
    # reload data via user change path: call loadMetrics indirectly through re-login
    pg.evaluate("window.__authCb('SIGNED_IN')"); pg.wait_for_timeout(800)
    pg.click("nav button[data-view=homeView]"); pg.wait_for_timeout(300)
    r["9_hero"]=[pg.text_content("#mainScore"),pg.text_content("#scoreSource")]
    r["9_steps"]=pg.evaluate("document.body.innerText.includes('8.123')")
    pg.click("nav button[data-view=healthView]"); pg.wait_for_timeout(300)
    pg.locator("#metricsList .meal-row >> nth=0 >> button").click(); pg.wait_for_timeout(400)
    r["10_tables"]=pg.evaluate("window.__tables.daily_metrics.map(x=>x.day+'/'+x.source)")
    r["10_list"]=pg.locator("#metricsList .meal-row").all_text_contents()
    pg.click("nav button[data-view=homeView]"); pg.wait_for_timeout(300)
    r["10_hero"]=[pg.text_content("#mainScore"),pg.text_content("#scoreSource")]
    r["10_goals"]=pg.evaluate("[...document.querySelectorAll('[id^=goalSteps]')].map(e=>e.id+'='+(e.textContent||e.getAttribute('style')||''))")
    r["10_after_delete"]=len(pg.evaluate("window.__tables.daily_metrics")); r["10_msg"]=pg.text_content("#msMessage")
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
