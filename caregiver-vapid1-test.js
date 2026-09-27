#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const PUB = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

function decodeUrlB64(s){
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (String(s) + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Array.from(Buffer.from(b64, 'base64'));
}

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, 'caregiver-push-sw.js'), 'utf8');
const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);

assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-09-27-vapid1">', 'first meta is vapid1');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-27-clienthrs1d">') > 0, 'clienthrs1d meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-27-vapid1 v=vapid1 —'), 'vapid1 comment');
assert.ok(html.indexOf('<!-- caregiver-build: 2026-09-27-vapid1 v=vapid1 —') < html.indexOf('<!-- caregiver-build: 2026-09-27-clienthrs1d v=clienthrs1d —'), 'vapid1 comment is first');
assert.ok(html.includes('v=vapid1'), 'vapid1 probe');
assert.ok(html.includes('GHOST-VAPID1-CONTRACT-v1 is CALLABLE'), 'ace vapid contract is callable');
assert.ok(html.includes('data-vapid="v=vapid1"'), 'card marker');
assert.ok(html.includes('data-clienthrs="v=clienthrs1d"'), 'clienthrs card marker stays');
assert.ok(html.includes('rpc/get_vapid_public_key'), 'vapid rpc');
assert.ok(html.includes('rpc/aide_upsert_web_push_subscription'), 'upsert rpc');
assert.ok(html.includes('rpc/aide_revoke_web_push_subscription'), 'revoke rpc');
assert.ok(html.includes('rpc/aide_get_notification_prefs') && html.includes('rpc/aide_save_notification_prefs'), 'roster prefs stay');
assert.ok(html.includes('applicationServerKey:clienthrsUrlBase64ToUint8Array(vapid.key)'), 'subscribe uses the public key bytes');
assert.ok(!html.includes('id="remiScreen"'), 'remi is never a full page');
assert.ok(!/VAPID_PRIVATE_KEY|BEGIN (?:RSA |EC )?PRIVATE KEY|evercare-vapid\.env/.test(html), 'no private key material in the page');
assert.ok(!/VAPID_PRIVATE_KEY|BEGIN (?:RSA |EC )?PRIVATE KEY|evercare-vapid\.env/.test(sw), 'no private key material in the push worker');
assert.ok(!/quo/i.test(sw) && !/sms:/i.test(sw), 'push worker does not send sms');
assert.ok(html.includes('display_name') && html.includes('aide_list_office_messages'), 'chat display names stay');

const expectedPub = decodeUrlB64(PUB);
assert.strictEqual(expectedPub.length, 65, 'fixture is a public key');
assert.strictEqual(expectedPub[0], 4, 'uncompressed public point');

const hrsStart = html.indexOf('// v=clienthrs1d GHOST-CLIENTHRS1D-CONTRACT-v1');
const hrsEnd = html.indexOf('// end v=clienthrs1d', hrsStart);
assert.ok(hrsStart > 0 && hrsEnd > hrsStart, 'clienthrs slice');
const hrsSrc = html.slice(hrsStart, hrsEnd);
assert.ok(hrsSrc.includes('v=vapid1 GHOST-VAPID1-CONTRACT-v1 CALLABLE'), 'slice names the callable');

function el(id){
  return {id:id, textContent:'', checked:false, disabled:false};
}

