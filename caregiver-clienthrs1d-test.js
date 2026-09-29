#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function eq(actual, expected, msg){
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), msg||'');
}
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, 'caregiver-push-sw.js'), 'utf8');

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-09-29-care-msg-send1">', 'newer tip meta is first');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-aide-notif-done-hide1">') > 0, 'aide-notif-done-hide1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pages-cache-fresh1">') > 0, 'pages-cache-fresh1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-aide-home-addr1-autofill1">') > 0, 'aide-home-addr1-autofill1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-aide-home-addr1">') > 0, 'aide-home-addr1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-care-msg-safe1">') > 0, 'care-msg-safe1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-punch-leftovers1">') > 0, 'punch-leftovers1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-27-care-msg-tab1">') > 0, 'care-msg-tab1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-27-vapid1">') > 0, 'vapid1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-27-clienthrs1d">') > 0, 'clienthrs1d meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-27-clienthrs1d v=clienthrs1d —'), 'clienthrs1d comment');
assert.ok(html.includes('v=clienthrs1d'), 'clienthrs1d probe');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-25-aidechat1">') > 0, 'aidechat1 meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-aidechat1 v=aidechat1 —'), 'aidechat1 comment stays');
assert.ok(html.includes('v=cgsigfit1') && html.includes('v=cgacct1') && html.includes('v=offline1'), 'prior markers stay');
assert.ok(html.includes('GHOST-CLIENTHRS1D-CONTRACT-v1'), 'ace contract');
assert.ok(html.includes('rpc/aide_get_notification_prefs'), 'get prefs rpc');
assert.ok(html.includes('rpc/aide_save_notification_prefs'), 'save prefs rpc');
assert.ok(html.includes('rpc/get_vapid_public_key'), 'vapid rpc');
assert.ok(html.includes('rpc/aide_upsert_web_push_subscription'), 'upsert subscription rpc');
assert.ok(html.includes('rpc/aide_revoke_web_push_subscription'), 'revoke subscription rpc');
assert.ok(html.includes('data-clienthrs="v=clienthrs1d"'), 'card marker');
assert.ok(html.includes('data-aidechat="v=aidechat1"'), 'messages marker stays');
assert.ok(!html.includes('id="remiScreen"'), 'remi is never a full page');
assert.ok(!/quo/i.test(sw) && !/sms:/i.test(sw), 'push worker does not send sms');
assert.ok(sw.includes('#messages'), 'push tap opens the messages hash');
assert.ok(sw.includes('clienthrs-open-messages'), 'push tap tells the open page');
assert.ok(!/remi\.html|\/remi(?:\/|"|')/i.test(sw), 'worker does not open a remi page');

const account = html.slice(html.indexOf('id="moreScreen"'), html.indexOf('id="bottomNav"'));
assert.ok(account.includes('id="clienthrsPushCard"'), 'account opt-in card');
assert.ok(account.includes('id="clienthrsRemi"'), 'remi reminders switch');
assert.ok(account.includes('id="clienthrsOffice"'), 'office chat push switch');
assert.ok(account.includes('>Notifications</h3>'), 'settings title');
assert.ok(account.includes('Remi reminders'), 'remi label');
assert.ok(account.includes('>Office chat</span>'), 'office chat label');
assert.ok(account.includes('Phone pings on'), 'plain pings status');
assert.ok(!account.includes('Turn on Remi reminders'), 'gate title is gone');
assert.ok(!account.includes('Allow notifications'), 'allow button is gone');
assert.ok(!account.includes('>Not now<'), 'not now is gone');
assert.ok(!account.includes('What you’ll get'), 'what you get gate is gone');
assert.ok(!account.includes('id="clienthrsAllow"'), 'no allow control');
assert.ok(!account.includes('id="clienthrsNotNow"'), 'no not now control');
assert.ok(account.includes('> Account</div>'), 'account card stays');
assert.ok(account.includes('>Log out</button>'), 'log out stays');
assert.ok(!account.includes('>Call off</button>'), 'account still has no call off');
assert.ok(!account.includes('id="aideChatHomeBtn"'), 'account does not add the messages button');

const chatStart = html.indexOf('// v=aidechat1 GHOST-AIDECHAT1-CONTRACT-v1');
const chatEnd = html.indexOf('function showCaregiverHome()', chatStart);
const chatSrc = html.slice(chatStart, chatEnd);
const hrsStart = html.indexOf('// v=clienthrs1d GHOST-CLIENTHRS1D-CONTRACT-v1');
const hrsEnd = html.indexOf('// end v=clienthrs1d', hrsStart);
assert.ok(chatStart > 0 && chatEnd > chatStart, 'aide chat slice');
assert.ok(hrsStart > chatEnd && hrsEnd > hrsStart, 'clienthrs slice follows messages');

function bootChat(){
  const ctx = {
    currentUser:{username:'sara', name:'Sara'},
    aideChatDisplayNames:{remi:'', scheduler:'', admin:''},
    aideChatRows:[],
    aideChatBefore:'',
    aideChatHasEarlier:false,
    JSON:JSON, Object:Object, String:String, Array:Array, Date:Date, Math:Math, isFinite:isFinite
  };
  vm.createContext(ctx);
  vm.runInContext(chatSrc, ctx);
  return ctx;
}

const named = bootChat();
named.shape = {
  success:true,
  viewer:'aide',
  display_names:{remi:'Remi AI', scheduler:'Jazmine (Scheduler)', admin:'Moe (Manager)'},
  data:[
    {id:'r1', body:'Hi Sara — reminder to submit your timesheet today when you can.', sender_role:'remi', created_at:'2026-09-27T13:00:00Z'},
    {id:'s1', body:'Can you cover Ada tomorrow morning 8–1?', sender_role:'scheduler', created_at:'2026-09-27T13:01:00Z'},
    {id:'a1', body:'Yes I can.', sender_role:'aide', display_name:'Sara', created_at:'2026-09-27T13:02:00Z'},
    {id:'m1', body:'Thanks Sara — office phone if anything changes: (216) 377-5991.', from_role:'admin', created_at:'2026-09-27T13:03:00Z'}
  ]
};
const namedRows = vm.runInContext('aideChatRowsFromRpc(shape)', named);
assert.strictEqual(namedRows.ok, true);
eq(namedRows.rows.map(function(r){return r.label;}), ['Remi AI','Jazmine (Scheduler)','You','Moe (Manager)']);
assert.strictEqual(namedRows.rows[2].sender, 'aide');
assert.notStrictEqual(namedRows.rows[2].label, 'Sara');

const direct = bootChat();
direct.shape = {success:true, data:[
  {id:'r1', body:'Hi Sara — reminder to submit your timesheet today when you can.', sender:'remi', display_name:'Remi AI', created_at:'2026-09-27T13:00:00Z'},
  {id:'s1', body:'Can you cover Ada tomorrow morning 8–1?', sender:'scheduler', display_name:'Jazmine (Scheduler)', created_at:'2026-09-27T13:01:00Z'},
  {id:'a1', body:'Yes I can.', sender:'aide', display_name:'Sara', created_at:'2026-09-27T13:02:00Z'},
  {id:'m1', body:'Thanks Sara — office phone if anything changes: (216) 377-5991.', sender:'admin', display_name:'Moe (Manager)', created_at:'2026-09-27T13:03:00Z'}
]};
const directRows = vm.runInContext('aideChatRowsFromRpc(shape)', direct);
eq(directRows.rows.map(function(r){return r.sender;}), ['remi','office','aide','office']);
eq(directRows.rows.map(function(r){return r.label;}), ['Remi AI','Jazmine (Scheduler)','You','Moe (Manager)']);
assert.strictEqual(vm.runInContext('aideChatLabel("remi")', direct), 'Remi', 'unnamed fallback stays Remi');
assert.strictEqual(vm.runInContext('aideChatLabel("aide")', direct), 'You');

function el(id){
  return {
    id:id,
    textContent:'',
    checked:false,
    disabled:false,
    classList:{
      contains:function(){return false;},
      remove:function(){},
      add:function(){}
    }
  };
}

function bootHrs(opts){
  opts = opts || {};
  const mem = {};
  const ss = {};
  const calls = [];
  const pushes = {register:0, subscribe:0};
  const note = el('clienthrsPushNote');
  const remi = el('clienthrsRemi');
  const office = el('clienthrsOffice');
  const loc = el('clienthrsLoc');
  const allow = el('clienthrsAllow');
  const skip = el('clienthrsNotNow');
  const opened = {n:0};
  const ctx = {
    currentUser: opts.user === null ? null : {username:'sara', name:'Sara'},
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
      if(opts.missing && /notification_prefs|vapid|web_push/.test(q)){
        const err = new Error('Could not find the function');
        err.missing = true;
        throw err;
      }
      if(typeof opts.sbRest === 'function')return opts.sbRest(q, req);
      if(q==='rpc/get_vapid_public_key')return {success:true, configured:false, vapidPublicKey:null, note:'later'};
      if(q==='rpc/aide_get_notification_prefs')return {success:true, remi_reminders:false, office_chat_push:false, timesheet_location_permission:'never_asked', has_active_subscription:false};
      if(q==='rpc/aide_save_notification_prefs')return {success:true};
      if(q==='rpc/aide_revoke_web_push_subscription')return {success:true, revoked:1, has_active_subscription:false};
      return {success:true};
    },
    document:{
      getElementById:function(id){
        if(id==='clienthrsPushNote')return note;
        if(id==='clienthrsRemi')return remi;
        if(id==='clienthrsOffice')return office;
        if(id==='clienthrsLoc')return loc;
        if(id==='clienthrsAllow')return allow;
        if(id==='clienthrsNotNow')return skip;
        return null;
      }
    },
    navigator:{
      userAgent:'test-agent',
      permissions:{query: async function(){return {state: opts.geo || 'prompt'};}},
      serviceWorker:{
        register: async function(){
          pushes.register += 1;
          return {pushManager:{subscribe: async function(){
            pushes.subscribe += 1;
            return {endpoint:'https://push.example/sara', toJSON:function(){return {endpoint:'https://push.example/sara', keys:{p256dh:'cDEy', auth:'YXV0aA'}};}};
          }}};
        },
        getRegistration: async function(){return null;},
        addEventListener:function(){}
      }
    },
    window:{PushManager:function(){}},
    Notification:{permission:'granted', requestPermission: async function(){return 'granted';}},
    location:{hash: opts.hash || '', search: opts.search || '', pathname:'/caregiver/index.html'},
    history:{replaceState:function(){ctx.location.hash='';}},
    sessionStorage:{
      getItem:function(k){return Object.prototype.hasOwnProperty.call(ss, k) ? ss[k] : null;},
      setItem:function(k,v){ss[k]=String(v);},
      removeItem:function(k){delete ss[k];}
    },
    aideSetupRequired:function(){return !!opts.setup;},
    openAideMessages:function(){opened.n += 1;},
    closeModal:function(){},
    atob:atob,
    Uint8Array:Uint8Array,
    JSON:JSON, Object:Object, String:String, Array:Array, Promise:Promise
  };
  vm.createContext(ctx);
  vm.runInContext(html.slice(hrsStart, hrsEnd), ctx);
  ctx.calls = calls;
  ctx.mem = mem;
  ctx.note = note;
  ctx.remi = remi;
  ctx.office = office;
  ctx.loc = loc;
  ctx.pushes = pushes;
  ctx.opened = opened;
  ctx.ss = ss;
  return ctx;
}

(async function(){
  const soft = bootHrs();
  await vm.runInContext('clienthrsAllowNotifications()', soft);
  const save = soft.calls.filter(function(c){return c.q==='rpc/aide_save_notification_prefs';});
  const vapid = soft.calls.filter(function(c){return c.q==='rpc/get_vapid_public_key';});
  assert.strictEqual(save.length, 1, 'allow saves prefs');
  assert.strictEqual(save[0].body.p_remi_reminders, true);
  assert.strictEqual(save[0].body.p_office_chat_push, true);
  assert.strictEqual(save[0].body.p_timesheet_location_permission, 'never_asked');
  assert.strictEqual(vapid.length, 1, 'allow asks for the public vapid key');
  assert.ok(vapid[0].q && soft.calls.indexOf(save[0]) < soft.calls.indexOf(vapid[0]), 'prefs save before vapid');
  assert.strictEqual(soft.pushes.register, 0, 'unconfigured vapid does not register push');
  assert.strictEqual(soft.pushes.subscribe, 0, 'unconfigured vapid does not call PushManager.subscribe');
  assert.ok(!soft.calls.some(function(c){return c.q==='rpc/aide_upsert_web_push_subscription';}), 'no subscription upsert when vapid is off');
  assert.strictEqual(soft.note.textContent, 'Phone pings turn on later. Your choices are saved.');
  assert.strictEqual(soft.remi.checked, true);
  assert.strictEqual(soft.office.checked, true);

  const live = bootHrs({
    sbRest: async function(q, req){
      if(q==='rpc/get_vapid_public_key')return {success:true, configured:true, vapidPublicKey:'dGVzdA', note:''};
      if(q==='rpc/aide_upsert_web_push_subscription')return {success:true, has_active_subscription:true, endpoint:req.body.p_endpoint};
      return {success:true};
    }
  });
  await vm.runInContext('clienthrsAllowNotifications()', live);
  const up = live.calls.filter(function(c){return c.q==='rpc/aide_upsert_web_push_subscription';});
  assert.strictEqual(live.pushes.subscribe, 1, 'configured vapid subscribes');
  assert.ok(live.calls.findIndex(function(c){return c.q==='rpc/get_vapid_public_key';}) < live.calls.findIndex(function(c){return c.q==='rpc/aide_upsert_web_push_subscription';}), 'vapid before upsert');
  assert.strictEqual(up.length, 1);
  assert.strictEqual(up[0].body.p_endpoint, 'https://push.example/sara');
  assert.strictEqual(up[0].body.p_p256dh, 'cDEy');
  assert.strictEqual(up[0].body.p_auth, 'YXV0aA');
  assert.strictEqual(up[0].body.p_user_agent, 'test-agent');
  assert.strictEqual(live.note.textContent, 'Phone pings on');

  const off = bootHrs();
  await vm.runInContext('clienthrsNotNow()', off);
  const savedOff = off.calls.filter(function(c){return c.q==='rpc/aide_save_notification_prefs';})[0];
  const revoked = off.calls.filter(function(c){return c.q==='rpc/aide_revoke_web_push_subscription';});
  assert.strictEqual(savedOff.body.p_remi_reminders, false);
  assert.strictEqual(savedOff.body.p_office_chat_push, false);
  assert.strictEqual(revoked.length, 1, 'opt-out revokes');
  eq(revoked[0].body, {}, 'null endpoint revokes all for this aide');
  assert.strictEqual(off.remi.checked, false);
  assert.strictEqual(off.office.checked, false);

  const geo = bootHrs({geo:'granted'});
  await vm.runInContext('clienthrsAllowNotifications()', geo);
  const geoSave = geo.calls.filter(function(c){return c.q==='rpc/aide_save_notification_prefs';})[0];
  assert.strictEqual(geoSave.body.p_timesheet_location_permission, 'allowed');

  const denied = bootHrs({geo:'denied'});
  await vm.runInContext('clienthrsSavePrefs({location:"denied"})', denied);
  assert.strictEqual(denied.calls[0].body.p_timesheet_location_permission, 'denied');
  assert.ok(denied.calls[0].body.p_remi_reminders == null, 'location report does not clear reminders');

  const deep = bootHrs({hash:'#caregiver/messages'});
  assert.strictEqual(vm.runInContext('clienthrsMaybeOpenMessages()', deep), true);
  assert.strictEqual(deep.opened.n, 1, 'deep link opens messages');
  const query = bootHrs({search:'?open=messages'});
  assert.strictEqual(vm.runInContext('clienthrsMaybeOpenMessages()', query), true);
  assert.strictEqual(query.opened.n, 1);
  const later = bootHrs({user:null, hash:'#messages'});
  assert.strictEqual(vm.runInContext('clienthrsMaybeOpenMessages()', later), false);
  assert.strictEqual(later.ss.clienthrs1d_open_messages, '1', 'deep link waits for sign-in');
  const plain = bootHrs();
  assert.strictEqual(vm.runInContext('clienthrsMaybeOpenMessages()', plain), false, 'home does not jump to messages');

  console.log('caregiver-clienthrs1d static checks ok');
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
    console.log('caregiver-clienthrs1d browser skipped (no puppeteer-core)');
    return;
  }
  const http = require('http');
  const shotDir = process.env.CLIENTHRS_SHOTS || '/opt/cursor/artifacts';
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
    page.on('pageerror', function(err){console.log('PAGEERROR', err && err.message);});
    page.on('console', function(msg){
      if(msg.type()==='error')console.log('CONSOLE', msg.text());
    });
    await page.evaluateOnNewDocument(function(){
      window.__clienthrsPushSubs = 0;
      if(window.PushManager && window.PushManager.prototype && window.PushManager.prototype.subscribe){
        const orig = window.PushManager.prototype.subscribe;
        window.PushManager.prototype.subscribe = function(){
          window.__clienthrsPushSubs += 1;
          return orig.apply(this, arguments);
        };
      }
    });
    await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    await page.goto('http://127.0.0.1:'+port+'/index.html?sheets=1', {waitUntil:'domcontentloaded', timeout:20000});
    await page.evaluate(function(){
      localStorage.setItem('cg_session', JSON.stringify({
        username:'sara',
        name:'Sara',
        loginAt:Date.now()-60*60*1000,
        mustChangePassword:false,
        needsEmail:false
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
    const optinPhone = await page.evaluate(function(){
      const card = document.getElementById('clienthrsPushCard');
      return {
        title: card.querySelector('.clienthrs-title').textContent,
        allow: !!document.getElementById('clienthrsAllow'),
        skip: !!document.getElementById('clienthrsNotNow'),
        remi: document.getElementById('clienthrsRemi').checked,
        office: document.getElementById('clienthrsOffice').checked,
        screen: document.getElementById('moreScreen').classList.contains('active'),
        name: document.getElementById('more_aide_line').textContent,
        text: card.innerText
      };
    });
    assert.strictEqual(optinPhone.name, 'Sara');
    assert.strictEqual(optinPhone.title, 'Notifications');
    assert.strictEqual(optinPhone.allow, false);
    assert.strictEqual(optinPhone.skip, false);
    assert.ok(!/Turn on Remi reminders/i.test(optinPhone.text));
    assert.strictEqual(optinPhone.remi, false);
    assert.strictEqual(optinPhone.office, false);
    assert.strictEqual(optinPhone.screen, true);
    await page.screenshot({path:path.join(shotDir, 'clienthrs1d-optin-phone.png')});
    await page.setViewport({width:1280, height:800, isMobile:false, hasTouch:false, deviceScaleFactor:1});
    await page.screenshot({path:path.join(shotDir, 'clienthrs1d-optin-desktop.png')});
    await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    await page.evaluate(function(){
      const remi=document.getElementById('clienthrsRemi');
      if(remi&&remi.scrollIntoView)remi.scrollIntoView({block:'center'});
      remi.click();
    });
    await page.waitForFunction(function(){
      return /turn on later/.test(document.getElementById('clienthrsPushNote').textContent);
    }, {timeout:4000});
    const softPush = await page.evaluate(function(){
      return {
        note: document.getElementById('clienthrsPushNote').textContent,
        subs: window.__clienthrsPushSubs||0,
        remi: document.getElementById('clienthrsRemi').checked,
        office: document.getElementById('clienthrsOffice').checked
      };
    });
    assert.ok(/turn on later/.test(softPush.note), 'soft note when push is not configured');
    assert.strictEqual(softPush.subs, 0, 'browser PushManager.subscribe stays off');
    assert.strictEqual(softPush.remi, true);
    assert.strictEqual(softPush.office, false);

    await page.setRequestInterception(true);
    const cors = {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Headers':'*',
      'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',
      'Content-Type':'application/json'
    };
    const thread = {
      success:true,
      viewer:'aide',
      display_names:{remi:'Remi AI', scheduler:'Jazmine (Scheduler)', admin:'Moe (Manager)'},
      data:[
        {id:'r1', body:'Hi Sara — reminder to submit your timesheet today when you can.', sender_role:'remi', display_name:'Remi AI', created_at:'2026-09-27T13:00:00Z'},
        {id:'s1', body:'Can you cover Ada tomorrow morning 8–1?', sender_role:'scheduler', display_name:'Jazmine (Scheduler)', created_at:'2026-09-27T13:01:00Z'},
        {id:'a1', body:'Yes I can.', sender_role:'aide', display_name:'Sara', created_at:'2026-09-27T13:02:00Z'},
        {id:'m1', body:'Thanks Sara — office phone if anything changes: (216) 377-5991.', sender_role:'admin', display_name:'Moe (Manager)', created_at:'2026-09-27T13:03:00Z'}
      ]
    };
    page.on('request', function(req){
      const url = req.url();
      if(!/supabase\.co/.test(url)){req.continue().catch(function(){});return;}
      if(req.method()==='OPTIONS'){
        req.respond({status:204, headers:cors, body:''}).catch(function(){});
        return;
      }
      if(/aide_list_office_messages/.test(url)){
        req.respond({status:200, headers:cors, body:JSON.stringify(thread)}).catch(function(){});
        return;
      }
      if(/aide_get_or_create_office_thread|aide_mark_office_messages_read/.test(url)){
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true})}).catch(function(){});
        return;
      }
      req.respond({status:200, headers:cors, body:'[]'}).catch(function(){});
    });
    await page.evaluate(function(){
      const raw = JSON.parse(localStorage.getItem('cg_session'));
      raw.sbAccessToken = 'test-jwt';
      localStorage.setItem('cg_session', JSON.stringify(raw));
      localStorage.removeItem('evercare_sheets');
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_sara','1');
    });
    await page.goto('http://127.0.0.1:'+port+'/index.html#messages', {waitUntil:'domcontentloaded', timeout:20000});
    try{
      await page.waitForSelector('#aideChatThread [data-sender="aide"]', {timeout:8000});
    }catch(waitErr){
      const state = await page.evaluate(function(){
        const active = Array.prototype.map.call(document.querySelectorAll('.screen.active'), function(s){return s.id;});
        return {
          href: location.href,
          active: active,
          note: (document.getElementById('aideChatNote')||{}).textContent||'',
          thread: (document.getElementById('aideChatThread')||{}).innerText||'',
          session: localStorage.getItem('cg_session')
        };
      });
      console.log('CHAT STATE', JSON.stringify(state));
      throw waitErr;
    }
    const youView = await page.evaluate(function(){
      const labels = Array.prototype.map.call(document.querySelectorAll('.aidechat-label'), function(el){return el.textContent;});
      const phone = document.querySelector('#aideChatThread .aidechat-phone');
      return {
        labels: labels,
        messages: document.getElementById('messagesScreen').classList.contains('active'),
        remiPage: !!document.getElementById('remiScreen'),
        phone: phone ? phone.textContent : '',
        href: phone ? phone.getAttribute('href') : ''
      };
    });
    eq(youView.labels, ['Remi AI','Jazmine (Scheduler)','You','Moe (Manager)']);
    assert.strictEqual(youView.messages, true, 'deep link opens messages');
    assert.strictEqual(youView.remiPage, false, 'no remi page');
    assert.strictEqual(youView.phone, '(216) 377-5991');
    assert.strictEqual(youView.href, 'tel:+12163775991');
    await page.evaluate(function(){
      const threadEl = document.getElementById('aideChatThread');
      if(threadEl)threadEl.scrollTop = 0;
    });
    await page.screenshot({path:path.join(shotDir, 'clienthrs1d-chat-you-phone.png')});
    await page.setViewport({width:1280, height:800, isMobile:false, hasTouch:false, deviceScaleFactor:1});
    await page.screenshot({path:path.join(shotDir, 'clienthrs1d-chat-you-desktop.png')});
  }finally{
    await browser.close();
    server.close();
  }
  console.log('caregiver-clienthrs1d browser checks ok');
}
