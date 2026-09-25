#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractFn(src, sig){
  const start = src.indexOf(sig);
  if(start < 0)return '';
  let i = src.indexOf('{', start);
  let depth = 0;
  for(; i < src.length; i++){
    if(src[i] === '{')depth++;
    else if(src[i] === '}'){
      depth--;
      if(depth === 0)return src.slice(start, i + 1);
    }
  }
  return '';
}

assert.ok(html.includes("body:JSON.stringify({action:'ping'})"), 'warm ping must POST action ping');
assert.ok(/function warmUpSheets\(\)\{[\s\S]*?\}\nwarmUpSheets\(\);/.test(html), 'warm ping must run as soon as the script evaluates');
assert.ok(html.includes(".catch(function(){markAceHealthBad();})"), 'ping must soft-fail offline');
assert.ok(html.includes('function markAceHealthBad()'), 'bad /exec health must be soft');
assert.ok(html.includes('if(window._aceLoginOk)return;'), 'a successful login must not stay blocked by an earlier ping miss');

assert.ok(html.includes('const CG_SESSION_MS=8*60*60*1000;'), 'session window must stay 8 hours');
assert.ok(html.includes('expiresAt:loginAt+CG_SESSION_MS'), 'new sessions must record the 8h expiry');
assert.ok(html.includes('mustChangePassword:aideTruth(user&&user.mustChangePassword)'), 'mustChangePassword gate must stay on the session');
assert.ok(html.includes('needsEmail:aideTruth(user&&user.needsEmail)'), 'needsEmail gate must stay on the session');

const sessionSrc = 'const CG_SESSION_MS=8*60*60*1000;\n' +
  extractFn(html, 'function parseLoginAt(sess)') + '\n' +
  extractFn(html, 'function cgSessionExpiresAt(sess)') + '\n' +
  extractFn(html, 'function isCgSessionExpired(sess)');
const session = new Function(sessionSrc + '\nreturn {parseLoginAt, cgSessionExpiresAt, isCgSessionExpired, CG_SESSION_MS};')();
const H = 60 * 60 * 1000;
assert.strictEqual(session.isCgSessionExpired({username:'a', loginAt:Date.now() - 7 * H}), false, '7h session stays');
assert.strictEqual(session.isCgSessionExpired({username:'a', loginAt:Date.now() - 8 * H + 5000}), false, 'inside the 8h window stays');
assert.strictEqual(session.isCgSessionExpired({username:'a', loginAt:Date.now() - 8 * H - 1000}), true, 'past 8h expires');
assert.strictEqual(session.isCgSessionExpired({username:'a'}), false, 'missing loginAt does not force re-login');
assert.strictEqual(session.isCgSessionExpired({username:'a', loginAt:Date.now() - 2 * H, expiresAt:Date.now() + H}), false, 'a longer stored expiry is kept');

