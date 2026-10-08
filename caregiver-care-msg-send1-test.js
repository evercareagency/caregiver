#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-10-08-sec1-cg2">', 'newer tip meta is first');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-10-08-sec1-ui">') > 0, 'sec1-ui meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-msg-composer-rect1">') > 0, 'msg-composer-rect1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pwa-install-copy1">') > 0, 'pwa-install-copy1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-care-msg-send1">') > 0, 'care-msg-send1 meta stays');
assert.ok(html.includes('<meta name="caregiver-shell" content="2026-09-29-pages-cache-fresh1">'), 'shell id stays pages-cache-fresh1');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-aide-notif-done-hide1">') > 0, 'aide-notif-done-hide1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pages-cache-fresh1">') > 0, 'pages-cache-fresh1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-care-msg-safe1">') > 0, 'care-msg-safe1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-25-aidechat1">') > 0, 'aidechat1 meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-29-care-msg-send1 v=care-msg-send1 ?v=care-msg-send1 —'), 'build comment');
assert.ok(html.includes('v=care-msg-send1'), 'probe marker');
assert.ok(html.includes('?v=care-msg-send1'), 'cache bust marker');
assert.ok(html.includes('data-msg-send="v=care-msg-send1"'), 'messages screen marker');
assert.ok(html.includes('data-cache="?v=care-msg-send1"'), 'messages cache bust');
const tip = html.slice(html.indexOf('<!-- caregiver-build: 2026-09-29-care-msg-send1'), html.indexOf('<!-- caregiver-build: 2026-09-29-aide-notif-done-hide1'));
assert.ok(tip.includes('MERGE HOLD') && tip.includes('Do not claim LIVE') && tip.includes('Do not squash-merge'), 'merge hold');
assert.ok(tip.includes('Ace unchanged'), 'ace unchanged');
assert.ok(tip.includes('aideChatEnsureSent'), 'soft list keeps the send rows');
assert.ok(tip.includes('sbEnsureCaregiverJwt') && tip.includes('sbRefreshCaregiverJwt'), 'jwt ensure and one refresh');
assert.ok(tip.includes('Still loading messages'), 'busy note is in the comment');
assert.ok(!/CONTRACT-v1 is LIVE/.test(tip), 'this tip does not claim live');
assert.ok(html.includes('v=aide-notif-done-hide1') && html.includes('v=care-msg-safe1') && html.includes('v=aidechat1'), 'prior markers stay');

const start = html.indexOf('// v=aidechat1 GHOST-AIDECHAT1-CONTRACT-v1');
const end = html.indexOf('function showCaregiverHome()', start);
assert.ok(start > 0 && end > start, 'aide chat script block');
const src = html.slice(start, end);
assert.ok(src.includes('function aideChatSendBody(text, kind){'), 'send body helper stays');
assert.ok(src.includes('const body={p_body:String(text||\'\')};'), 'payload stays p_body');
assert.ok(src.includes("if(kind==='call_off'||kind==='pay_question')body.p_escalate_kind=kind;"), 'optional escalate kind stays');
assert.ok(!src.includes('if(!aideChatRpcMissing(e2))throw e2'), 'a list failure after send does not rethrow');
assert.ok(src.includes('sbEnsureCaregiverJwt'), 'deliver ensures the caregiver jwt');
assert.ok(src.includes('sbRefreshCaregiverJwt'), 'deliver refreshes once on auth failure');
assert.ok(src.includes("aideChatSetNote('Still loading messages\u2026')"), 'busy send shows the loading note');
assert.ok(src.includes("console.error('aideChatSend', err&&err.message, err&&err.pack&&err.pack.status, err&&err.pack&&err.pack.data)"), 'send catch logs the pack');
assert.ok(src.includes("aideChatSetNote('The message did not send. Try again.')"), 'second failure keeps the same note');
assert.ok(src.includes('if(aideChatBusy)return;'), 'refresh still bails when a list is in flight');

