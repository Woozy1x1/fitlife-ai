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
    pg.route("**/*",route); pg.goto("https://app.test/#healthView"); pg.wait_for_timeout(800)
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1200)
    pg.evaluate("sessionStorage.setItem('__persist','1')")
    r["consentVersion"]=pg.evaluate("window.__tables.user_consents.map(c=>c.version)")
    pg.click("nav button[data-view=healthView]"); pg.wait_for_timeout(500)
    r["medEmpty"]=pg.inner_text("#medToday")
    # Medikament anlegen mit 2 Uhrzeiten
    pg.fill("#medName","Ramipril 5 mg"); pg.fill("#medAmount","1 Tablette")
    pg.fill("#medTimes input >> nth=0","08:00")
    pg.click("#medAddTime"); pg.fill("#medTimes input >> nth=1","20:00")
    pg.check("#medRemind")
    pg.click("#medSave"); pg.wait_for_timeout(600)
    r["medMsg"]=pg.text_content("#medMessage"); r["meds"]=pg.evaluate("window.__tables.medications")
    r["today"]=pg.inner_text("#medToday")
    pg.click("#medToday .check-row >> nth=0 >> button"); pg.wait_for_timeout(500)
    r["intakes"]=pg.evaluate("window.__tables.medication_intakes"); r["today2"]=pg.inner_text("#medToday")
    pg.evaluate("document.querySelector('#medCard').scrollIntoView()"); pg.screenshot(path=out+"/med.png")
    # Untoggle
    pg.click("#medToday .check-row >> nth=0 >> button"); pg.wait_for_timeout(500)
    r["intakes2"]=len(pg.evaluate("window.__tables.medication_intakes"))
    # Bearbeiten
    pg.click("#medList button:has-text('Ändern')"); pg.wait_for_timeout(200)
    pg.fill("#medAmount","2 Tabletten"); pg.click("#medSave"); pg.wait_for_timeout(500)
    r["medEdited"]=pg.evaluate("window.__tables.medications.map(m=>[m.amount,m.times])")
    pg.screenshot(path=out+"/med2.png",full_page=False)
    # Symptom
    pg.fill("#symName","Kopfschmerzen"); pg.fill("#symIntensity","7"); pg.dispatch_event("#symIntensity","input")
    pg.click("#symSave"); pg.wait_for_timeout(500)
    r["sym"]=[pg.text_content("#symMessage"),pg.evaluate("window.__tables.symptom_log"),pg.inner_text("#symRecent")]
    pg.evaluate("document.querySelector('#symptomCard').scrollIntoView()"); pg.screenshot(path=out+"/sym.png")
    # Labor
    pg.click("#labAdd summary"); pg.fill("#labName","HbA1c"); pg.dispatch_event("#labName","change")
    r["labUnit"]=pg.input_value("#labUnit")
    pg.fill("#labValue","5.6"); pg.fill("#labLow","4"); pg.fill("#labHigh","6"); pg.fill("#labDay","2026-05-01")
    pg.click("#labSave"); pg.wait_for_timeout(500)
    pg.fill("#labName","HbA1c"); pg.fill("#labUnit","%"); pg.fill("#labValue","5.8"); pg.fill("#labDay","2026-11-01"); pg.click("#labSave"); pg.wait_for_timeout(500)
    r["lab"]=[pg.text_content("#labMessage"),len(pg.evaluate("window.__tables.lab_results")),pg.inner_text("#labList")]
    pg.click("#labList summary"); pg.wait_for_timeout(200)
    pg.evaluate("document.querySelector('#labCard').scrollIntoView()"); pg.screenshot(path=out+"/lab.png")
    # BP-Messung im Messtagebuch, dann Wochenübersicht
    pg.evaluate("""(()=>{const t=window.__tables.measurements; const d=new Date(); d.setHours(7,30,0,0);
      t.push({id:'m1',user_id:'u1',kind:'bp',measured_at:d.toISOString(),systolic:128,diastolic:82,pulse:66});
      const e=new Date(); e.setHours(19,0,0,0); if(e>new Date()) e.setDate(e.getDate()-1);
      t.push({id:'m2',user_id:'u1',kind:'bp',measured_at:e.toISOString(),systolic:122,diastolic:78,pulse:70});})()""")
    pg.reload(); pg.wait_for_timeout(1500)
    pg.click("nav button[data-view=healthView]"); pg.wait_for_timeout(500)
    r["bpWeek"]=pg.inner_text("#bpWeek")
    r["medAfterReload"]=pg.inner_text("#medToday")
    pg.evaluate("document.querySelector('#bpWeekCard').scrollIntoView()"); pg.screenshot(path=out+"/bpweek.png")
    # Subnav
    pg.evaluate("window.scrollTo(0,0)"); pg.screenshot(path=out+"/subnav.png")
    pg.click("#htab-arzt"); pg.wait_for_timeout(800)
    r["focus"]=pg.evaluate("document.activeElement.textContent")
    # Bericht
    pg.evaluate("window.print=()=>{window.__printed=(window.__printed||0)+1}")
    pg.click("#reportPrint"); pg.wait_for_timeout(800)
    r["report"]=[pg.text_content("#reportMessage"),pg.evaluate("window.__printed"),pg.evaluate("document.getElementById('printReport').innerText.slice(0,1500)")]
    pg.emulate_media(media="print"); pg.pdf(path=out+"/report.pdf") if False else None
    pg.screenshot(path=out+"/print.png",full_page=True)
    pg.emulate_media(media="screen")
    # Training PR
    pg.evaluate("""(()=>{const t=window.__tables.workout_entries; const d=new Date(); const ds=x=>{const y=new Date(); y.setDate(y.getDate()-x); return y.toISOString().slice(0,10)};
      t.push({id:'w1',user_id:'u1',exercise:'Bankdrücken',sets:3,reps:8,weight_kg:60,entry_date:ds(20)});
      t.push({id:'w2',user_id:'u1',exercise:'Bankdrücken',sets:3,reps:6,weight_kg:65,entry_date:ds(2)});
      t.push({id:'w3',user_id:'u1',exercise:'Klimmzüge',sets:3,reps:8,weight_kg:null,entry_date:ds(9)});})()""")
    pg.reload(); pg.wait_for_timeout(1500)
    pg.click("nav button[data-view=trainingView]"); pg.wait_for_timeout(500)
    r["pr"]=pg.inner_text("#prCard")
    pg.evaluate("document.querySelector('#prCard').scrollIntoView()"); pg.screenshot(path=out+"/pr.png")
    # Mehr: Schichtarbeit + MFA
    pg.click("nav button[data-view=moreView]"); pg.wait_for_timeout(400)
    r["mfaStatus"]=pg.text_content("#mfaStatus")
    pg.click("#mfaEnable"); pg.wait_for_timeout(400)
    r["mfaSetupVisible"]=pg.is_visible("#mfaSetup"); r["secret"]=pg.input_value("#mfaSecret")
    pg.fill("#mfaVerifyCode","000000"); pg.click("#mfaVerifyButton"); pg.wait_for_timeout(300)
    r["mfaWrong"]=pg.text_content("#mfaSetupMessage")
    pg.fill("#mfaVerifyCode","123456"); pg.click("#mfaVerifyButton"); pg.wait_for_timeout(400)
    r["mfaOk"]=[pg.text_content("#mfaSetupMessage"),pg.text_content("#mfaStatus"),pg.is_visible("#mfaDisable")]
    pg.evaluate("document.querySelector('#securityCard').scrollIntoView()"); pg.screenshot(path=out+"/mfa.png")
    # Gate: Sitzung nur aal1 -> Code-Abfrage
    pg.evaluate("window.__mfa.aal='aal1'"); pg.reload(); pg.wait_for_timeout(1500)
    r["gate"]=[pg.is_visible("#mfaCard"),pg.is_visible("#dashboard")]
    pg.screenshot(path=out+"/mfagate.png")
    pg.fill("#mfaCode","123456"); pg.click("#mfaButton"); pg.wait_for_timeout(1200)
    r["gate2"]=[pg.is_visible("#mfaCard"),pg.is_visible("#dashboard")]
    # Schichtarbeit
    pg.click("nav button[data-view=moreView]"); pg.wait_for_timeout(300)
    pg.select_option("#dayStartSelect","4"); pg.click("#dayStartSave"); pg.wait_for_timeout(2500)
    r["dayStart"]=[pg.evaluate("localStorage.getItem('vyora_day_start')"),pg.evaluate("window.__tables.user_goals")]
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