const afterLogin = extractFn(html, 'function afterLogin(opts)');
const loadHome = extractFn(html, 'function loadCaregiverScreen()');
const schedule = extractFn(html, 'function scheduleHomeBackgroundLoads()');
assert.ok(afterLogin.includes('if(aideSetupRequired())'), 'setup gate still runs before home');
assert.ok(afterLogin.indexOf('loadCaregiverScreen()') > afterLogin.indexOf('aideSetupRequired()'), 'home load stays behind the setup gate');
assert.ok(!/await\s+/.test(afterLogin), 'afterLogin must not await list fetches');
assert.ok(loadHome.indexOf("showScreen('caregiverScreen')") < loadHome.indexOf('renderTSHome()'), 'home screen before the list paint');
assert.ok(loadHome.indexOf('renderTSHome()') < loadHome.indexOf('scheduleHomeBackgroundLoads()'), 'local home paint before background lists');
assert.ok(!/await\s+/.test(loadHome), 'loadCaregiverScreen must not await Sheets');
assert.ok(!html.includes('await restoreCloudBackups'), 'backup restore must not block home');
assert.ok(!html.includes('await checkForCorrection'), 'correction list must not block home');
assert.ok(schedule.includes("apiGetCached('get_clients')"), 'clients load stays in the background');
assert.ok(schedule.includes('if(aceExecSoft())return;'), 'background lists stay soft when /exec health is bad');
assert.ok(!/function scheduleHomeBackgroundLoads\(\)\{[\s\S]*?get_users/.test(schedule), 'login background must not call get_users');
assert.ok(!/function scheduleHomeBackgroundLoads\(\)\{[\s\S]*?get_all/.test(schedule), 'login background must not call get_all');

const doLogin = extractFn(html, 'async function doLogin()');
assert.ok(doLogin.includes('afterLogin({freshLogin:true})'), 'successful login goes straight to afterLogin');
assert.ok(!doLogin.includes('requestAnimationFrame'), 'login must not defer navigation behind a frame');
assert.ok(!/get_users|get_all/.test(doLogin), 'doLogin must not fetch user or full lists');

const setup = extractFn(html, 'async function submitAideSetup()');
assert.ok(setup.includes('showAideSetupSaved()'), 'setup completion shows the Open Caregiver success CTA');

console.log('login-feel static checks ok');

async function runBrowser(){
  if(process.env.SKIP_BROWSER==='1')return;
  let puppeteer;
  try{puppeteer=require('puppeteer-core');}
  catch(e){puppeteer=require('/tmp/cgtest/node_modules/puppeteer-core');}
  const browser=await puppeteer.launch({
    executablePath:process.env.CHROME_PATH||'/usr/local/bin/google-chrome',
    headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']
  });
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});
  const heavy=[];
  let sawPing=false;
  await page.setRequestInterception(true);
  page.on('request',req=>{
    const u=req.url();
    if(/fonts\.googleapis|fonts\.gstatic|gstatic\.com/.test(u)){req.abort();return;}
    if(!/script\.google\.com/.test(u)){req.continue();return;}
    let body={};
    try{body=JSON.parse(req.postData()||'{}');}catch(e){}
    const action=body.action||(req.method()==='GET'?'GET':'');
    if(action==='ping')sawPing=true;
    else if(action&&action!=='login'&&action!=='GET')heavy.push(action);
    const payload=action==='login'
      ?{success:true,name:'Test Aide',mustChangePassword:false,needsEmail:false,email:'aide@example.com'}
      :{success:true,ok:true,data:[]};
    req.respond({
      status:200,
      contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},
      body:JSON.stringify(payload)
    });
  });
  page.on('dialog',d=>d.accept());
  const rawUrl=process.env.CG_URL||'http://127.0.0.1:8765/index.html';
  const url=rawUrl+(rawUrl.indexOf('?')>=0?'&':'?')+'sheets=1';
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>window._sheetsWarmUpStarted===true,{timeout:5000});
  const pingDeadline=Date.now()+5000;
  while(!sawPing&&Date.now()<pingDeadline)await new Promise(r=>setTimeout(r,40));
  assert.ok(sawPing,'opening the app must warm-ping /exec');

  const expired=await page.evaluate(()=>{
    localStorage.setItem('cg_session',JSON.stringify({username:'old',name:'Old Aide',loginAt:Date.now()-9*60*60*1000,mustChangePassword:false,needsEmail:false}));
    return true;
  });
  assert.ok(expired);
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>document.getElementById('authScreen').classList.contains('active'),{timeout:5000});

  await page.evaluate(()=>{
    localStorage.setItem('cg_session',JSON.stringify({username:'keep',name:'Kept Aide',loginAt:Date.now()-7*60*60*1000,mustChangePassword:false,needsEmail:false}));
  });
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>document.getElementById('caregiverScreen').classList.contains('active'),{timeout:5000});
  const keptName=await page.$eval('#hdr_name',el=>el.textContent);
  assert.strictEqual(keptName,'Kept Aide');

  await page.evaluate(()=>{
    localStorage.removeItem('cg_session');
    sessionStorage.removeItem('cg_session');
  });
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForSelector('#l_user',{timeout:5000});
  await page.evaluate(()=>{
    window._fetchLog=[];
    const orig=window.fetch.bind(window);
    window.fetch=function(url,opts){
      let action='';
      try{action=JSON.parse((opts&&opts.body)||'{}').action||'';}catch(e){}
      window._fetchLog.push({
        action,
        home:!!(document.getElementById('caregiverScreen')&&document.getElementById('caregiverScreen').classList.contains('active'))
      });
      return orig(url,opts);
    };
  });
  await page.$eval('#l_user',el=>{el.value='aide1';});
  await page.$eval('#l_pass',el=>{el.value='secret';});
  await page.click('#loginBtn');
  await page.waitForFunction(()=>document.getElementById('caregiverScreen').classList.contains('active'),{timeout:5000});
  await page.waitForFunction(()=>['get_my_backups','get_correction'].every(a=>window._fetchLog.some(e=>e.action===a)),{timeout:5000});
  const order=await page.evaluate(()=>window._fetchLog);
  const heavyActions=order.filter(e=>['get_clients','get_my_backups','get_correction','get_assigned_topic','get_is_reminder','get_users','get_all'].includes(e.action));
  assert.ok(heavyActions.length>0,'background lists should still run after home is visible');
  assert.ok(heavyActions.every(e=>e.home),'heavy lists ran before home was visible: '+JSON.stringify(order));
  assert.ok(!heavyActions.some(e=>e.action==='get_users'||e.action==='get_all'),'login must not fetch get_users or get_all');
  const gated=await page.evaluate(()=>{
    startCgSession({username:'new',name:'New Aide',mustChangePassword:true,needsEmail:false});
    afterLogin({freshLogin:true});
    return document.getElementById('aideSetupScreen').classList.contains('active')&&!document.getElementById('caregiverScreen').classList.contains('active');
  });
  assert.ok(gated,'mustChangePassword still blocks home');
  const beforeSoft=await page.evaluate(()=>{
    window._fetchLog.push({action:'soft-mark',home:true});
    window._aceHealthBad=true;
    window._aceLoginOk=false;
    scheduleHomeBackgroundLoads();
    return window._fetchLog.length;
  });
  await new Promise(r=>setTimeout(r,400));
  const extra=await page.evaluate(()=>window._fetchLog.slice(window._fetchLog.findIndex(e=>e.action==='soft-mark')+1));
  assert.deepStrictEqual(extra,[],'bad /exec health must not fire heavy lists');
  assert.ok(beforeSoft>0);
  await browser.close();
  console.log('login-feel browser checks ok',{heavy});
}

runBrowser().catch(function(err){
  console.error(err);
  process.exit(1);
});