function boot(opts){
  opts = opts || {};
  const mem = {};
  const calls = [];
  const logs = [];
  const ensures = {n:0};
  const refreshes = {n:0};
  const note = {textContent:''};
  const thread = {innerHTML:'', scrollTop:0, scrollHeight:0, appendChild:function(){}, querySelector:function(){return null;}};
  const input = {value:opts.input||'', focus:function(){}, addEventListener:function(){}};
  const sendBtn = {disabled:false, textContent:'Send'};
  const ctx = {
    currentUser: {username:'ada', name:'Ada Cole', sbAccessToken:'jwt', sbExpiresAt:Date.now()+3600000},
    aideChatBusy:false,
    aideChatMode:'stub',
    aideChatPollTimer:0,
    store:{
      get:function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
      set:function(k,v){mem[k]=v;}
    },
    evercareSbEnabled:function(){return opts.sb !== false;},
    sbDataEnabled:function(){return opts.sb !== false;},
    sbEnsureCaregiverJwt: async function(){
      ensures.n += 1;
      if(opts.ensureThrows)throw new Error('ensure failed');
      return opts.ensureOk !== false;
    },
    sbRefreshCaregiverJwt: async function(){
      refreshes.n += 1;
      if(opts.refreshThrows)throw new Error('refresh failed');
      return !!opts.refreshOk;
    },
    cgIsAuthErr: function(err){
      const pack=err&&err.pack;
      const status=pack&&pack.status;
      if(status===401||status===403)return true;
      return /sign in again|jwt expired|invalid jwt|unauthorized/i.test(String(err&&err.message||''));
    },
    sbRest: async function(q, req){
      calls.push({q:q, body:req && req.body});
      if(typeof opts.sbRest === 'function')return opts.sbRest(q, req, calls);
      return {success:true, data:[]};
    },
    document:{
      getElementById:function(id){
        if(id==='aideChatNote')return note;
        if(id==='aideChatThread')return thread;
        if(id==='aideChatInput')return input;
        if(id==='aideChatSend')return sendBtn;
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
    setTimeout:function(){return 1;},
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
  ctx.logs = logs;
  ctx.note = note;
  ctx.input = input;
  ctx.sendBtn = sendBtn;
  ctx.thread = thread;
  ctx.mem = mem;
  ctx.ensures = ensures;
  ctx.refreshes = refreshes;
  return ctx;
}

function httpErr(status, message, data){
  const err = new Error(message || ('HTTP '+status));
  err.pack = {status:status, data:data || {message:message || ('HTTP '+status)}};
  return err;
}

function sentRow(body){
  return {success:true, data:{message:{id:'a1', body:body, sender:'aide', created_at:'2026-09-29T15:00:00Z'}}};
}

(async function(){
  const listFail = boot({
    refreshOk:true,
    sbRest: async function(q, req){
      if(q==='rpc/aide_get_or_create_office_thread')return {success:true, data:{id:'t1'}};
      if(q==='rpc/aide_send_office_message')return sentRow(req.body.p_body);
      if(q==='rpc/aide_list_office_messages')throw httpErr(503, 'Failed to fetch', {message:'unavailable'});
      throw new Error('unexpected '+q);
    }
  });
  const kept = await vm.runInContext('aideChatDeliver("Ace already stored this.", "")', listFail);
  assert.strictEqual(kept.mode, 'ace', 'list failure after send stays on the ace path');
  assert.ok(kept.rows.some(function(r){return r.sender==='aide'&&r.body==='Ace already stored this.';}), 'send-parsed row is kept');
  assert.strictEqual(listFail.refreshes.n, 0, 'a list 503 does not refresh or resend');
  assert.strictEqual(listFail.calls.filter(function(c){return c.q==='rpc/aide_send_office_message';}).length, 1, 'the message is sent once');
  assert.strictEqual(listFail.ensures.n, 1, 'deliver ensures the jwt before the attempt');
  assert.ok(!listFail.mem.evercare_aidechat1_ada, 'a stored send does not fall through to the stub');
  listFail.input.value = 'Ace already stored this.';
  await vm.runInContext('submitAideMessage({preventDefault:function(){}})', listFail);
  assert.strictEqual(listFail.note.textContent.indexOf('The message did not send'), -1, 'submit does not paint the fail note');
  assert.strictEqual(listFail.input.value, '', 'a kept send still clears the composer');
  assert.ok(/One thread with the office/.test(listFail.note.textContent), 'success note stays');

  const parsedFail = boot({
    sbRest: async function(q, req){
      if(q==='rpc/aide_send_office_message')return sentRow(req.body.p_body);
      if(q==='rpc/aide_list_office_messages')return {success:false, error:'The office thread did not load.'};
      return {success:true, data:{id:'t1'}};
    }
  });
  const parsed = await vm.runInContext('aideChatDeliver("Keep the stored line.")', parsedFail);
  assert.strictEqual(parsed.mode, 'ace');
  assert.ok(parsed.rows.some(function(r){return r.body==='Keep the stored line.';}), 'a failed list parse keeps the send row');

  const origWalk = parsedFail.aideChatRowsFromRpc;
  let walks = 0;
  parsedFail.aideChatRowsFromRpc = function(data){
    walks += 1;
    if(walks === 2)throw new Error('parse boom');
    return origWalk(data);
  };
  const thrownParse = await vm.runInContext('aideChatDeliver("Parse throw stays sent.")', parsedFail);
  assert.strictEqual(walks, 2, 'the list parse is the call that throws');
  assert.strictEqual(thrownParse.mode, 'ace');
  assert.ok(thrownParse.rows.some(function(r){return r.body==='Parse throw stays sent.';}), 'a throwing list parse stays soft');

  const missingList = boot({
    sbRest: async function(q, req){
      if(q==='rpc/aide_send_office_message')return sentRow(req.body.p_body);
      if(q==='rpc/aide_list_office_messages'){
        const err = new Error('Could not find the function public.aide_list_office_messages in the schema cache');
        err.pack = {status:404, data:{code:'PGRST202', message:err.message}};
        throw err;
      }
      return {success:true, data:{id:'t1'}};
    }
  });
  const missedList = await vm.runInContext('aideChatDeliver("Missing list stays sent.")', missingList);
  assert.strictEqual(missedList.mode, 'ace', 'a missing list rpc does not switch the stored send to the stub');
  assert.ok(missedList.rows.some(function(r){return r.body==='Missing list stays sent.';}));
  assert.ok(!/not connected yet/.test(missedList.note));

  const authThenOk = boot({
    refreshOk:true,
    sbRest: async function(q, req, calls){
      const prior = calls.filter(function(c){return c.q==='rpc/aide_get_or_create_office_thread';}).length;
      if(q==='rpc/aide_get_or_create_office_thread' && prior===1)throw httpErr(401, 'jwt expired', {message:'jwt expired'});
      if(q==='rpc/aide_send_office_message')return sentRow(req.body.p_body);
      if(q==='rpc/aide_list_office_messages')return {success:true, data:[
        {id:'a1', body:req && calls.length ? 'Shift status?' : '', sender:'aide', created_at:'2026-09-29T15:00:00Z'},
        {id:'o1', body:'Your Friday shift is still on the schedule.', sender:'office', created_at:'2026-09-29T15:00:01Z'}
      ]};
      return {success:true, data:{id:'t1'}};
    }
  });
  const retried = await vm.runInContext('aideChatDeliver("Shift status?")', authThenOk);
  assert.strictEqual(authThenOk.refreshes.n, 1, 'a 401 refreshes once');
  assert.strictEqual(authThenOk.calls.filter(function(c){return c.q==='rpc/aide_get_or_create_office_thread';}).length, 2, 'the whole deliver retries once');
  assert.strictEqual(authThenOk.calls.filter(function(c){return c.q==='rpc/aide_send_office_message';}).length, 1, 'send runs on the retry');
  assert.strictEqual(retried.mode, 'ace');
  assert.ok(retried.rows.some(function(r){return r.sender==='office';}), 'the retry list still paints');
  assert.strictEqual(JSON.stringify(authThenOk.calls.filter(function(c){return c.q==='rpc/aide_send_office_message';})[0].body), JSON.stringify({p_body:'Shift status?'}));

  const sendAuth = boot({
    refreshOk:true,
    sbRest: async function(q, req, calls){
      const sends = calls.filter(function(c){return c.q==='rpc/aide_send_office_message';}).length;
      if(q==='rpc/aide_send_office_message' && sends===1)throw httpErr(403, 'unauthorized', {message:'unauthorized'});
      if(q==='rpc/aide_send_office_message')return sentRow(req.body.p_body);
      if(q==='rpc/aide_list_office_messages')return {success:true, data:[]};
      return {success:true, data:{id:'t1'}};
    }
  });
  const sendRetried = await vm.runInContext('aideChatDeliver("Pay question please.", "pay_question")', sendAuth);
  assert.strictEqual(sendAuth.refreshes.n, 1, 'a 403 on send refreshes once');
  assert.strictEqual(sendAuth.calls.filter(function(c){return c.q==='rpc/aide_send_office_message';}).length, 2, 'send is retried once');
  assert.strictEqual(sendRetried.mode, 'ace');
  assert.strictEqual(JSON.stringify(sendAuth.calls.filter(function(c){return c.q==='rpc/aide_send_office_message';})[1].body), JSON.stringify({p_body:'Pay question please.', p_escalate_kind:'pay_question'}));

  const jwtMsg = boot({
    refreshOk:true,
    sbRest: async function(q, req, calls){
      const sends = calls.filter(function(c){return c.q==='rpc/aide_send_office_message';}).length;
      if(q==='rpc/aide_send_office_message' && sends===1){
        const err = new Error('jwt expired');
        err.pack = {status:0, data:{message:'jwt expired'}};
        throw err;
      }
      if(q==='rpc/aide_send_office_message')return sentRow(req.body.p_body);
      return {success:true, data:[]};
    }
  });
  const jwtKept = await vm.runInContext('aideChatDeliver("Token was stale.")', jwtMsg);
  assert.strictEqual(jwtMsg.refreshes.n, 1, 'cgIsAuthErr retries a jwt message');
  assert.strictEqual(jwtKept.mode, 'ace');

  const refreshNo = boot({
    refreshOk:false,
    sbRest: async function(q){
      if(q==='rpc/aide_send_office_message')throw httpErr(401, 'jwt expired', {message:'jwt expired', code:'PGRST301'});
      return {success:true, data:{id:'t1'}};
    }
  });
  refreshNo.input.value = 'Please keep this draft.';
  await vm.runInContext('submitAideMessage({preventDefault:function(){}})', refreshNo);
  assert.strictEqual(refreshNo.note.textContent, 'The message did not send. Try again.');
  assert.strictEqual(refreshNo.input.value, 'Please keep this draft.', 'a failed send leaves the draft');
  assert.strictEqual(refreshNo.refreshes.n, 1, 'a refused refresh is still one try');
  assert.strictEqual(refreshNo.logs.length, 1, 'the catch logs once');
  assert.strictEqual(refreshNo.logs[0][0], 'aideChatSend');
  assert.ok(String(refreshNo.logs[0][1]).indexOf('jwt expired') >= 0, 'log includes err.message');
  assert.strictEqual(refreshNo.logs[0][2], 401, 'log includes pack status');
  assert.strictEqual(refreshNo.logs[0][3].code, 'PGRST301', 'log includes pack data');
  assert.strictEqual(refreshNo.sendBtn.disabled, false, 'send unlocks after the failure');
  assert.strictEqual(vm.runInContext('aideChatBusy', refreshNo), false, 'busy clears after the failure');

  const secondAuth = boot({
    refreshOk:true,
    sbRest: async function(q, req, calls){
      if(q==='rpc/aide_send_office_message')throw httpErr(401, 'jwt expired', {message:'still expired'});
      return {success:true, data:{id:'t1'}};
    }
  });
  secondAuth.input.value = 'Second auth stays.';
  await vm.runInContext('submitAideMessage({preventDefault:function(){}})', secondAuth);
  assert.strictEqual(secondAuth.refreshes.n, 1, 'a second 401 does not refresh again');
  assert.strictEqual(secondAuth.calls.filter(function(c){return c.q==='rpc/aide_send_office_message';}).length, 2, 'the deliver is attempted twice');
  assert.strictEqual(secondAuth.note.textContent, 'The message did not send. Try again.');
  assert.strictEqual(secondAuth.input.value, 'Second auth stays.');
  assert.strictEqual(secondAuth.logs[0][2], 401);

  const boom = boot({
    refreshOk:true,
    sbRest: async function(q){
      if(q==='rpc/aide_get_or_create_office_thread')throw httpErr(500, 'HTTP 500', {message:'HTTP 500'});
      throw new Error('unexpected '+q);
    }
  });
  let threw = false;
  try{await vm.runInContext('aideChatDeliver("hello")', boom);}catch(e){threw = true;}
  assert.strictEqual(threw, true, 'a 500 still throws');
  assert.strictEqual(boom.refreshes.n, 0, 'a 500 does not refresh the jwt');
  assert.ok(!boom.mem.evercare_aidechat1_ada, 'a real rpc error is not stored as sent');

  const missingThread = boot({
    refreshOk:true,
    sbRest: async function(q){
      const err = new Error('Could not find the function public.'+q+' in the schema cache');
      err.pack = {status:404, data:{code:'PGRST202', message:err.message}};
      throw err;
    }
  });
  const stubbed = await vm.runInContext('aideChatDeliver("Saved locally.")', missingThread);
  assert.strictEqual(stubbed.mode, 'stub');
  assert.strictEqual(missingThread.refreshes.n, 0, 'a missing thread rpc does not refresh');
  assert.strictEqual(stubbed.rows[0].sender, 'aide');
  assert.ok(/not connected yet/.test(stubbed.note));

  const ensureBoom = boot({
    ensureThrows:true,
    sbRest: async function(q, req){
      if(q==='rpc/aide_send_office_message')return sentRow(req.body.p_body);
      if(q==='rpc/aide_list_office_messages')return {success:true, data:[]};
      return {success:true, data:{id:'t1'}};
    }
  });
  const afterEnsure = await vm.runInContext('aideChatDeliver("Ensure can fail soft.")', ensureBoom);
  assert.strictEqual(afterEnsure.mode, 'ace', 'a throwing ensure does not block the send');
  assert.strictEqual(ensureBoom.ensures.n, 1);

  const refreshOpen = boot({
    sbRest: async function(q){
      if(q==='rpc/aide_mark_office_messages_read')return {success:true};
      if(q==='rpc/aide_list_office_messages')return {success:true, data:[{id:'o1', body:'Hi', sender:'office', created_at:'2026-09-29T13:00:00Z'}]};
      return {success:true, data:{id:'t1'}};
    }
  });
  await vm.runInContext('aideChatRefresh()', refreshOpen);
  assert.strictEqual(refreshOpen.ensures.n, 1, 'refresh ensures the jwt before the list');
  assert.ok(refreshOpen.calls.some(function(c){return c.q==='rpc/aide_list_office_messages';}));

  const busy = boot({});
  busy.input.value = 'Draft while the thread loads.';
  vm.runInContext('aideChatBusy=true', busy);
  await vm.runInContext('submitAideMessage({preventDefault:function(){}})', busy);
  assert.strictEqual(busy.note.textContent, 'Still loading messages\u2026');
  assert.strictEqual(busy.input.value, 'Draft while the thread loads.', 'a busy send does not clear the draft');
  assert.strictEqual(busy.calls.length, 0, 'a busy send does not post');
  assert.strictEqual(vm.runInContext('aideChatBusy', busy), true, 'the in-flight load keeps the gate');

  console.log('caregiver-care-msg-send1 static and vm checks ok');
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
    console.log('caregiver-care-msg-send1 browser skipped (no puppeteer-core)');
    return;
  }
  const http = require('http');
  const shotDir = process.env.MSG_SEND_SHOTS || '/opt/cursor/artifacts/care-msg-send1';
  fs.mkdirSync(shotDir, {recursive:true});
  const root = __dirname;
  const server = http.createServer(function(req, res){
    const url = (req.url||'/').split('?')[0];
    const file = path.join(root, url==='/'?'index.html':url.replace(/^\//,''));
    if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
    fs.readFile(file, function(err, buf){
      if(err){res.writeHead(404);res.end('missing');return;}
      const ext = path.extname(file);
      const type = ext==='.svg'?'image/svg+xml':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'text/html';
      res.writeHead(200, {'Content-Type':type,'Cache-Control':'no-store'});
      res.end(buf);
    });
  });
  await new Promise(function(resolve){server.listen(0, '127.0.0.1', resolve);});
  const port = server.address().port;
  let browser;
  try{
    browser = await puppeteer.launch({
      executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
      headless:'new',
      args:['--no-sandbox','--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    await page.goto('http://127.0.0.1:'+port+'/index.html?v=care-msg-send1', {waitUntil:'domcontentloaded', timeout:20000});
    const result = await page.evaluate(async function(){
      currentUser = {username:'ada', name:'Ada Cole', sbAccessToken:'jwt-live', sbExpiresAt:Date.now()+3600000};
      const calls = [];
      const refreshes = {n:0};
      window.sbEnsureCaregiverJwt = async function(){return true;};
      window.sbRefreshCaregiverJwt = async function(){refreshes.n += 1; return true;};
      window.sbRest = async function(q, req){
        calls.push(q);
        if(q==='rpc/aide_get_or_create_office_thread')return {success:true, data:{id:'t1'}};
        if(q==='rpc/aide_send_office_message'){
          return {success:true, data:{message:{id:'a1', body:req.body.p_body, sender:'aide', created_at:'2026-09-29T15:00:00Z'}}};
        }
        if(q==='rpc/aide_list_office_messages'){
          const err = new Error('Failed to fetch');
          err.pack = {status:503, data:{message:'unavailable'}};
          throw err;
        }
        if(q==='rpc/aide_mark_office_messages_read')return {success:true};
        return {success:true, data:[]};
      };
      if(typeof showScreen==='function')showScreen('messagesScreen');
      const input = document.getElementById('aideChatInput');
      input.value = 'Ace already stored this.';
      await submitAideMessage({preventDefault:function(){}});
      const note = document.getElementById('aideChatNote').textContent;
      const bubbles = document.querySelectorAll('#aideChatThread .aidechat-row').length;
      const you = document.querySelector('#aideChatThread .aidechat-bubble-aide');
      const afterSend = {
        note:note,
        input:input.value,
        bubbles:bubbles,
        you:you ? you.textContent : '',
        fail:note.indexOf('The message did not send') >= 0,
        sends:calls.filter(function(q){return q==='rpc/aide_send_office_message';}).length,
        refreshes:refreshes.n
      };
      aideChatBusy = true;
      input.value = 'Draft while the thread loads.';
      await submitAideMessage({preventDefault:function(){}});
      return {
        afterSend:afterSend,
        busyNote:document.getElementById('aideChatNote').textContent,
        busyInput:input.value,
        marker:document.getElementById('messagesScreen').getAttribute('data-msg-send'),
        cache:document.getElementById('messagesScreen').getAttribute('data-cache'),
        build:(document.querySelector('meta[name="caregiver-build"]')||{}).content
      };
    });
    assert.strictEqual(result.build, '2026-10-08-sec1-cg2', 'first build meta is the cache token');
    assert.strictEqual(result.marker, 'v=care-msg-send1');
    assert.strictEqual(result.cache, '?v=care-msg-send1');
    assert.strictEqual(result.afterSend.fail, false, 'the screen does not say the message did not send');
    assert.strictEqual(result.afterSend.input, '', 'a kept send clears the composer');
    assert.ok(result.afterSend.bubbles >= 1, 'the sent bubble is painted');
    assert.strictEqual(result.afterSend.you, 'Ace already stored this.');
    assert.strictEqual(result.afterSend.sends, 1, 'the page posts the send once');
    assert.strictEqual(result.afterSend.refreshes, 0, 'a list failure does not refresh the jwt');
    assert.ok(/One thread with the office/.test(result.afterSend.note));
    assert.strictEqual(result.busyNote, 'Still loading messages\u2026');
    assert.strictEqual(result.busyInput, 'Draft while the thread loads.');
    await page.screenshot({path:path.join(shotDir, 'busy-note.png')});
    console.log('caregiver-care-msg-send1 browser checks ok');
  }finally{
    if(browser)await browser.close();
    server.close();
  }
}
