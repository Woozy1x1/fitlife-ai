import re, os, sys, json, datetime
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
SPLITROOT=os.path.dirname(os.path.abspath(sys.argv[1]))
html=open(sys.argv[1],encoding="utf-8").read(); mock=open(sys.argv[2],encoding="utf-8").read(); out=sys.argv[3]
errors=[]; r={}
D=lambda n:(datetime.date.today()-datetime.timedelta(days=n)).isoformat()
seed={"workout_entries":[{"user_id":"u1","entry_date":D(n),"exercise":"x","notes":"Calisthenics A"} for n in (0,2,4,8,10)],
 "nutrition_entries":[{"user_id":"u1","entry_date":D(n),"calories":c} for n,c in ((0,1800),(1,2200),(1,300),(9,1500))],
 "health_entries":[{"user_id":"u1","entry_date":D(n),"weight_kg":w,"systolic":None,"diastolic":None,"pulse":None,"created_at":D(n)+"T08:00:00Z"} for n,w in ((25,82.4),(15,81.9),(5,81.2),(1,80.8))],
 "measurements":[{"user_id":"u1","kind":"bp","measured_at":D(n)+"T07:30:00Z","systolic":s,"diastolic":d,"pulse":p} for n,s,d,p in ((20,135,88,72),(12,131,85,70),(6,128,83,69),(2,126,82,66))]+
   [{"user_id":"u1","kind":"glucose","measured_at":D(n)+"T07:00:00Z","glucose_mg_dl":g} for n,g in ((10,104),(3,99),(1,112))],
 "daily_metrics":[{"user_id":"u1","day":D(n),"source":"apple_health","sleep_minutes":m,"steps":st} for n,m,st in ((0,430,8000),(1,410,6000),(3,460,9000),(8,380,5000),(9,400,7000))]}
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
    pg.route("**/*",route)
    pg.add_init_script("window.__seed="+json.dumps(seed))
    pg.goto("https://app.test/"); pg.wait_for_timeout(300)
    pg.evaluate("for(const k in window.__seed) window.__tables[k].push(...window.__seed[k])")
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(2000)
    r["week"]={k:pg.text_content("#"+k) for k in ["wkSleep","wkSleepDelta","wkTrain","wkTrainDelta","wkKcal","wkKcalDelta","wkSteps","wkStepsDelta"]}
    pg.evaluate("document.querySelector('#weekCard').scrollIntoView()"); pg.screenshot(path=out+"/week.png")
    pg.click("nav button[data-view=healthView]"); pg.wait_for_timeout(400)
    res={}
    for i,key in enumerate(["weight","bp","pulse","glucose","sleep"]):
        pg.click(f"#trendPick label:nth-child({i+1})"); pg.wait_for_timeout(150)
        res[key]=[pg.text_content("#trendInfo"),pg.locator("#trendBox polyline").count(),pg.locator("#trendBox circle").count()]
        if key=="bp":
            pg.evaluate("document.querySelector('#trendCard').scrollIntoView()"); pg.screenshot(path=out+"/trend_bp.png")
    pg.click("#trendRange label:nth-child(2)"); pg.wait_for_timeout(150)
    res["sleep90"]=pg.text_content("#trendInfo")
    r["trend"]=res
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
