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

assert.ok(!html.includes("body:JSON.stringify({action:'ping'})"), 'warm ping is removed');
assert.ok(!html.includes('function warmUpSheets('), 'warm-up function is removed');
assert.ok(!html.includes('function markAceHealthBad()'), 'warm health helper is removed');
assert.ok(!html.includes('function aceExecSoft('), 'warm soft-fail helper is removed');

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
assert.ok(schedule.includes('sbLoadHomeLists(restoreBackups)'), 'clients and backups stay in the background');
assert.ok(schedule.includes('checkForCorrection()'), 'corrections load in the background');
assert.ok(!schedule.includes('sheetsOffMessage()'), 'home lists do not use a sheets rollback');
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
  await page.setRequestInterception(true);
  page.on('request',req=>{
    const u=req.url();
    if(/fonts\.googleapis|fonts\.gstatic|gstatic\.com/.test(u)){req.abort();return;}
    if(/script\.google\.com|\/exec/.test(u)){
      heavy.push(u);
      req.respond({
        status:401,
        contentType:'text/html',
        headers:{'Access-Control-Allow-Origin':'*'},
        body:'<html><title>Sign in</title></html>'
      });
      return;
    }
    if(/supabase\.co/.test(u)){
      req.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'[]'});
      return;
    }
    req.continue();
  });
  page.on('dialog',d=>d.accept());
  const rawUrl=process.env.CG_URL||'http://127.0.0.1:8765/index.html';
  const url=rawUrl+(rawUrl.indexOf('?')>=0?'&':'?')+'sheets=1';
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
  await new Promise(r=>setTimeout(r,200));
  assert.deepStrictEqual(heavy,[],'opening the app must not call Apps Script');

  const expired=await page.evaluate(()=>{
    localStorage.setItem('cg_session',JSON.stringify({username:'old',name:'Old Aide',loginAt:Date.now()-9*60*60*1000,mustChangePassword:false,needsEmail:false}));
    return true;
  });
  assert.ok(expired);
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>document.getElementById('authScreen').classList.contains('active'),{timeout:5000});

  await page.evaluate(()=>{
    localStorage.setItem('cg_session',JSON.stringify({username:'keep',name:'Kept Aide',loginAt:Date.now()-7*60*60*1000,mustChangePassword:false,needsEmail:false,sbAccessToken:'jwt-test'}));
  });
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>{
    if(typeof homeAddrGate!=='undefined')homeAddrGate.phase='clear';
    const home=document.getElementById('caregiverScreen');
    if(home&&home.classList.contains('active'))return true;
    if(typeof currentUser!=='undefined'&&currentUser&&typeof loadCaregiverScreen==='function')loadCaregiverScreen();
    return false;
  },{timeout:5000});
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
      if(/script\.google\.com/.test(String(url)))return Promise.reject(new Error('blocked'));
      let action='';
      try{action=JSON.parse((opts&&opts.body)||'{}').action||'';}catch(e){}
      window._fetchLog.push({
        action,
        home:!!(document.getElementById('caregiverScreen')&&document.getElementById('caregiverScreen').classList.contains('active'))
      });
      return orig(url,opts);
    };
  });
  const screens=await page.evaluate(()=>{
    return {
      login:document.getElementById('authScreen').classList.contains('active'),
      timesheet:!!document.getElementById('caregiverScreen'),
      inservice:!!document.getElementById('inserviceScreen')
    };
  });
  assert.strictEqual(screens.login, true, 'login screen stays rendered');
  assert.ok(screens.timesheet && screens.inservice, 'timesheet and inservice screens stay in the page');
  const order=await page.evaluate(()=>window._fetchLog);
  const heavyActions=order.filter(e=>['get_clients','get_my_backups','get_correction','get_assigned_topic','get_is_reminder','get_users','get_all'].includes(e.action));
  assert.deepStrictEqual(heavyActions,[],'background lists do not post Apps Script actions');
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