function boot(opts){
  opts = opts || {};
  const mem = {};
  const calls = [];
  const timeline = [];
  const pushes = {register:0, subscribe:0, last:null};
  const note = el('clienthrsPushNote');
  const remi = el('clienthrsRemi');
  const office = el('clienthrsOffice');
  const loc = el('clienthrsLoc');
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
    aideChatRpcMissing:function(err){return !!(err && err.missing);},
    sbRest: async function(q, req){
      calls.push({q:q, body:req && req.body});
      timeline.push(q);
      if(typeof opts.sbRest === 'function')return opts.sbRest(q, req);
      if(q==='rpc/get_vapid_public_key'){
        if(opts.vapid === 'throw')throw new Error('network');
        if(opts.vapid && Object.prototype.hasOwnProperty.call(opts, 'vapid'))return opts.vapid;
        return {success:true, configured:false, vapidPublicKey:null, note:'later'};
      }
      if(q==='rpc/aide_upsert_web_push_subscription')return {success:true, has_active_subscription:true, endpoint:req.body.p_endpoint};
      if(q==='rpc/aide_revoke_web_push_subscription')return {success:true, revoked:1, has_active_subscription:false};
      if(q==='rpc/aide_save_notification_prefs')return {success:true};
      if(q==='rpc/aide_get_notification_prefs')return {success:true, remi_reminders:false, office_chat_push:false, timesheet_location_permission:'never_asked', has_active_subscription:false};
      return {success:true};
    },
    document:{
      getElementById:function(id){
        if(id==='clienthrsPushNote')return note;
        if(id==='clienthrsRemi')return remi;
        if(id==='clienthrsOffice')return office;
        if(id==='clienthrsLoc')return loc;
        if(id==='clienthrsAllow'||id==='clienthrsNotNow')return el(id);
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
    Notification:{permission:'granted', requestPermission: async function(){return 'granted';}},
    location:{hash:'', search:'', pathname:'/caregiver/index.html'},
    sessionStorage:{getItem:function(){return null;}, setItem:function(){}, removeItem:function(){}},
    atob:function(s){return Buffer.from(s, 'base64').toString('binary');},
    Uint8Array:Uint8Array,
    JSON:JSON, Object:Object, String:String, Array:Array, Promise:Promise
  };
  function subscribe(options){
    pushes.subscribe += 1;
    pushes.last = options;
    timeline.push('subscribe');
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
  ctx.timeline = timeline;
  ctx.note = note;
  ctx.remi = remi;
  ctx.office = office;
  ctx.pushes = pushes;
  return ctx;
}

function liveVapid(extra){
  const body = {success:true, configured:true, vapidPublicKey:PUB, note:'Ghost uses vapidPublicKey in browser PushManager.subscribe; private key never leaves server.'};
  return Object.assign(body, extra || {});
}

(async function(){
  const off = boot();
  await vm.runInContext('clienthrsAllowNotifications()', off);
  assert.deepStrictEqual(off.timeline, ['rpc/aide_save_notification_prefs', 'rpc/get_vapid_public_key'], 'unconfigured allow saves prefs then asks for the key');
  assert.strictEqual(off.pushes.subscribe, 0, 'configured false does not subscribe');
  assert.strictEqual(off.pushes.register, 0, 'configured false does not register');
  assert.ok(!off.calls.some(function(c){return c.q==='rpc/aide_upsert_web_push_subscription';}), 'configured false does not upsert');
  assert.strictEqual(off.note.textContent, 'Push alerts turn on later. Your reminder choices are saved.');
  assert.strictEqual(off.remi.checked, true, 'prefs still save when push is off');
  assert.strictEqual(off.office.checked, true);

  const absent = [
    {success:true, configured:null, vapidPublicKey:PUB},
    {success:true, configured:false, vapidPublicKey:PUB},
    {success:true, vapidPublicKey:PUB},
    {success:true, configured:true, vapidPublicKey:null},
    {success:true, configured:true, vapidPublicKey:''},
    {success:true, configured:true, vapidPublicKey:'   '},
    {success:true, configured:true, public_key:''}
  ];
  for(let i=0;i<absent.length;i++){
    const soft = boot({vapid:absent[i]});
    let threw = false;
    try{await vm.runInContext('clienthrsAllowNotifications()', soft);}catch(err){threw = true;}
    assert.strictEqual(threw, false, 'soft-disable does not throw '+JSON.stringify(absent[i]));
    assert.strictEqual(soft.pushes.subscribe, 0, 'no subscribe for '+JSON.stringify(absent[i]));
    assert.strictEqual(soft.note.textContent, 'Push alerts turn on later. Your reminder choices are saved.');
    assert.strictEqual(soft.calls.filter(function(c){return c.q==='rpc/aide_save_notification_prefs';}).length, 1, 'prefs still save');
  }

  const broken = boot({vapid:'throw'});
  let brokenThrew = false;
  try{await vm.runInContext('clienthrsAllowNotifications()', broken);}catch(err){brokenThrew = true;}
  assert.strictEqual(brokenThrew, false, 'a vapid read error does not throw');
  assert.strictEqual(broken.pushes.subscribe, 0, 'a vapid read error does not subscribe');
  assert.strictEqual(broken.note.textContent, 'Push alerts turn on later. Your reminder choices are saved.');

  const live = boot({vapid:liveVapid()});
  await vm.runInContext('clienthrsAllowNotifications()', live);
  assert.deepStrictEqual(live.timeline, [
    'rpc/aide_save_notification_prefs',
    'rpc/get_vapid_public_key',
    'subscribe',
    'rpc/aide_upsert_web_push_subscription'
  ], 'configured true subscribes with the key then upserts');
  assert.strictEqual(live.pushes.subscribe, 1);
  assert.strictEqual(live.pushes.last.userVisibleOnly, true);
  assert.deepStrictEqual(Array.from(live.pushes.last.applicationServerKey), expectedPub, 'applicationServerKey is urlB64ToUint8Array(vapidPublicKey)');
  const pageBytes = vm.runInContext('Array.from(clienthrsUrlBase64ToUint8Array('+JSON.stringify(PUB)+'))', live);
  assert.deepStrictEqual(pageBytes, expectedPub, 'page decoder matches the public key');
  const up = live.calls.filter(function(c){return c.q==='rpc/aide_upsert_web_push_subscription';});
  assert.strictEqual(up.length, 1);
  assert.strictEqual(up[0].body.p_endpoint, 'https://push.example/sara');
  assert.strictEqual(up[0].body.p_p256dh, 'cDEy');
  assert.strictEqual(up[0].body.p_auth, 'YXV0aA');
  assert.strictEqual(up[0].body.p_user_agent, 'test-agent');
  assert.strictEqual(live.note.textContent, 'Lock-screen alerts are on. A tap opens Messages.');

  const snake = boot({vapid:{success:true, configured:'true', vapid_public_key:PUB}});
  await vm.runInContext('clienthrsAllowNotifications()', snake);
  assert.strictEqual(snake.pushes.subscribe, 1, 'configured string true with vapid_public_key subscribes');
  assert.deepStrictEqual(Array.from(snake.pushes.last.applicationServerKey), expectedPub);

  let configured = true;
  const flip = boot({
    sbRest: async function(q, req){
      if(q==='rpc/get_vapid_public_key'){
        return configured
          ? liveVapid()
          : {success:true, configured:false, vapidPublicKey:null, note:'later'};
      }
      if(q==='rpc/aide_upsert_web_push_subscription')return {success:true, has_active_subscription:true, endpoint:req.body.p_endpoint};
      return {success:true};
    }
  });
  await vm.runInContext('clienthrsAllowNotifications()', flip);
  assert.strictEqual(flip.pushes.subscribe, 1, 'first allow subscribes');
  configured = false;
  let flipThrew = false;
  try{await vm.runInContext('clienthrsAllowNotifications()', flip);}catch(err){flipThrew = true;}
  assert.strictEqual(flipThrew, false, 'configured flipping false does not throw');
  assert.strictEqual(flip.pushes.subscribe, 1, 'a later false configured does not subscribe again');
  assert.strictEqual(flip.note.textContent, 'Push alerts turn on later. Your reminder choices are saved.');

  const skip = boot({vapid:liveVapid()});
  await vm.runInContext('clienthrsNotNow()', skip);
  assert.strictEqual(skip.pushes.subscribe, 0, 'opt-out does not subscribe');
  const revoked = skip.calls.filter(function(c){return c.q==='rpc/aide_revoke_web_push_subscription';});
  assert.strictEqual(revoked.length, 1, 'opt-out revokes');
  assert.strictEqual(JSON.stringify(revoked[0].body), '{}', 'null endpoint revokes this aide');
  assert.strictEqual(skip.remi.checked, false);
  assert.strictEqual(skip.office.checked, false);

  const toggled = boot({vapid:liveVapid()});
  toggled.remi.checked = true;
  toggled.office.checked = false;
  await vm.runInContext('clienthrsOnToggle()', toggled);
  assert.strictEqual(toggled.pushes.subscribe, 1, 'remi switch subscribes when configured');
  assert.deepStrictEqual(Array.from(toggled.pushes.last.applicationServerKey), expectedPub);
  toggled.remi.checked = false;
  await vm.runInContext('clienthrsOnToggle()', toggled);
  assert.strictEqual(toggled.calls.filter(function(c){return c.q==='rpc/aide_revoke_web_push_subscription';}).length, 1, 'both switches off revoke');
  assert.strictEqual(toggled.pushes.subscribe, 1, 'opt-out does not subscribe again');

  console.log('caregiver-vapid1 static and vm checks ok');
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
    console.log('caregiver-vapid1 browser skipped (no puppeteer-core)');
    return;
  }
  const http = require('http');
  const shotDir = process.env.VAPID_SHOTS || '/opt/cursor/artifacts';
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
  try{
    const page = await browser.newPage();
    const origin = 'http://127.0.0.1:'+port;
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(origin, ['notifications']);
    page.on('pageerror', function(err){console.log('PAGEERROR', err && err.message);});
    page.on('console', function(msg){
      if(msg.type()==='error')console.log('CONSOLE', msg.text());
    });
    await page.evaluateOnNewDocument(function(publicKey){
      window.__vapidState = {configured:true, key:publicKey, upserts:[], revokes:[]};
      window.__vapidSubs = [];
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
          data = window.__vapidState.configured
            ? {success:true, configured:true, vapidPublicKey:window.__vapidState.key, note:''}
            : {success:true, configured:false, vapidPublicKey:null, note:'later'};
        }else if(u.indexOf('rpc/aide_upsert_web_push_subscription') !== -1){
          window.__vapidState.upserts.push(body);
          data = {success:true, has_active_subscription:true};
        }else if(u.indexOf('rpc/aide_revoke_web_push_subscription') !== -1){
          window.__vapidState.revokes.push(body);
          data = {success:true, revoked:1, has_active_subscription:false};
        }else if(u.indexOf('rpc/aide_save_notification_prefs') !== -1){
          data = {success:true};
        }else if(u.indexOf('rpc/aide_get_notification_prefs') !== -1){
          data = {success:true, remi_reminders:false, office_chat_push:false, timesheet_location_permission:'never_asked', has_active_subscription:false};
        }else if(u.indexOf('rpc/get_active_broadcast') !== -1){
          data = {success:true, data:null};
        }
        return Promise.resolve(new Response(JSON.stringify(data), {status:200, headers:{'Content-Type':'application/json'}}));
      };
      if(window.PushManager && window.PushManager.prototype){
        window.PushManager.prototype.subscribe = function(opts){
          const key = opts && opts.applicationServerKey;
          const bytes = key ? Array.from(key instanceof ArrayBuffer ? new Uint8Array(key) : new Uint8Array(key.buffer || key)) : null;
          window.__vapidSubs.push({userVisibleOnly:!!(opts && opts.userVisibleOnly), key:bytes});
          return Promise.resolve({
            endpoint:'https://push.example/sara',
            unsubscribe:function(){return Promise.resolve(true);},
            toJSON:function(){return {endpoint:'https://push.example/sara', keys:{p256dh:'cDEy', auth:'YXV0aA'}}; }
          });
        };
      }
    }, PUB);
    await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    await page.goto(origin+'/index.html', {waitUntil:'domcontentloaded', timeout:20000});
    await page.evaluate(function(){
      localStorage.setItem('cg_session', JSON.stringify({
        username:'sara',
        name:'Sara',
        loginAt:Date.now()-60*60*1000,
        mustChangePassword:false,
        needsEmail:false,
        sbAccessToken:'test-jwt'
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
    await page.waitForSelector('#clienthrsAllow', {timeout:4000});
    await page.evaluate(function(){
      const btn=document.getElementById('clienthrsAllow');
      if(btn&&btn.scrollIntoView)btn.scrollIntoView({block:'center'});
      btn.click();
    });
    await page.waitForFunction(function(){
      return /Lock-screen alerts are on/.test((document.getElementById('clienthrsPushNote')||{}).textContent||'');
    }, {timeout:8000});
    const on = await page.evaluate(function(){
      const card = document.getElementById('clienthrsPushCard');
      return {
        marker: card ? card.getAttribute('data-vapid') : '',
        note: document.getElementById('clienthrsPushNote').textContent,
        subs: window.__vapidSubs||[],
        upserts: (window.__vapidState&&window.__vapidState.upserts)||[],
        remi: document.getElementById('clienthrsRemi').checked,
        office: document.getElementById('clienthrsOffice').checked,
        remiPage: !!document.getElementById('remiScreen')
      };
    });
    assert.strictEqual(on.marker, 'v=vapid1');
    assert.strictEqual(on.note, 'Lock-screen alerts are on. A tap opens Messages.');
    assert.strictEqual(on.subs.length, 1, 'phone Allow subscribes when configured');
    assert.strictEqual(on.subs[0].userVisibleOnly, true);
    assert.deepStrictEqual(on.subs[0].key, expectedPub, 'phone subscribe applicationServerKey');
    assert.strictEqual(on.upserts.length, 1, 'phone Allow upserts the subscription');
    assert.strictEqual(on.upserts[0].p_endpoint, 'https://push.example/sara');
    assert.strictEqual(on.remi, true);
    assert.strictEqual(on.office, true);
    assert.strictEqual(on.remiPage, false);
    await page.screenshot({path:path.join(shotDir, 'vapid1-allow-configured-phone.png')});

    await page.evaluate(function(){
      window.__vapidState.configured = false;
      document.getElementById('clienthrsRemi').click();
    });
    await page.waitForFunction(function(){
      return /turn on later/.test((document.getElementById('clienthrsPushNote')||{}).textContent||'');
    }, {timeout:8000});
    const flipped = await page.evaluate(function(){
      return {
        note: document.getElementById('clienthrsPushNote').textContent,
        subs: (window.__vapidSubs||[]).length,
        office: document.getElementById('clienthrsOffice').checked,
        remi: document.getElementById('clienthrsRemi').checked
      };
    });
    assert.ok(/turn on later/.test(flipped.note), 'later note when configured flips false');
    assert.strictEqual(flipped.subs, 1, 'flip to false does not subscribe again');
    assert.strictEqual(flipped.office, true, 'office choice stays saved');
    assert.strictEqual(flipped.remi, false);
    await page.screenshot({path:path.join(shotDir, 'vapid1-soft-disable-phone.png')});
  }finally{
    await browser.close();
    server.close();
  }
  console.log('caregiver-vapid1 browser checks ok');
}
