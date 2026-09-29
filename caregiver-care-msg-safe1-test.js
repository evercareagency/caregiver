#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-09-29-pwa-install-copy1">', 'newer tip meta is first');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-care-msg-send1">') > 0, 'care-msg-send1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-aide-notif-done-hide1">') > 0, 'aide-notif-done-hide1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pages-cache-fresh1">') > 0, 'pages-cache-fresh1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-aide-home-addr1-autofill1">') > 0, 'aide-home-addr1-autofill1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-aide-home-addr1">') > 0, 'aide-home-addr1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-care-msg-safe1">') > 0, 'care-msg-safe1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-punch-leftovers1">') > 0, 'punch-leftovers1 meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-28-care-msg-safe1 v=care-msg-safe1 —'), 'care-msg-safe1 comment');
assert.ok(html.includes('v=care-msg-safe1'), 'care-msg-safe1 probe');
assert.ok(html.includes('data-msg-safe="v=care-msg-safe1"'), 'messages screen marker');
const tip = html.slice(html.indexOf('<!-- caregiver-build: 2026-09-28-care-msg-safe1'), html.indexOf('<!-- caregiver-build: 2026-09-28-punch-leftovers1'));
assert.ok(tip.includes('MERGE HOLD') && tip.includes('Do not claim LIVE'), 'merge hold');
assert.ok(!/CONTRACT-v1 is LIVE/.test(tip), 'this tip does not claim live');
assert.ok(html.includes('v=punch-leftovers1') && html.includes('v=care-msg-tab1') && html.includes('v=aidechat1') && html.includes('v=offline1'), 'prior markers stay');

assert.ok(html.includes('#messagesScreen .hdr{flex:0 0 auto;padding-top:max(13px, calc(13px + env(safe-area-inset-top, 0px)));}'), 'header pads below the status bar');
assert.ok(html.includes('#messagesScreen .hdr .hdr-back,#messagesScreen #aideChatRefresh{min-width:44px;min-height:44px;}'), 'back and refresh hit targets are at least 44px');
assert.ok(html.includes('.aidechat-refresh{margin-left:auto;min-height:44px;min-width:44px;'), 'refresh control is at least 44px');

const msgRule = html.slice(html.indexOf('#messagesScreen.active{'), html.indexOf('#messagesScreen .hdr'));
assert.ok(msgRule.includes('top:0'), 'messages screen may stay at the top of the viewport');
assert.ok(msgRule.includes('bottom:var(--eca-dock-h)'), 'messages screen ends at the top of the dock');
assert.ok(!msgRule.includes('inset:0'), 'messages screen does not cover the dock');
assert.ok(html.includes('body.aidechat-kb #messagesScreen.active{bottom:0;}'), 'keyboard path fills the visual bottom');
assert.ok(html.includes('body.aidechat-kb #bottomNav{display:none !important;}'), 'dock hides only for the open composer keyboard');
assert.ok(html.includes('body.aidechat-kb #messagesScreen .aidechat-body{padding-bottom:0;}'), 'keyboard path does not pad a gap under the composer');
assert.ok(html.includes('.aidechat-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;width:100%;max-width:600px;margin:0 auto;padding:0 12px 0;}'), 'thread column has no padding under the composer');
assert.ok(html.includes('.aidechat-compose{flex:0 0 auto;margin-top:auto;background:var(--off);border-top:1px solid var(--border);padding:8px 0 0;}'), 'composer is flush on the bottom of the screen');
assert.ok(html.includes('.aidechat-note:empty{display:none;margin:0;}'), 'an empty status line does not reserve a gap');
assert.ok(html.includes('The dock hides only while the phone keyboard is open'), 'punch-leftovers dock exception stays written');

const start = html.indexOf('// v=aidechat1 GHOST-AIDECHAT1-CONTRACT-v1');
const end = html.indexOf('function showCaregiverHome()', start);
assert.ok(start > 0 && end > start, 'aide chat script block');
const src = html.slice(start, end);
assert.ok(src.includes('function aideChatHasThreadRows()'), 'painted-row check');
assert.ok(src.includes("console.error('aideChatRefresh'"), 'refresh catch logs the error');
assert.ok(src.includes('if(aideChatBusy)return;'), 'refresh bails when a list is already in flight');
assert.ok(src.includes('aideChatNoteLoadFail(\'The office thread did not load. Try Refresh.\')'), 'unpainted failure still says try refresh');
assert.ok(!src.includes("aideChatSetNote('The office thread did not load. Try Refresh.')"), 'the fatal banner is not set unconditionally');

