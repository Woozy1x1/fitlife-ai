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
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1200)
    # Testdaten: 30 Tage Dienstplan + Schlaf + Schritte
    pg.evaluate("""(()=>{const T=window.__tables; const kinds=['frueh','frueh','spaet','spaet','nacht','nacht','frei','frei'];
      const t0=new Date(); for(let i=1;i<=40;i++){const d=new Date(t0); d.setDate(d.getDate()-i); const day=d.toISOString().slice(0,10);
       const k=kinds[i%8]; T.shift_plan.push({user_id:'u1',day,kind:k,start_time:k==='frei'?null:({frueh:'06:00',spaet:'14:00',nacht:'22:00'})[k],end_time:k==='frei'?null:({frueh:'14:00',spaet:'22:00',nacht:'06:00'})[k]});
       T.daily_metrics.push({user_id:'u1',day,source:'manual',sleep_minutes:300+(i%5)*40,steps:4000+(i%7)*1500});
       T.wellbeing_log.push({user_id:'u1',day,mood:3,energy:1+(i%5)});}
      T.user_goals.push({user_id:'u1',shift_mode:true,shift_quiet:true,shift_times:{},shift_autoday:true,shift_quiet_work:false}); sessionStorage.setItem('__persist','1'); window.__save();})()""")
    pg.reload(); pg.wait_for_timeout(1800)
    pg.evaluate("location.hash='#healthView/schlaf'"); pg.wait_for_timeout(1500)
    r["sleep"]=pg.inner_text("#shiftSleepCard")
    pg.locator("#shiftSleepCard").screenshot(path=out+"/shift_table.png")
    pg.evaluate("location.hash='#healthView/arzt'"); pg.wait_for_timeout(800); pg.click("#htab-arzt"); pg.wait_for_timeout(500)
    for v in ["bp","glucose","weight","meds","symptoms","labs"]:
        pg.uncheck(f"input[name=reportPart][value={v}]")
    pg.check("input[name=reportPart][value=shift]")
    pg.evaluate("window.print=()=>{}")
    pg.click("#reportPrint"); pg.wait_for_timeout(1000)
    r["report"]=pg.inner_text("#printReport")[:900]; r["rmsg"]=pg.inner_text("#reportMessage")
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
