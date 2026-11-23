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
    pg.route("**/*",route); pg.goto("https://app.test/#homeView"); pg.wait_for_timeout(800)
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1500)
    # Testdaten: 20 Tage Check-ins + Schlaf
    pg.evaluate("""(()=>{const T=window.__tables; const ds=x=>{const y=new Date(); y.setDate(y.getDate()-x); return y.toISOString().slice(0,10)};
      for(let i=0;i<20;i++){ const long=i%2===0; T.daily_metrics.push({user_id:'u1',day:ds(i),source:'manual',sleep_minutes:long?470:360,steps:4000+i*300});
        T.wellbeing_log.push({user_id:'u1',day:ds(i),mood:long?4:3,energy:long?4:2,stress:long?2:4});
        if(i%3===0) T.workout_entries.push({id:'w'+i,user_id:'u1',exercise:'Kniebeuge',sets:3,reps:10,weight_kg:0,entry_date:ds(i)});
        T.water_log.push({user_id:'u1',day:ds(i),glasses:long?8:4}); }
      sessionStorage.setItem('__persist','1'); window.__save();})()""")
    pg.reload(); pg.wait_for_timeout(4500)
    r["tip"]=pg.inner_text("#tipBox")
    r["challengeEmpty"]=pg.inner_text("#challengeBox")
    pg.select_option("#challengeKind","walk"); pg.click("#challengeStart"); pg.wait_for_timeout(600)
    pg.click("#challengeBox .challenge button.btn"); pg.wait_for_timeout(500)
    r["challenge"]=[pg.inner_text("#challengeBox"),pg.text_content("#challengeMessage"),pg.evaluate("window.__tables.user_challenges")]
    pg.click("#challengeCard summary"); pg.wait_for_timeout(300)
    r["milestones"]=pg.inner_text("#milestoneBox")[:400]
    pg.evaluate("document.querySelector('#challengeCard').scrollIntoView()"); pg.screenshot(path=out+"/challenge.png")
    # Training: Erholung, Wochenplan, Bibliothek
    pg.click("nav button[data-view=trainingView]"); pg.wait_for_timeout(600)
    r["recovery"]=pg.inner_text("#recoveryBox")
    pg.click("#weekPlanBox label:has-text('Mo')"); pg.click("#weekPlanBox label:has-text('Do')")
    pg.fill("#weekPlanBox .wp-text >> nth=0","3× Training"); pg.click("#weekPlanSave"); pg.wait_for_timeout(500)
    r["weekplan"]=[pg.text_content("#weekPlanMessage"),pg.evaluate("window.__tables.week_plans")]
    pg.screenshot(path=out+"/training_top.png")
    pg.fill("#libSearch","plank"); pg.wait_for_timeout(200); r["lib"]=pg.inner_text("#libList")
    pg.click("#libList summary"); pg.click("#libList button"); pg.wait_for_timeout(600)
    r["libTake"]=pg.input_value("#exercise")
    # Ernährung: Ballaststoffe + Rezept
    pg.click("nav button[data-view=nutritionView]"); pg.wait_for_timeout(500)
    pg.fill("#foodName","Haferflocken"); pg.fill("#foodAmount","50"); pg.fill("#calories","185"); pg.fill("#protein","6.5"); pg.fill("#carbs","29"); pg.fill("#fat","3.5"); pg.fill("#fiber","5")
    pg.click("#saveMeal"); pg.wait_for_timeout(800)
    r["fiber"]=[pg.text_content("#fiberInfo"),[e.get("fiber_g") for e in pg.evaluate("window.__tables.nutrition_entries")]]
    pg.click("#recipeNew"); pg.fill("#recipeName","Linsen-Curry"); pg.fill("#recipeServings","2")
    pg.fill("#ingSearch","Rote Linsen"); pg.click("#ingManual summary"); pg.fill("#ingKcal","340"); pg.fill("#ingProtein","24"); pg.fill("#ingCarbs","50"); pg.fill("#ingFat","1.5"); pg.fill("#ingFiber","11")
    pg.click("#ingManualBtn"); pg.wait_for_timeout(200)
    pg.fill("#ingList input >> nth=0","200"); pg.wait_for_timeout(200)
    r["totals"]=pg.text_content("#recipeTotals")
    pg.click("#recipeSave"); pg.wait_for_timeout(700)
    r["recipes"]=[pg.inner_text("#recipeList"),pg.text_content("#kitchenMessage")]
    pg.click("#recipeList button:has-text('Tagebuch')"); pg.wait_for_timeout(800)
    r["logged"]=[pg.text_content("#kitchenMessage"),pg.evaluate("window.__tables.nutrition_entries.map(e=>[e.food_name,e.calories,e.fiber_g])")]
    pg.evaluate("document.querySelector('#kitchenCard').scrollIntoView()"); pg.screenshot(path=out+"/kitchen.png")
    pg.click("#kitchenTabs button[data-tab=plan]"); pg.wait_for_timeout(300)
    pg.select_option("#planRecipe",index=1); pg.click("#planAdd"); pg.wait_for_timeout(500)
    r["plan"]=pg.inner_text("#planWeek")[:300]
    pg.click("#planToShop"); pg.wait_for_timeout(700)
    pg.screenshot(path=out+"/plan.png")
    pg.click("#kitchenTabs button[data-tab=shop]"); pg.wait_for_timeout(300)
    pg.fill("#shopName","Joghurt"); pg.click("#shopForm button"); pg.wait_for_timeout(600)
    pg.click("#shopList .shop-item input >> nth=0"); pg.wait_for_timeout(500)
    r["shop"]=[pg.inner_text("#shopList"),pg.evaluate("window.__tables.shopping_items")]
    pg.evaluate("document.querySelector('#kitchenCard').scrollIntoView()"); pg.screenshot(path=out+"/shop.png")
    # Mehr: Zusammenhänge, Tagesansicht, Erinnerungen
    pg.click("nav button[data-view=moreView]"); pg.wait_for_timeout(500)
    r["links"]=pg.inner_text("#linksBox")
    pg.evaluate("document.querySelector('#trendsCard').scrollIntoView()"); pg.screenshot(path=out+"/links.png")
    pg.click("#trendsTabs button[data-tab=day]"); pg.wait_for_timeout(800)
    r["day"]=pg.inner_text("#dayBox")
    pg.screenshot(path=out+"/dayview.png")
    r["remind"]=pg.inner_text("#remindList")[:300]
    pg.check("#rem-weekly"); pg.click("#remd-bp label:has-text('Sa')"); pg.click("#remd-bp label:has-text('So')")
    pg.click("#remindSave"); pg.wait_for_timeout(600)
    r["reminders"]=[pg.text_content("#remindMessage"),[(x["kind"],x.get("days")) for x in pg.evaluate("window.__tables.reminders")]]
    pg.evaluate("document.querySelector('#remindCard').scrollIntoView()"); pg.screenshot(path=out+"/remind.png")
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
