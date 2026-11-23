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
    pg.route("**/*",route); pg.goto("https://app.test/#trainingView"); pg.wait_for_timeout(800)
    pg.check("#consentHealth"); pg.check("#consentTerms"); pg.click("#consentButton"); pg.wait_for_timeout(1200)
    res=pg.evaluate("""()=>{
      const out={noName:[],noLabel:[],noAlt:[],small:[],contrast:[]};
      const vis=e=>{const r=e.getBoundingClientRect();return true};
      const name=e=>(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')&&document.getElementById(e.getAttribute('aria-labelledby'))?.textContent||e.textContent||e.title||e.value||'').trim();
      document.querySelectorAll('button,a[href],[role=button],[role=tab]').forEach(e=>{if(!name(e)&&!e.querySelector('img[alt]:not([alt=""])'))out.noName.push(e.outerHTML.slice(0,90))});
      document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(e=>{const ok=(e.id&&document.querySelector('label[for="'+e.id+'"]'))||e.closest('label')||e.getAttribute('aria-label')||e.getAttribute('aria-labelledby');if(!ok)out.noLabel.push(e.outerHTML.slice(0,90))});
      document.querySelectorAll('img').forEach(e=>{if(!e.hasAttribute('alt'))out.noAlt.push(e.outerHTML.slice(0,80))});
      const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2])};
      const bgOf=e=>{while(e){const b=getComputedStyle(e).backgroundColor;if(b&&!b.startsWith('rgba(0, 0, 0, 0)')&&b!=='transparent'){const a=b.match(/[\d.]+/g);if(a.length<4||Number(a[3])>0.9)return b}e=e.parentElement}return 'rgb(16,13,36)'};
      const seen=new Set();
      document.querySelectorAll('body *').forEach(e=>{
        if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return;
        const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden')return;
        const fs=parseFloat(cs.fontSize); if(fs<12)out.small.push(e.tagName+'.'+e.className+' '+fs);
        const fg=cs.color; const bg=bgOf(e); const L1=lum(fg),L2=lum(bg); const r=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
        const need=(fs>=24||(fs>=18.66&&Number(cs.fontWeight)>=700))?3:4.5;
        const k=fg+'|'+bg; if(r<need&&!seen.has(k)){seen.add(k);out.contrast.push([e.tagName+'.'+e.className,fg,bg,r.toFixed(2),e.textContent.trim().slice(0,30)])}
      });
      out.lang=document.documentElement.lang; out.zoom=document.querySelector('meta[name=viewport]').content;
      return out}""")
    r["a11y"]=res
    b.close()
print(json.dumps({"r":r,"errors":errors},ensure_ascii=False,indent=1))
