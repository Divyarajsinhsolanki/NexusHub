// Capture real UI screens with synthetic demo records only. See docs/PORTFOLIO_SCREENSHOTS.md.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const outputDirectory = process.env.OUTPUT_DIR || '/tmp/nexus-ui-capture';
fs.mkdirSync(outputDirectory, { recursive: true });
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try {
 const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
 await page.goto(baseURL+'/',{waitUntil:'networkidle'});
 const status=await page.evaluate(async()=> (await fetch('/api/demo_session',{method:'POST',headers:{'X-CSRF-Token':document.querySelector('meta[name="csrf-token"]')?.content,'Content-Type':'application/json'},body:'{}'})).status);
 if(status!==200) throw Error('Demo sign-in failed: '+status);
 const manifest=await page.evaluate(async()=>await(await fetch('/api/demo/manifest')).json());
 const projectRoute=manifest.groups.find(x=>x.key==='delivery').route;
 const shots=[['01-project-delivery',projectRoute],['02-planning-focus','/planning'],['03-collaboration','/teams'],['04-knowledge-learning','/knowledge'],['05-pdf-workflows','/pdf-master'],['07-project-operations',projectRoute+'?tab=environments'],['06-platform-engineering','/settings']];
 for(const[name,route]of shots.filter(([name])=>!process.env.SHOTS||process.env.SHOTS.split(',').includes(name))){
   await page.goto(baseURL+route,{waitUntil:'domcontentloaded'});
   await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
   await page.waitForTimeout(1800);
   if(name==='03-collaboration') { await page.getByText('Release Readiness',{exact:true}).first().click(); await page.waitForTimeout(1400); }
   if(name==='04-knowledge-learning') {const inbox=page.getByRole('button',{name:/ChatGPT inbox/i});if(await inbox.count()) await inbox.first().click();await page.waitForTimeout(400);}
   if(name==='06-platform-engineering') { await page.getByRole('tab',{name:'Workspace',exact:true}).click(); await page.waitForTimeout(1000); }
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r;setTimeout(r,3000)})));});
   await page.screenshot({path:path.join(outputDirectory, name+'.png')});
   console.log(name, page.url(), await page.title());
 }
 } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
