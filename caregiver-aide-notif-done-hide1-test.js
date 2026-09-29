#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, 'caregiver-push-sw.js'), 'utf8');
const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);

assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-09-29-aide-notif-done-hide1">', 'aide-notif-done-hide1 meta is first');
assert.ok(html.includes('<meta name="caregiver-shell" content="2026-09-29-pages-cache-fresh1">'), 'shell id stays pages-cache-fresh1');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pages-cache-fresh1">') > 0, 'pages-cache-fresh1 meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-29-aide-notif-done-hide1 v=aide-notif-done-hide1'), 'build comment');
assert.ok(html.includes('v=aide-notif-done-hide1'), 'probe marker');
assert.ok(html.includes('?v=aide-notif-done-hide1'), 'cache bust marker');
assert.ok(html.includes('MERGE HOLD') && html.includes('Do not squash-merge') && html.includes('Do not claim LIVE'), 'merge hold');
assert.ok(html.includes("var CLIENTHRS_SW='./caregiver-push-sw.js';"), 'push worker URL stays');
assert.ok(html.includes("navigator.serviceWorker.register(CLIENTHRS_SW,{scope:'./'})"), 'push registration scope stays');
assert.ok(html.includes("var script = './caregiver-push-sw.js';"), 'shell still uses the push worker');
assert.ok(sw.includes('v=pages-cache-fresh1') && sw.includes('skipWaiting') && sw.includes('#messages'), 'push worker shell behavior stays');

const account = html.slice(html.indexOf('id="moreScreen"'), html.indexOf('id="bottomNav"'));
const visible = account.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
assert.ok(account.includes('id="clienthrsPushCard"'), 'settings card');
assert.ok(account.includes('data-notif="v=aide-notif-done-hide1"'), 'card marker');
assert.ok(account.includes('id="clienthrsRemi"'), 'remi toggle');
assert.ok(account.includes('id="clienthrsOffice"'), 'office toggle');
assert.ok(visible.includes('Notifications'), 'title');
assert.ok(visible.includes('Remi reminders'), 'remi label');
assert.ok(visible.includes('Office chat'), 'office label');
assert.ok(visible.includes('Timesheet + schedule pings'), 'remi hint');
assert.ok(visible.includes('Messages when office / Remi write'), 'office hint');
assert.ok(visible.includes('Phone pings on'), 'pings copy');
assert.ok(html.includes('Open the app from your Home Screen, then tap Allow.'), 'quiet home line');
assert.ok(!/Turn on Remi reminders/i.test(visible), 'gate title is gone');
assert.ok(!/Allow notifications/i.test(visible), 'allow button is gone');
assert.ok(!/>Not now</.test(account), 'not now is gone');
assert.ok(!/What you’ll get/i.test(visible), 'what you get is gone');
assert.ok(!/\bVAPID\b/i.test(visible), 'aides do not see VAPID');
assert.ok(!account.includes('id="clienthrsAllow"') && !account.includes('id="clienthrsNotNow"'), 'no gate controls');
assert.ok(account.includes('> Account</div>'), 'account card stays');
assert.ok(account.includes('>Log out</button>'), 'log out stays');

const hrsStart = html.indexOf('// v=clienthrs1d GHOST-CLIENTHRS1D-CONTRACT-v1');
const hrsEnd = html.indexOf('// end v=clienthrs1d', hrsStart);
assert.ok(hrsStart > 0 && hrsEnd > hrsStart, 'clienthrs slice');
const hrsSrc = html.slice(hrsStart, hrsEnd);
assert.ok(hrsSrc.includes('v=aide-notif-done-hide1'), 'slice names this tip');
assert.ok(hrsSrc.includes("CLIENTHRS_HOME_LINE='Open the app from your Home Screen, then tap Allow.'"), 'quiet line constant');
assert.ok(hrsSrc.includes("CLIENTHRS_PINGS_ON='Phone pings on'"), 'pings constant');
assert.ok(!hrsSrc.includes('Lock-screen alerts are on'), 'old success jargon is gone');
assert.ok(!hrsSrc.includes('Push alerts turn on later'), 'old later jargon is gone');

