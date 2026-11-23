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
    pg.route("**/*",route); pg.clock.install(); pg.goto("https://app.test/"); pg.clock.run_for(800)
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.clock.run_for(1000)
    pg.click("nav button[data-view=trainingView]"); pg.clock.run_for(300)
    r["0_diffs"]=pg.locator("#caliDiffSetup span").all_text_contents(); r["0_info"]=pg.text_content("#caliDiffSetupInfo")
    pg.click("#caliDiffSetup label:nth-child(3)"); r["1_info"]=pg.text_content("#caliDiffSetupInfo")
    pg.click("#caliStartButton"); pg.clock.run_for(500)
    r["2_prog"]=pg.evaluate("window.__tables.training_program")
    r["2_ex"]=pg.locator("#caliExercises .cx strong").all_text_contents() if pg.is_visible("#caliSession") else "notoday"
    if not pg.is_visible("#caliSession"): pg.click("#caliAnyway"); pg.clock.run_for(200); r["2_ex"]=pg.locator("#caliExercises .cx strong").all_text_contents()
    r["2_target"]=pg.text_content("#caliExercises .cx-target"); r["2_today"]=pg.text_content("#caliToday"); r["2_rest"]=pg.text_content("#restTime")
    pg.click("#caliDiffRun label:nth-child(1)"); pg.clock.run_for(400)
    r["3_prog"]=pg.evaluate("window.__tables.training_program[0].program"); r["3_target"]=pg.text_content("#caliExercises .cx-target"); r["3_count"]=pg.locator("#caliExercises .cx").count(); r["3_rest"]=pg.text_content("#restTime"); r["3_msg"]=pg.text_content("#caliMessage")
    pg.fill("#cali-push","10"); pg.click("#caliSave"); pg.clock.run_for(500)
    r["4_entry"]=pg.evaluate("window.__tables.workout_entries.map(e=>[e.exercise,e.sets,e.reps,e.notes])")
    # stretching
    r["5_routines"]=pg.locator("#stretchPick span").all_text_contents(); r["5_info"]=pg.text_content("#stretchInfo")
    pg.click("#stretchPick label:nth-child(4)"); r["6_info"]=pg.text_content("#stretchInfo"); r["6_list"]=pg.locator("#stretchList li").count()
    pg.click("#stretchPick label:nth-child(1)")
    pg.click("#stretchStart"); pg.clock.run_for(1000)
    r["7_step"]=[pg.text_content("#stretchCount"),pg.text_content("#stretchName"),pg.text_content("#stretchTime")]
    pg.clock.run_for(5000); r["8_hold"]=[pg.text_content("#stretchCount"),pg.text_content("#stretchName"),pg.text_content("#stretchTime")]
    pg.screenshot(path=out+"/stretch_run.png")
    pg.click("#stretchPause"); pg.clock.run_for(5000); r["9_paused"]=pg.text_content("#stretchTime"); pg.click("#stretchPause")
    pg.click("#stretchSkip"); pg.clock.run_for(100); r["10_next"]=[pg.text_content("#stretchCount"),pg.text_content("#stretchName")]
    pg.clock.run_for(400*1000); r["11_done"]=pg.is_visible("#stretchDone")
    pg.click("#stretchLog"); pg.clock.run_for(400)
    r["12_entries"]=pg.evaluate("window.__tables.workout_entries.map(e=>[e.exercise,e.reps,e.notes])"); r["12_msg"]=pg.text_content("#stretchMessage")
    pg.click("#caliStretch"); pg.clock.run_for(300); r["13_fromcali"]=pg.is_visible("#stretchRun")
    pg.click("#stretchStop"); r["14_preview"]=pg.is_visible("#stretchPreview")
    pg.evaluate("document.querySelector('#caliCard').scrollIntoView()"); pg.screenshot(path=out+"/cali_diff.png")
    pg.evaluate("document.querySelector('#stretchCard').scrollIntoView()"); pg.screenshot(path=out+"/stretch_card.png")
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