function boot(opts){
  opts = opts || {};
  const mem = {};
  const calls = [];
  const note = {textContent:''};
  const thread = opts.thread || {innerHTML:'', scrollTop:0, scrollHeight:0, appendChild:function(){}, querySelector:function(){return null;}};
  const input = {value:'', focus:function(){}, addEventListener:function(){}};
  const logs = [];
  const ctx = {
    currentUser: {username:'ada', name:'Ada Cole', sbAccessToken:'jwt'},
    aideChatBusy:false,
    aideChatMode:'stub',
    aideChatPollTimer:0,
    store:{
      get:function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
      set:function(k,v){mem[k]=v;}
    },
    evercareSbEnabled:function(){return opts.sb !== false;},
    sbDataEnabled:function(){return opts.sb !== false;},
    sbRest: async function(q, req){
      calls.push({q:q, body:req && req.body});
      if(typeof opts.sbRest === 'function')return opts.sbRest(q, req);
      return {success:true, data:[]};
    },
    document:{
      getElementById:function(id){
        if(id==='aideChatNote')return note;
        if(id==='aideChatThread')return thread;
        if(id==='aideChatInput')return input;
        if(id==='aideChatSend')return {disabled:false, textContent:'Send'};
        if(id==='messagesScreen')return {classList:{contains:function(){return true;}}};
        if(id==='aideChatAideName')return {textContent:''};
        return null;
      },
      createElement:function(){
        return {className:'', textContent:'', innerHTML:'', id:'', dateTime:'', type:'', onclick:null, setAttribute:function(){}, appendChild:function(){}};
      },
      body:{classList:{contains:function(){return false;}, add:function(){}, remove:function(){}}},
      activeElement:null
    },
    console:{
      error:function(){logs.push(Array.prototype.slice.call(arguments));}
    },
    window:{innerWidth:390, innerHeight:844, visualViewport:null},
    loginKbIsPhone:function(){return true;},
    showScreen:function(){},
    requireAideSetup:function(){return true;},
    setInterval:function(){return 1;},
    clearInterval:function(){},
    setTimeout:function(fn){return 1;},
    Date:Date,
    Intl:Intl,
    JSON:JSON,
    Object:Object,
    String:String,
    Number:Number,
    Array:Array,
    Math:Math,
    isFinite:isFinite
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  ctx.calls = calls;
  ctx.note = note;
  ctx.thread = thread;
  ctx.logs = logs;
  return ctx;
}

const officeRow = {id:'o1', body:'Hi — can you cover Ada tomorrow AM?', sender:'office', created_at:'2026-09-28T13:12:00Z'};
const aideRow = {id:'a1', body:'Yes I can cover Ada AM.', sender:'aide', created_at:'2026-09-28T13:14:00Z'};

function liveRest(phase){
  return async function(q){
    if(phase.fail){
      const err = new Error('Failed to fetch');
      err.pack = {status:0, data:{message:'offline'}};
      throw err;
    }
    if(phase.bad)return {success:false, error:'The office thread did not load.'};
    if(q==='rpc/aide_mark_office_messages_read')return {success:true};
    if(q==='rpc/aide_list_office_messages')return {success:true, data:[officeRow, aideRow]};
    return {success:true, data:{id:'t1'}};
  };
}

(async function(){
  const painted = boot({sbRest:liveRest({})});
  await vm.runInContext('aideChatRefresh()', painted);
  assert.ok(vm.runInContext('aideChatRows.length', painted) >= 2, 'refresh paints the office thread');
  assert.ok(/Marked read/.test(painted.note.textContent), 'a good load still marks read');
  const keptNote = painted.note.textContent;
  painted.thread.innerHTML = 'painted-bubbles';
  painted.sbRest = async function(q, req){
    painted.calls.push({q:q, body:req && req.body});
    const err = new Error('Failed to fetch');
    err.pack = {status:503, data:{message:'unavailable'}};
    throw err;
  };
  // The script closed over its own sbRest lookup. It calls the global sbRest, which is the context property.
  await vm.runInContext('aideChatRefresh()', painted);
  assert.strictEqual(painted.note.textContent, keptNote, 'a painted thread does not gain the fatal refresh banner');
  assert.ok(!/The office thread did not load\. Try Refresh\./.test(painted.note.textContent));
  assert.strictEqual(painted.thread.innerHTML, 'painted-bubbles', 'a failed refresh does not wipe painted bubbles');
  assert.ok(vm.runInContext('aideChatRows.length', painted) >= 2, 'painted rows stay');
  assert.strictEqual(vm.runInContext('aideChatBusy', painted), false, 'busy clears after refresh');
  assert.ok(painted.logs.length >= 1, 'the catch logs');
  assert.strictEqual(painted.logs[0][0], 'aideChatRefresh');
  assert.ok(String(painted.logs[0][1]).indexOf('Failed to fetch') >= 0, 'log includes err.message');
  assert.strictEqual(painted.logs[0][2], 503, 'log includes pack status');
  assert.strictEqual(painted.logs[0][3].message, 'unavailable', 'log includes pack data');

  const domOnly = boot({
    thread:{
      innerHTML:'<article class="aidechat-row"></article>',
      scrollTop:0,
      scrollHeight:40,
      appendChild:function(){},
      querySelector:function(sel){return sel==='.aidechat-row' ? {className:'aidechat-row'} : null;}
    },
    sbRest: async function(){
      const err = new Error('HTTP 500');
      err.pack = {status:500, data:{message:'HTTP 500'}};
      throw err;
    }
  });
  await vm.runInContext('aideChatRefresh()', domOnly);
  assert.strictEqual(domOnly.note.textContent, '', 'dom bubbles suppress the fatal banner');
  assert.ok(domOnly.thread.innerHTML.indexOf('aidechat-row') >= 0, 'dom bubbles stay');
  assert.ok(domOnly.logs.length >= 1, 'dom-row failure still logs');

  const fresh = boot({
    sbRest: async function(){
      const err = new Error('HTTP 500');
      err.pack = {status:500, data:{message:'HTTP 500'}};
      throw err;
    }
  });
  await vm.runInContext('aideChatRefresh()', fresh);
  assert.strictEqual(fresh.note.textContent, 'The office thread did not load. Try Refresh.', 'a first load with nothing painted still says try refresh');
  assert.ok(fresh.logs.length >= 1, 'first-load failure logs');

  const badParse = boot({sbRest:liveRest({})});
  await vm.runInContext('aideChatRefresh()', badParse);
  const goodNote = badParse.note.textContent;
  badParse.sbRest = async function(){
    return {success:false, error:'The office thread did not load.'};
  };
  await vm.runInContext('aideChatRefresh()', badParse);
  assert.strictEqual(badParse.note.textContent, goodNote, 'a false envelope does not cover painted bubbles');
  assert.strictEqual(badParse.logs.length, 0, 'a parsed failure is not a throw');

  let listed = 0;
  let release;
  const hold = new Promise(function(r){release = r;});
  const overlap = boot({
    sbRest: async function(q){
      if(q==='rpc/aide_list_office_messages'){
        listed += 1;
        await hold;
        return {success:true, data:[officeRow]};
      }
      if(q==='rpc/aide_mark_office_messages_read')return {success:true};
      return {success:true, data:{id:'t1'}};
    }
  });
  const first = vm.runInContext('aideChatRefresh()', overlap);
  const started = Date.now();
  while(listed < 1 && Date.now() - started < 1000){
    await new Promise(function(r){setTimeout(r, 10);});
  }
  assert.strictEqual(listed, 1, 'the first refresh listed once');
  assert.strictEqual(vm.runInContext('aideChatBusy', overlap), true, 'refresh holds the busy gate');
  const second = vm.runInContext('aideChatRefresh()', overlap);
  await second;
  assert.strictEqual(listed, 1, 'a second refresh does not list while the first is in flight');
  release();
  await first;
  assert.strictEqual(listed, 1, 'the in-flight refresh does not list again');
  assert.strictEqual(vm.runInContext('aideChatBusy', overlap), false, 'busy clears when the list finishes');
  const third = vm.runInContext('aideChatRefresh()', overlap);
  const started2 = Date.now();
  while(listed < 2 && Date.now() - started2 < 1000){
    await new Promise(function(r){setTimeout(r, 10);});
  }
  assert.strictEqual(listed, 2, 'a later refresh can list once the gate is clear');
  release();
  await third;

  console.log('caregiver-care-msg-safe1 static checks ok');
  await runBrowser();
})().catch(function(err){
  console.error(err);
  process.exit(1);
});

function loadPuppeteer(){
  try{return require('puppeteer-core');}
  catch(e){
    try{return require('/tmp/msgsafe/node_modules/puppeteer-core');}
    catch(e2){return null;}
  }
}

async function runBrowser(){
  if(process.env.SKIP_BROWSER==='1')return;
  const puppeteer = loadPuppeteer();
  if(!puppeteer){
    console.log('caregiver-care-msg-safe1 browser skipped (no puppeteer-core)');
    return;
  }
  const http = require('http');
  const shotDir = process.env.AIDECHAT_SHOTS || '/opt/cursor/artifacts';
  fs.mkdirSync(shotDir, {recursive:true});
  const root = __dirname;
  const server = http.createServer(function(req, res){
    const url = (req.url||'/').split('?')[0];
    const file = path.join(root, url==='/'?'index.html':url.replace(/^\//,''));
    if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
    fs.readFile(file, function(err, buf){
      if(err){res.writeHead(404);res.end('missing');return;}
      const ext = path.extname(file);
      const type = ext==='.svg'?'image/svg+xml':ext==='.js'?'text/javascript':'text/html';
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
    await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    page.on('dialog', function(d){d.accept();});
    const cors = {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Headers':'*',
      'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',
      'Content-Type':'application/json'
    };
    const thread = [
      {id:'o1', body:'Hi — can you cover Ada tomorrow AM?', sender_role:'office', body_role:'office', from_role:'office', sender:'office', created_at:'2026-09-28T13:12:00Z'},
      {id:'a1', body:'Yes I can cover Ada AM.', sender:'aide', created_at:'2026-09-28T13:14:00Z'},
      {id:'r1', body:'Got it — Ada AM is covered. Thanks!', sender:'remi', created_at:'2026-09-28T13:15:00Z'}
    ];
    let listFails = false;
    let listHits = 0;
    await page.setRequestInterception(true);
    page.on('request', function(req){
      const url = req.url();
      if(!/supabase\.co/.test(url)){req.continue().catch(function(){});return;}
      if(req.method()==='OPTIONS'){
        req.respond({status:204, headers:cors, body:''}).catch(function(){});
        return;
      }
      if(/aide_get_or_create_office_thread/.test(url)){
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true, data:{id:'t1'}})}).catch(function(){});
        return;
      }
      if(/aide_list_office_messages/.test(url)){
        listHits += 1;
        if(listFails){
          req.respond({status:503, headers:cors, body:JSON.stringify({message:'unavailable'})}).catch(function(){});
          return;
        }
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true, data:thread.slice()})}).catch(function(){});
        return;
      }
      if(/aide_mark_office_messages_read/.test(url)){
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true})}).catch(function(){});
        return;
      }
      req.respond({status:200, headers:cors, body:'[]'}).catch(function(){});
    });
    await page.goto('http://127.0.0.1:'+port+'/index.html', {waitUntil:'domcontentloaded', timeout:20000});
    await page.evaluate(function(){
      localStorage.setItem('cg_session', JSON.stringify({
        username:'portal.aide',
        name:'Portal Aide',
        loginAt:Date.now()-60*60*1000,
        mustChangePassword:false,
        needsEmail:false,
        sbAccessToken:'test-jwt'
      }));
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_portal.aide','1');
    });
    await page.reload({waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForFunction(function(){
      const screen = document.getElementById('caregiverScreen');
      const nav = document.getElementById('bottomNav');
      const btn = document.querySelector('#bottomNav button[data-nav="messages"]');
      if(!screen || !nav || !btn)return false;
      const box = btn.getBoundingClientRect();
      return screen.classList.contains('active') && nav.hidden === false && box.height >= 44 && box.width >= 40;
    }, {timeout:8000});
    await page.click('#bottomNav button[data-nav="messages"]');
    await page.waitForSelector('#aideChatThread [data-sender="remi"]', {timeout:8000});
    await page.waitForFunction(function(){
      return /Marked read/.test(document.getElementById('aideChatNote').textContent);
    }, {timeout:8000});

    const geo = await page.evaluate(function(){
      function r(el){return el.getBoundingClientRect();}
      const screen = document.getElementById('messagesScreen');
      const hdr = screen.querySelector('.hdr');
      const back = screen.querySelector('.hdr-back');
      const refresh = document.getElementById('aideChatRefresh');
      const compose = document.getElementById('aideChatCompose');
      const send = document.getElementById('aideChatSend');
      const nav = document.getElementById('bottomNav');
      const threadEl = document.getElementById('aideChatThread');
      const note = document.getElementById('aideChatNote');
      return {
        padTop:getComputedStyle(hdr).paddingTop,
        backH:Math.round(r(back).height),
        backW:Math.round(r(back).width),
        refreshH:Math.round(r(refresh).height),
        refreshW:Math.round(r(refresh).width),
        gapCompose:Math.round(r(nav).top - r(compose).bottom),
        gapSend:Math.round(r(nav).top - r(send).bottom),
        screenBottom:Math.round(r(screen).bottom),
        navTop:Math.round(r(nav).top),
        navDisplay:getComputedStyle(nav).display,
        threadTop:Math.round(r(threadEl).top),
        composeTop:Math.round(r(compose).top),
        sendTop:Math.round(r(send).top),
        noteTop:note ? Math.round(r(note).top) : -1,
        bubbles:document.querySelectorAll('#aideChatThread .aidechat-row').length
      };
    });
    assert.strictEqual(geo.padTop, '13px', 'with no inset the header keeps the 13px pad');
    assert.ok(geo.backH >= 44 && geo.backW >= 44, 'back hit target');
    assert.ok(geo.refreshH >= 44 && geo.refreshW >= 44, 'refresh hit target');
    assert.ok(Math.abs(geo.gapCompose) <= 1, 'composer is flush above the dock, gap '+geo.gapCompose);
    assert.ok(geo.gapSend <= 2, 'send row is flush above the dock, gap '+geo.gapSend);
    assert.ok(Math.abs(geo.screenBottom - geo.navTop) <= 2, 'screen ends at the dock');
    assert.notStrictEqual(geo.navDisplay, 'none', 'dock stays visible');
    assert.ok(geo.threadTop < geo.composeTop, 'thread sits above the composer');
    assert.ok(geo.noteTop < geo.sendTop, 'status line does not sit under the send row');
    assert.strictEqual(geo.bubbles, 3, 'three bubbles painted');

    await page.screenshot({path:path.join(shotDir, 'care-msg-safe1-phone-messages.png')});
    const headerBox = await page.$eval('#messagesScreen .hdr', function(el){
      const r = el.getBoundingClientRect();
      return {x:r.x, y:0, width:r.width, height:Math.max(r.bottom, 120)};
    });
    await page.screenshot({
      path:path.join(shotDir, 'care-msg-safe1-header.png'),
      clip:{x:headerBox.x, y:headerBox.y, width:headerBox.width, height:headerBox.height}
    });
    const dockBox = await page.evaluate(function(){
      const compose = document.getElementById('aideChatCompose');
      const nav = document.getElementById('bottomNav');
      const top = Math.max(0, compose.getBoundingClientRect().top - 28);
      const bottom = nav.getBoundingClientRect().bottom;
      return {x:0, y:top, width:390, height:bottom - top};
    });
    await page.screenshot({
      path:path.join(shotDir, 'care-msg-safe1-composer-dock.png'),
      clip:dockBox
    });

    let safeApplied = false;
    try{
      const client = await page.target().createCDPSession();
      const attempts = [
        ['Emulation.setSafeAreaInsetsOverride', {insets:{top:59, left:0, bottom:34, right:0}}],
        ['Emulation.setSafeAreaInsetsOverride', {top:59, left:0, bottom:34, right:0}]
      ];
      for(let i=0;i<attempts.length;i++){
        try{
          await client.send(attempts[i][0], attempts[i][1]);
          safeApplied = true;
          break;
        }catch(e){}
      }
    }catch(e){}
    if(safeApplied){
      await page.evaluate(function(){document.body.offsetHeight;});
      const inset = await page.evaluate(function(){
        const hdr = document.querySelector('#messagesScreen .hdr');
        const back = document.querySelector('#messagesScreen .hdr-back');
        return {
          pad:getComputedStyle(hdr).paddingTop,
          backTop:Math.round(back.getBoundingClientRect().top)
        };
      });
      assert.ok(parseFloat(inset.pad) >= 59, 'safe-area inset increases header padding ('+inset.pad+')');
      assert.ok(inset.backTop >= 59, 'back sits below the status inset');
      await page.screenshot({path:path.join(shotDir, 'care-msg-safe1-header-safe-area.png')});
    }

    await page.click('#aideChatInput');
    await page.waitForFunction(function(){
      return document.body.classList.contains('aidechat-kb');
    }, {timeout:2000});
    const kb = await page.evaluate(function(){
      const nav = document.getElementById('bottomNav');
      const compose = document.getElementById('aideChatCompose');
      const threadEl = document.getElementById('aideChatThread');
      const screen = document.getElementById('messagesScreen');
      const nr = nav.getBoundingClientRect();
      const cr = compose.getBoundingClientRect();
      const tr = threadEl.getBoundingClientRect();
      const sr = screen.getBoundingClientRect();
      return {
        navDisplay:getComputedStyle(nav).display,
        composeBottom:Math.round(cr.bottom),
        composeTop:Math.round(cr.top),
        threadTop:Math.round(tr.top),
        threadH:Math.round(tr.height),
        screenBottom:Math.round(sr.bottom),
        innerH:window.innerHeight,
        bubbles:document.querySelectorAll('#aideChatThread .aidechat-row').length
      };
    });
    assert.strictEqual(kb.navDisplay, 'none', 'keyboard hides the dock');
    assert.ok(kb.composeBottom <= kb.innerH + 1, 'composer stays inside the visual viewport');
    assert.ok(kb.composeTop < kb.innerH, 'composer is on screen');
    assert.ok(kb.threadH > 40 && kb.threadTop < kb.composeTop, 'thread stays visible above the composer');
    assert.strictEqual(kb.bubbles, 3, 'keyboard does not clear bubbles');
    assert.ok(Math.abs(kb.screenBottom - kb.innerH) <= 2, 'keyboard screen fills the visual bottom');
    await page.screenshot({path:path.join(shotDir, 'care-msg-safe1-keyboard.png')});

    await page.$eval('#aideChatInput', function(el){el.blur();});
    await page.waitForFunction(function(){
      return !document.body.classList.contains('aidechat-kb') && getComputedStyle(document.getElementById('bottomNav')).display !== 'none';
    }, {timeout:2000});

    const hitsBefore = listHits;
    listFails = true;
    const logs = [];
    page.on('console', function(msg){
      if(msg.type()==='error')logs.push(msg.text());
    });
    await page.click('#aideChatRefresh');
    const failStart = Date.now();
    while(listHits <= hitsBefore && Date.now() - failStart < 4000){
      await new Promise(function(r){setTimeout(r, 40);});
    }
    assert.ok(listHits > hitsBefore, 'refresh did call the list');
    const logStart = Date.now();
    while(!logs.some(function(line){return /aideChatRefresh/.test(line);}) && Date.now() - logStart < 2000){
      await new Promise(function(r){setTimeout(r, 40);});
    }
    const afterFail = await page.evaluate(function(){
      return {
        bubbles:document.querySelectorAll('#aideChatThread .aidechat-row').length,
        note:document.getElementById('aideChatNote').textContent,
        labels:Array.prototype.map.call(document.querySelectorAll('.aidechat-label'), function(el){return el.textContent;})
      };
    });
    assert.strictEqual(afterFail.bubbles, 3, 'refresh failure keeps the bubbles');
    assert.deepStrictEqual(afterFail.labels, ['Office','You','Remi']);
    assert.ok(!/The office thread did not load\. Try Refresh\./.test(afterFail.note), 'no fatal banner over a painted thread');
    assert.ok(logs.some(function(line){return /aideChatRefresh/.test(line);}), 'browser catch logs aideChatRefresh');

    console.log('caregiver-care-msg-safe1 browser ok'+(safeApplied?' (safe-area inset applied)':' (safe-area inset API unavailable)'));
  }finally{
    await browser.close();
    server.close();
  }
}