function el(id){
  return {id:id, textContent:'', checked:false, disabled:false, hidden:true};
}

function boot(opts){
  opts = opts || {};
  const mem = {};
  const calls = [];
  const asks = {n:0};
  const pushes = {register:0, subscribe:0};
  const note = el('clienthrsPushNote');
  const remi = el('clienthrsRemi');
  const office = el('clienthrsOffice');
  const pill = el('clienthrsPingsPill');
  const pings = el('clienthrsPings');
  remi.checked = !!opts.remi;
  office.checked = !!opts.office;
  const ctx = {
    currentUser:{username:'sara', name:'Sara'},
    clienthrsPrefs:{remi_reminders:false, office_chat_push:false, timesheet_location_permission:'never_asked', has_active_subscription:false},
    clienthrsBusy:false,
    clienthrsToggleQuiet:false,
    store:{
      get:function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
      set:function(k,v){mem[k]=v;}
    },
    aideChatCanCallAce:function(){return opts.ace !== false;},
    aideChatRpcMissing:function(){return false;},
    sbRest: async function(q, req){
      calls.push({q:q, body:req && req.body});
      if(q==='rpc/get_vapid_public_key'){
        if(opts.configured === false)return {success:true, configured:false, vapidPublicKey:null};
        return {success:true, configured:true, vapidPublicKey:'dGVzdA'};
      }
      if(q==='rpc/aide_upsert_web_push_subscription')return {success:true, has_active_subscription:true};
      if(q==='rpc/aide_revoke_web_push_subscription')return {success:true, revoked:1, has_active_subscription:false};
      if(q==='rpc/aide_save_notification_prefs')return {success:true};
      if(q==='rpc/aide_get_notification_prefs')return {success:true, remi_reminders:!!opts.remi, office_chat_push:!!opts.office, timesheet_location_permission:'never_asked', has_active_subscription:false};
      return {success:true};
    },
    document:{
      getElementById:function(id){
        if(id==='clienthrsPushNote')return note;
        if(id==='clienthrsRemi')return remi;
        if(id==='clienthrsOffice')return office;
        if(id==='clienthrsPingsPill')return pill;
        if(id==='clienthrsPings')return pings;
        if(id==='clienthrsLoc')return el(id);
        return null;
      }
    },
    navigator:{
      userAgent:'test-agent',
      permissions:{query: async function(){return {state:'prompt'};}},
      serviceWorker:{
        register: async function(){
          pushes.register += 1;
          return {pushManager:{subscribe:subscribe}};
        },
        ready:null,
        getRegistration: async function(){return null;},
        addEventListener:function(){}
      }
    },
    window:{PushManager:function(){}},
    Notification:{
      permission: opts.permission || 'default',
      requestPermission: async function(){
        asks.n += 1;
        return opts.grant || 'denied';
      }
    },
    atob:function(s){return Buffer.from(s, 'base64').toString('binary');},
    Uint8Array:Uint8Array,
    JSON:JSON, Object:Object, String:String, Array:Array, Promise:Promise
  };
  function subscribe(){
    pushes.subscribe += 1;
    return {
      endpoint:'https://push.example/sara',
      toJSON:function(){return {endpoint:'https://push.example/sara', keys:{p256dh:'cDEy', auth:'YXV0aA'}};},
      unsubscribe: async function(){return true;}
    };
  }
  ctx.navigator.serviceWorker.ready = Promise.resolve({pushManager:{subscribe:subscribe}});
  vm.createContext(ctx);
  vm.runInContext(hrsSrc, ctx);
  ctx.calls = calls;
  ctx.note = note;
  ctx.remi = remi;
  ctx.office = office;
  ctx.pill = pill;
  ctx.pings = pings;
  ctx.pushes = pushes;
  ctx.asks = asks;
  return ctx;
}

(async function(){
  const denied = boot({permission:'default', grant:'denied'});
  denied.remi.checked = true;
  await vm.runInContext('clienthrsOnToggle()', denied);
  assert.strictEqual(denied.asks.n, 1, 'flip ON asks the phone');
  assert.strictEqual(denied.pushes.subscribe, 0, 'denied permission does not subscribe');
  assert.strictEqual(denied.note.textContent, 'Open the app from your Home Screen, then tap Allow.');
  assert.strictEqual(denied.note.hidden, false);
  assert.strictEqual(denied.pill.hidden, true, 'no pings chip while permission is missing');
  assert.strictEqual(denied.remi.checked, true, 'the toggle still saves');
  const save = denied.calls.filter(function(c){return c.q==='rpc/aide_save_notification_prefs';})[0];
  assert.strictEqual(save.body.p_remi_reminders, true);
  assert.strictEqual(save.body.p_office_chat_push, false);
  assert.ok(denied.calls.some(function(c){return c.q==='rpc/get_vapid_public_key';}), 'flip ON still reads the public key under the hood');

  const granted = boot({permission:'default', grant:'granted'});
  granted.office.checked = true;
  await vm.runInContext('clienthrsOnToggle()', granted);
  assert.strictEqual(granted.asks.n, 1, 'office ON asks too');
  assert.strictEqual(granted.pushes.subscribe, 1, 'granted permission subscribes');
  assert.strictEqual(granted.note.textContent, 'Phone pings on');
  assert.strictEqual(granted.note.hidden, true, 'success is the pings line, not a second sentence');
  assert.strictEqual(granted.pill.hidden, false);
  assert.strictEqual(granted.pings.hidden, false);
  assert.ok(granted.calls.some(function(c){return c.q==='rpc/aide_upsert_web_push_subscription';}));

  const both = boot({permission:'granted', grant:'granted'});
  both.remi.checked = true;
  both.office.checked = true;
  await vm.runInContext('clienthrsOnToggle()', both);
  assert.strictEqual(both.note.textContent, 'Phone pings on');
  assert.strictEqual(both.pill.hidden, false);
  assert.ok(!/allow notifications|turn on remi/i.test(both.note.textContent));

  const off = boot({permission:'granted'});
  off.remi.checked = false;
  off.office.checked = false;
  await vm.runInContext('clienthrsOnToggle()', off);
  assert.strictEqual(off.pushes.subscribe, 0, 'both off does not subscribe');
  assert.strictEqual(off.calls.filter(function(c){return c.q==='rpc/aide_revoke_web_push_subscription';}).length, 1, 'both off revokes');
  assert.strictEqual(off.note.textContent, '', 'both off shows no nag');
  assert.strictEqual(off.pill.hidden, true);

  const later = boot({configured:false, permission:'default', grant:'granted'});
  later.remi.checked = true;
  await vm.runInContext('clienthrsOnToggle()', later);
  assert.strictEqual(later.asks.n, 0, 'a missing key does not ask');
  assert.strictEqual(later.pushes.subscribe, 0);
  assert.strictEqual(later.note.textContent, 'Phone pings turn on later. Your choices are saved.');
  assert.ok(!/vapid/i.test(later.note.textContent), 'later note hides the key name');

  console.log('caregiver-aide-notif-done-hide1 static and vm checks ok');
  console.log('marker proof: '+metas[0]);
  await runBrowser();
})().catch(function(err){
  console.error(err);
  process.exit(1);
});

function loadPuppeteer(){
  try{return require('puppeteer-core');}
  catch(e){
    try{return require('/tmp/aidechat/node_modules/puppeteer-core');}
    catch(e2){return null;}
  }
}

async function runBrowser(){
  if(process.env.SKIP_BROWSER==='1')return;
  const puppeteer = loadPuppeteer();
  if(!puppeteer){
    console.log('aide-notif-done-hide1 browser skipped (no puppeteer-core)');
    return;
  }
  const http = require('http');
  const shotDir = process.env.NOTIF_SHOTS || '/opt/cursor/artifacts/aide-notif-done-hide1';
  fs.mkdirSync(shotDir, {recursive:true});
  const root = __dirname;
  const server = http.createServer(function(req, res){
    const url = (req.url||'/').split('?')[0];
    const rel = url==='/'?'index.html':url.replace(/^\//,'');
    const file = path.join(root, rel);
    if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
    fs.readFile(file, function(err, buf){
      if(err){res.writeHead(404);res.end('missing');return;}
      const ext = path.extname(file);
      const type = ext==='.js'?'text/javascript':ext==='.svg'?'image/svg+xml':'text/html';
      res.writeHead(200, {'Content-Type':type,'Cache-Control':'no-store'});
      res.end(buf);
    });
  });
  await new Promise(function(resolve){server.listen(0, '127.0.0.1', resolve);});
  const port = server.address().port;
  const browser = await puppeteer.launch({
    executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
    headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']
  });
  const origin = 'http://127.0.0.1:'+port;
  try{
    const page = await browser.newPage();
    page.on('pageerror', function(err){console.log('PAGEERROR', err && err.message);});
    page.on('console', function(msg){
      if(msg.type()==='error')console.log('CONSOLE', msg.text());
    });
    await page.evaluateOnNewDocument(function(){
      window.__notifSubs = [];
      window.__notifAnswer = 'denied';
      const origFetch = window.fetch;
      window.fetch = function(url, init){
        const u = String(url);
        if(u.indexOf('supabase.co') === -1)return origFetch.apply(this, arguments);
        let body = {};
        try{body = init && init.body ? JSON.parse(init.body) : {};}catch(e){body = {};}
        let data = {success:true, data:null};
        if(u.indexOf('/auth/v1/') !== -1){
          data = {access_token:'test-jwt', refresh_token:'test-refresh', expires_in:3600, token_type:'bearer', user:{id:'aide-sara'}};
        }else if(u.indexOf('rpc/get_vapid_public_key') !== -1){
          data = {success:true, configured:true, vapidPublicKey:'dGVzdA', note:''};
        }else if(u.indexOf('rpc/aide_upsert_web_push_subscription') !== -1){
          data = {success:true, has_active_subscription:true};
        }else if(u.indexOf('rpc/aide_revoke_web_push_subscription') !== -1){
          data = {success:true, revoked:1, has_active_subscription:false};
        }else if(u.indexOf('rpc/aide_save_notification_prefs') !== -1){
          data = Object.assign({success:true}, body);
        }else if(u.indexOf('rpc/aide_get_notification_prefs') !== -1){
          data = {success:true, remi_reminders:false, office_chat_push:false, timesheet_location_permission:'never_asked', has_active_subscription:false};
        }else if(u.indexOf('rpc/get_active_broadcast') !== -1){
          data = {success:true, data:null};
        }
        return Promise.resolve(new Response(JSON.stringify(data), {status:200, headers:{'Content-Type':'application/json'}}));
      };
      const Asked = {n:0};
      window.__notifAsks = Asked;
      function Notif(){}
      Object.defineProperty(Notif, 'permission', {get:function(){return window.__notifAnswer==='granted'?'granted':'default';}});
      Notif.requestPermission = function(){
        Asked.n += 1;
        return Promise.resolve(window.__notifAnswer==='granted'?'granted':'denied');
      };
      window.Notification = Notif;
      if(window.PushManager && window.PushManager.prototype){
        window.PushManager.prototype.subscribe = function(){
          window.__notifSubs.push(1);
          return Promise.resolve({
            endpoint:'https://push.example/sara',
            unsubscribe:function(){return Promise.resolve(true);},
            toJSON:function(){return {endpoint:'https://push.example/sara', keys:{p256dh:'cDEy', auth:'YXV0aA'}}; }
          });
        };
      }
    });
    await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    await page.goto(origin+'/index.html', {waitUntil:'domcontentloaded', timeout:20000});
    await page.evaluate(function(){
      localStorage.setItem('cg_session', JSON.stringify({
        username:'sara', name:'Sara', loginAt:Date.now()-60*60*1000,
        mustChangePassword:false, needsEmail:false, sbAccessToken:'test-jwt'
      }));
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_sara','1');
    });
    await page.reload({waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForFunction(function(){
      const home=document.getElementById('caregiverScreen');
      const nav=document.getElementById('bottomNav');
      return home&&home.classList.contains('active')&&nav&&nav.hidden===false;
    }, {timeout:8000});
    await page.evaluate(function(){
      document.querySelector('#bottomNav button[data-nav="more"]').click();
    });
    await page.waitForSelector('#clienthrsRemi', {timeout:4000});
    const clean = await page.evaluate(function(){
      const card=document.getElementById('clienthrsPushCard');
      return {
        allow:!!document.getElementById('clienthrsAllow'),
        text:card.innerText,
        remi:document.getElementById('clienthrsRemi').checked,
        office:document.getElementById('clienthrsOffice').checked
      };
    });
    assert.strictEqual(clean.allow, false);
    assert.strictEqual(clean.remi, false);
    assert.strictEqual(clean.office, false);
    assert.ok(!/Turn on Remi reminders|Allow notifications|\bVAPID\b/i.test(clean.text));
    await page.screenshot({path:path.join(shotDir, '00-toggles-off.png')});

    await page.evaluate(function(){
      document.getElementById('clienthrsRemi').click();
    });
    await page.waitForFunction(function(){
      return /Home Screen/.test((document.getElementById('clienthrsPushNote')||{}).textContent||'');
    }, {timeout:8000});
    const homeLine = await page.evaluate(function(){
      const card=document.getElementById('clienthrsPushCard');
      return {
        note:document.getElementById('clienthrsPushNote').textContent,
        hidden:document.getElementById('clienthrsPushNote').hidden,
        allow:!!document.getElementById('clienthrsAllow'),
        pingsHidden:document.getElementById('clienthrsPings').hidden,
        remi:document.getElementById('clienthrsRemi').checked,
        office:document.getElementById('clienthrsOffice').checked,
        asked:(window.__notifAsks&&window.__notifAsks.n)||0,
        subs:(window.__notifSubs||[]).length,
        text:card.innerText
      };
    });
    assert.strictEqual(homeLine.note, 'Open the app from your Home Screen, then tap Allow.');
    assert.strictEqual(homeLine.hidden, false);
    assert.strictEqual(homeLine.allow, false);
    assert.strictEqual(homeLine.pingsHidden, true);
    assert.strictEqual(homeLine.remi, true);
    assert.strictEqual(homeLine.office, false);
    assert.ok(homeLine.asked >= 1, 'flip ON asked for permission');
    assert.strictEqual(homeLine.subs, 0, 'denied permission does not subscribe');
    assert.ok(!/Allow notifications|Turn on Remi|\bVAPID\b/i.test(homeLine.text));
    await page.screenshot({path:path.join(shotDir, '02-home-line.png')});

    await page.evaluate(function(){
      window.__notifAnswer = 'granted';
      document.getElementById('clienthrsOffice').click();
    });
    await page.waitForFunction(function(){
      const note=document.getElementById('clienthrsPushNote');
      const bar=document.getElementById('clienthrsPings');
      return note && note.textContent==='Phone pings on' && bar && bar.hidden===false;
    }, {timeout:8000});
    const pings = await page.evaluate(function(){
      const card=document.getElementById('clienthrsPushCard');
      return {
        remi:document.getElementById('clienthrsRemi').checked,
        office:document.getElementById('clienthrsOffice').checked,
        allow:!!document.getElementById('clienthrsAllow'),
        pill:document.getElementById('clienthrsPingsPill').hidden,
        text:card.innerText,
        subs:(window.__notifSubs||[]).length
      };
    });
    assert.strictEqual(pings.remi, true);
    assert.strictEqual(pings.office, true);
    assert.strictEqual(pings.allow, false, 'both ON still has no allow gate');
    assert.strictEqual(pings.pill, false);
    assert.ok(pings.subs >= 1, 'granted permission subscribes');
    assert.ok(/Phone pings on/.test(pings.text));
    assert.ok(!/Home Screen/.test(pings.text));
    assert.ok(!/Allow notifications|Turn on Remi|\bVAPID\b/i.test(pings.text));
    await page.screenshot({path:path.join(shotDir, '03-phone-pings-on.png')});
  }finally{
    await browser.close();
    server.close();
  }
  console.log('caregiver-aide-notif-done-hide1 browser checks ok');
}
