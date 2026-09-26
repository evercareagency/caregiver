#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-09-25-aidechat1">', 'first meta is aidechat1');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-aidechat1 v=aidechat1 —'), 'aidechat1 comment');
assert.ok(html.includes('v=aidechat1'), 'aidechat1 probe');
assert.ok(html.includes('data-aidechat="v=aidechat1"'), 'screen marker');
assert.ok(html.includes('GHOST-AIDECHAT1-CONTRACT-v1'), 'expected ace contract');
assert.ok(html.includes('rpc/aide_get_or_create_office_thread'), 'thread rpc');
assert.ok(html.includes('rpc/aide_list_office_messages'), 'list rpc');
assert.ok(html.includes('rpc/aide_send_office_message'), 'send rpc');
assert.ok(html.includes('rpc/aide_mark_office_messages_read'), 'mark-read rpc');
assert.ok(html.includes('aide_chat_remi_context(p_on_date) stays Admin-side'), 'remi context stays admin');
assert.ok(html.includes('p_escalate_kind'), 'escalate field');
assert.ok(html.includes('p_before'), 'older-page cursor');
assert.ok(!html.includes('rpc/get_my_thread_messages') && !html.includes('rpc/send_aide_message'), 'old message rpc names are gone');
assert.ok(html.includes('p_body'), 'send body field');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-25-cgsigfit1">') > 0, 'cgsigfit1 meta stays');
assert.ok(html.includes('v=cgsigfit1') && html.includes('v=cgsigs2') && html.includes('v=coveraide2'), 'prior markers stay');
assert.ok(html.includes('v=cgacct1') && html.includes('v=portal1') && html.includes('v=offline1'), 'account portal offline stay');

const nav = html.slice(html.indexOf('id="bottomNav"'), html.indexOf('id="deleteDraftModal"'));
assert.ok(nav.includes('data-nav="home"') && nav.includes('data-nav="timesheet"') && nav.includes('data-nav="inservices"') && nav.includes('data-nav="more"'), 'four nav targets stay');
assert.ok(!nav.includes('data-nav="messages"'), 'messages is not a fifth tab');
assert.ok(!nav.includes('>Call off<'), 'call off stays off the nav');

const home = html.slice(html.indexOf('id="cgHomeView"'), html.indexOf('id="cgFormView"'));
assert.ok(home.includes('id="aideChatHomeBtn"'), 'home opens messages');
assert.ok(home.includes('id="callOffHomeBtn"'), 'home call off stays');
assert.ok(home.includes("Back up this week's draft"), 'home backup stays');

const screen = html.slice(html.indexOf('id="messagesScreen"'), html.indexOf('id="moreScreen"'));
assert.ok(screen.includes('id="aideChatThread"'), 'history');
assert.ok(screen.includes('id="aideChatInput"'), 'compose');
assert.ok(screen.includes('id="aideChatSend"'), 'send');
assert.ok(screen.includes('data-aidechat-prompt="status"'), 'status question');
assert.ok(screen.includes('data-aidechat-prompt="calloff"'), 'call-off question');
assert.ok(screen.includes('data-aidechat-prompt="pay"'), 'pay question');
assert.ok(screen.includes('does not decide the call-off'), 'screen does not decide a call-off');
assert.ok(!/approved/i.test(screen), 'messages screen does not say approved');
assert.ok(!/sms:/i.test(screen) && !/mailto:/i.test(screen), 'no sms or email link in the screen');
assert.ok(screen.includes('tel:+12163775991') === false, 'phone link is built from Remi text, not hard-coded in the screen');

const account = html.slice(html.indexOf('id="moreScreen"'), html.indexOf('id="bottomNav"'));
assert.ok(!account.includes('id="aideChatHomeBtn"'), 'account does not gain messages');
assert.ok(!account.includes('>Call off</button>'), 'account still has no call off');

const start = html.indexOf('// v=aidechat1 GHOST-AIDECHAT1-CONTRACT-v1');
const end = html.indexOf('function showCaregiverHome()', start);
assert.ok(start > 0 && end > start, 'aide chat script block');
const src = html.slice(start, end);
assert.ok(!/sms:|mailto:|send_broadcast|set_password|auth\/v1/i.test(src), 'adapter does not send sms, email, or reseal auth');
assert.ok(src.includes("sbRest('rpc/aide_get_or_create_office_thread'"), 'opens the office thread');
assert.ok(src.includes("sbRest('rpc/aide_list_office_messages'"), 'lists office messages');
assert.ok(src.includes("sbRest('rpc/aide_send_office_message'"), 'sends on the office thread');
assert.ok(src.includes("sbRest('rpc/aide_mark_office_messages_read'"), 'marks read when the thread opens');
assert.ok(!/sbRest\('rpc\/aide_chat_remi_context'/.test(src), 'portal does not call remi context');
assert.ok(src.includes('p_escalate_kind'), 'send can escalate');
assert.ok(!src.includes('get_my_thread_messages') && !src.includes('send_aide_message'), 'adapter does not call the old rpcs');
assert.ok(!/approved/i.test(src), 'adapter copy does not say approved');

function boot(opts){
  opts = opts || {};
  const mem = {};
  const calls = [];
  const note = {textContent:''};
  const thread = {innerHTML:'', scrollTop:0, appendChild:function(){}};
  const input = {value:opts.input||'', focus:function(){}, addEventListener:function(){}};
  const sendBtn = {disabled:false, textContent:'Send'};
  const aideName = {textContent:''};
  const ctx = {
    currentUser: opts.user === null ? null : {username:'ada', name:'Ada Cole', sbAccessToken: opts.token === false ? '' : 'jwt'},
    aideChatBusy:false,
    aideChatMode:'stub',
    aideChatPollTimer:0,
    store:{
      get:function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
      set:function(k,v){mem[k]=v;}
    },
    evercareSbEnabled:function(){return opts.sb !== false;},
    sbDataEnabled:function(){return opts.sb !== false && opts.token !== false;},
    sbRest: async function(q, req){
      calls.push({q:q, body:req && req.body, method:req && req.method});
      if(opts.missing){
        const err = new Error('Could not find the function public.'+q+' in the schema cache');
        err.pack = {status:404, data:{code:'PGRST202', message:err.message}};
        throw err;
      }
      if(opts.fail){
        const err = new Error('HTTP 500');
        err.pack = {status:500, data:{message:'HTTP 500'}};
        throw err;
      }
      if(typeof opts.sbRest === 'function')return opts.sbRest(q, req);
      return opts.data;
    },
    document:{
      getElementById:function(id){
        if(id==='aideChatNote')return note;
        if(id==='aideChatThread')return thread;
        if(id==='aideChatInput')return input;
        if(id==='aideChatSend')return sendBtn;
        if(id==='messagesScreen')return {classList:{contains:function(){return true;}}};
        if(id==='aideChatAideName')return aideName;
        return null;
      },
      createElement:function(){
        return {
          className:'', textContent:'', innerHTML:'', id:'', dateTime:'', type:'',
          onclick:null,
          setAttribute:function(){},
          appendChild:function(){}
        };
      },
      body:{classList:{contains:function(){return false;}, add:function(){}, remove:function(){}}},
      activeElement:null
    },
    window:{innerWidth:390, innerHeight:844, visualViewport:null},
    loginKbIsPhone:function(){return true;},
    showScreen:function(){},
    requireAideSetup:function(){return true;},
    setInterval:function(){return 1;},
    clearInterval:function(){},
    setTimeout:function(fn){if(opts.runTimers)fn(); return 1;},
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
  ctx.mem = mem;
  ctx.note = note;
  ctx.input = input;
  ctx.aideName = aideName;
  return ctx;
}

const phone = 'Call the office at (216) 377-5991 if you need a person.';
const box = boot({sb:false});
const linked = vm.runInContext('aideChatBodyHtml("remi", '+JSON.stringify(phone)+')', box);
assert.ok(linked.includes('href="tel:+12163775991"'), 'remi phone is tappable');
assert.ok(linked.includes('class="aidechat-phone"'), 'phone link class');
assert.ok(linked.includes('>(216) 377-5991</a>'), 'visible phone is exactly the office number');
assert.ok(!/sms:|mailto:/i.test(linked), 'phone link is a call, not sms or email');
const office = vm.runInContext('aideChatBodyHtml("office", "Call 216-377-5991 or (440) 555-0199.")', box);
assert.ok(office.includes('href="tel:+12163775991"'), 'office phone is tappable');
assert.ok(office.includes('>(216) 377-5991</a>'), 'office phone text is the locked format');
assert.ok(!office.includes('216-377-5991'), 'dashed office number is not shown');
assert.ok(!/440|555-0199|5550199/.test(office), 'no other number is shown');
assert.strictEqual((office.match(/tel:\+12163775991/g)||[]).length, 1, 'one office link');
const escaped = vm.runInContext('aideChatBodyHtml("remi", "<script>alert(1)</script> 216.377.5991")', box);
assert.ok(!escaped.includes('<script>'), 'remi html is escaped');
assert.ok(escaped.includes('&lt;script&gt;'), 'script is escaped');
assert.ok(escaped.includes('>(216) 377-5991</a>'), 'dotted office number becomes the locked text');
assert.ok(!escaped.includes('216.377.5991'), 'dotted form is not shown');
const callOff = html.slice(html.indexOf('id="callOffScreen"'), html.indexOf('id="messagesScreen"'));
assert.ok(callOff.includes('href="tel:+12163775991">(216) 377-5991</a>'), 'call-off phone is the locked tappable number');
assert.ok(!/440|555-01/.test(callOff), 'call-off screen has no other number');

assert.strictEqual(vm.runInContext('aideChatSender("Remi")', box), 'remi');
assert.strictEqual(vm.runInContext('aideChatSender("office")', box), 'office');
assert.strictEqual(vm.runInContext('aideChatSender("caregiver")', box), 'aide');
assert.strictEqual(vm.runInContext('aideChatLabel("remi")', box), 'Remi');
assert.strictEqual(vm.runInContext('aideChatLabel("office")', box), 'Office');
assert.strictEqual(vm.runInContext('aideChatLabel("aide")', box), 'You');
assert.strictEqual(vm.runInContext('aideChatPromptText("status")', box), 'What is the status of my upcoming shift?');
assert.strictEqual(vm.runInContext('aideChatPromptText("calloff")', box), 'I need to ask about calling off an upcoming shift.');
assert.strictEqual(vm.runInContext('aideChatPromptText("pay")', box), 'I have a question about my pay.');
assert.ok(!/approved/i.test(vm.runInContext('aideChatPromptText("status")+aideChatPromptText("calloff")+aideChatPromptText("pay")+aideChatAceNote()+aideChatStubNote()', box)), 'prompts do not claim approval');

const shapes = [
  [{id:'1', body:'Status?', sender:'aide', created_at:'2026-09-25T14:00:00Z'}],
  {success:true, data:[{id:'1', message:'Status?', role:'me', createdAt:'2026-09-25T14:00:00Z'}]},
  {ok:true, data:{messages:[{id:'1', text:'Status?', from:'user', sent_at:'2026-09-25T14:00:00Z'}]}},
  {success:true, data:{message:{id:'1', body:'Status?', sender:'aide', created_at:'2026-09-25T14:00:00Z'}, replies:[{id:'2', body:phone, sender:'remi', created_at:'2026-09-25T14:01:00Z'}]}},
  '[{"id":"1","body":"Status?","sender":"aide","created_at":"2026-09-25T14:00:00Z"}]'
];
shapes.forEach(function(shape, i){
  const ctx = boot({sb:false});
  ctx.shape = shape;
  const rows = vm.runInContext('aideChatRowsFromRpc(shape)', ctx);
  assert.strictEqual(rows.ok, true, 'shape '+i+' ok');
  assert.ok(rows.rows.length >= 1, 'shape '+i+' has a row');
  assert.strictEqual(rows.rows[0].sender, 'aide', 'shape '+i+' aide');
  assert.strictEqual(rows.rows[0].label, 'You', 'shape '+i+' label');
});
const replyBox = boot({sb:false});
replyBox.shape = shapes[3];
const replied = vm.runInContext('aideChatRowsFromRpc(shape)', replyBox);
assert.strictEqual(replied.rows.length, 2, 'send envelope keeps the remi reply');
assert.strictEqual(replied.rows[1].sender, 'remi');
assert.strictEqual(replied.rows[1].label, 'Remi');
assert.ok(replied.rows[1].body.includes('(216) 377-5991'));

const denied = boot({sb:false});
denied.shape = {success:false, error:'nope', data:[{body:'hidden', sender:'remi'}]};
const hidden = vm.runInContext('aideChatRowsFromRpc(shape)', denied);
assert.strictEqual(hidden.ok, false, 'failed envelope does not paint');

(async function(){
  const stub = boot({sb:false});
  const saved = await vm.runInContext('aideChatDeliver("I need to ask about calling off an upcoming shift.")', stub);
  assert.strictEqual(saved.mode, 'stub');
  assert.strictEqual(stub.calls.length, 0, 'sheets or no ace does not post');
  assert.strictEqual(saved.rows.length, 1);
  assert.strictEqual(saved.rows[0].sender, 'aide');
  assert.ok(!saved.rows.some(function(r){return r.sender==='remi'||r.sender==='office';}), 'stub does not invent remi or office');
  assert.ok(/not connected yet/.test(saved.note));
  assert.ok(stub.mem.evercare_aidechat1_ada, 'local key is per username');

  const missing = boot({missing:true});
  const missed = await vm.runInContext('aideChatDeliver("What is the status of my upcoming shift?")', missing);
  assert.strictEqual(missing.calls[0].q, 'rpc/aide_get_or_create_office_thread');
  assert.strictEqual(JSON.stringify(missing.calls[0].body), '{}');
  assert.strictEqual(missing.calls.length, 1, 'a missing thread rpc does not send');
  assert.strictEqual(missed.mode, 'stub');
  assert.strictEqual(missed.rows.length, 1);
  assert.strictEqual(missed.rows[0].sender, 'aide');

  const live = boot({
    sbRest: async function(q, req){
      if(q==='rpc/aide_get_or_create_office_thread')return {success:true, data:{id:'t1'}};
      if(q==='rpc/aide_send_office_message'){
        return {success:true, data:{
          message:{id:'a1', body:req.body.p_body, sender:'aide', created_at:'2026-09-25T15:00:00Z'},
          replies:[{id:'r1', body:'Remi: the office decides a call-off. Call (216) 377-5991.', sender:'remi', created_at:'2026-09-25T15:00:02Z'}]
        }};
      }
      return {success:true, data:[
        {id:'a1', body:'I have a question about my pay.', sender:'aide', created_at:'2026-09-25T15:00:00Z'},
        {id:'o1', body:'Your Friday shift is still on the schedule.', sender:'office', created_at:'2026-09-25T15:00:01Z'},
        {id:'r1', body:'Remi: the office decides a call-off. Call (216) 377-5991.', sender:'remi', created_at:'2026-09-25T15:00:02Z'}
      ]};
    }
  });
  const sent = await vm.runInContext('aideChatDeliver("I have a question about my pay.", "pay_question")', live);
  assert.strictEqual(live.calls[0].q, 'rpc/aide_get_or_create_office_thread');
  assert.strictEqual(JSON.stringify(live.calls[0].body), '{}');
  assert.strictEqual(live.calls[1].q, 'rpc/aide_send_office_message');
  assert.strictEqual(JSON.stringify(live.calls[1].body), JSON.stringify({p_body:'I have a question about my pay.', p_escalate_kind:'pay_question'}));
  assert.strictEqual(live.calls[2].q, 'rpc/aide_list_office_messages');
  assert.strictEqual(JSON.stringify(live.calls[2].body), JSON.stringify({p_limit:50}));
  assert.strictEqual(sent.mode, 'ace');
  assert.strictEqual(JSON.stringify(sent.rows.map(function(r){return r.sender;})), JSON.stringify(['aide','office','remi']));
  assert.strictEqual(JSON.stringify(sent.rows.map(function(r){return r.label;})), JSON.stringify(['You','Office','Remi']));
  const remiHtml = vm.runInContext('aideChatBodyHtml("remi", '+JSON.stringify(sent.rows[2].body)+')', live);
  assert.ok(remiHtml.includes('href="tel:+12163775991"'), 'live remi reply phone is tappable');
  assert.ok(remiHtml.includes('>(216) 377-5991</a>'), 'live remi phone text is locked');
  const statusBody = vm.runInContext('aideChatSendBody("What is the status of my upcoming shift?", "")', live);
  const callBody = vm.runInContext('aideChatSendBody("I need to ask about calling off an upcoming shift.", "call_off")', live);
  const junkBody = vm.runInContext('aideChatSendBody("hello", "sms")', live);
  assert.strictEqual(JSON.stringify(statusBody), JSON.stringify({p_body:'What is the status of my upcoming shift?'}));
  assert.strictEqual(JSON.stringify(callBody), JSON.stringify({p_body:'I need to ask about calling off an upcoming shift.', p_escalate_kind:'call_off'}));
  assert.strictEqual(JSON.stringify(junkBody), JSON.stringify({p_body:'hello'}));
  assert.strictEqual(JSON.stringify(vm.runInContext('aideChatListBody("2026-09-25T14:00:00Z")', live)), JSON.stringify({p_limit:50, p_before:'2026-09-25T14:00:00Z'}));
  assert.ok(!live.calls.some(function(c){return c.q==='rpc/aide_mark_office_messages_read';}), 'send does not mark read');
  assert.ok(!live.calls.some(function(c){return c.q==='rpc/aide_chat_remi_context';}), 'send does not look up remi context');

  const opened = boot({
    sbRest: async function(q){
      if(q==='rpc/aide_get_or_create_office_thread')return {success:true, data:{id:'t1'}};
      if(q==='rpc/aide_mark_office_messages_read')return {success:true};
      if(q==='rpc/aide_list_office_messages')return {success:true, data:[
        {id:'a1', body:'Status?', sender:'aide', created_at:'2026-09-25T14:00:00Z'},
        {id:'r1', body:'Call (216) 377-5991.', sender:'remi', created_at:'2026-09-25T14:06:00Z'}
      ]};
      throw new Error('unexpected '+q);
    }
  });
  await vm.runInContext('aideChatRefresh()', opened);
  const marked = opened.calls.filter(function(c){return c.q==='rpc/aide_mark_office_messages_read';});
  assert.strictEqual(marked.length, 1, 'open marks read once');
  assert.strictEqual(JSON.stringify(marked[0].body), JSON.stringify({p_before:'2026-09-25T14:06:00Z'}));
  assert.ok(/Marked read/.test(opened.note.textContent), 'mark-read is visible on the thread');
  assert.strictEqual(opened.aideName.textContent, 'Office · Marked read');
  assert.ok(!opened.calls.some(function(c){return c.q==='rpc/aide_chat_remi_context';}));
  await vm.runInContext('aideChatRefresh()', opened);
  assert.strictEqual(opened.calls.filter(function(c){return c.q==='rpc/aide_mark_office_messages_read';}).length, 1, 'poll refresh does not mark again');
  await vm.runInContext('openAideMessages()', opened);
  assert.strictEqual(opened.calls.filter(function(c){return c.q==='rpc/aide_mark_office_messages_read';}).length, 2, 'opening Messages marks read again');

  const stubOpen = boot({sb:false});
  await vm.runInContext('aideChatRefresh()', stubOpen);
  assert.strictEqual(stubOpen.calls.length, 0, 'stub open does not mark read');

  const missOpen = boot({missing:true});
  await vm.runInContext('aideChatRefresh()', missOpen);
  assert.ok(!missOpen.calls.some(function(c){return c.q==='rpc/aide_mark_office_messages_read';}), 'missing thread does not mark read');
  assert.ok(!/Office|Remi/.test(missOpen.note.textContent));

  const markMissing = boot({
    sbRest: async function(q){
      if(q==='rpc/aide_mark_office_messages_read'){
        const err = new Error('Could not find the function public.aide_mark_office_messages_read in the schema cache');
        err.pack = {status:404, data:{code:'PGRST202', message:err.message}};
        throw err;
      }
      if(q==='rpc/aide_get_or_create_office_thread')return {id:'t1'};
      return {success:true, data:[{id:'a1', body:'Status?', sender:'aide', created_at:'2026-09-25T14:00:00Z'}]};
    }
  });
  await vm.runInContext('aideChatRefresh()', markMissing);
  assert.ok(!/Marked read/.test(markMissing.note.textContent), 'missing mark-read stays quiet');
  const kept = vm.runInContext('aideChatRows', markMissing);
  assert.strictEqual(kept.length, 1);
  assert.strictEqual(kept[0].sender, 'aide', 'missing mark-read does not invent a reply');

  const emptyOpen = boot({
    sbRest: async function(q){
      if(q==='rpc/aide_mark_office_messages_read')return {ok:true};
      return {success:true, data:[]};
    }
  });
  await vm.runInContext('aideChatRefresh()', emptyOpen);
  const emptyMark = emptyOpen.calls.filter(function(c){return c.q==='rpc/aide_mark_office_messages_read';});
  assert.strictEqual(JSON.stringify(emptyMark[0].body), '{}', 'a thread with no times omits p_before');
  assert.strictEqual(JSON.stringify(vm.runInContext('aideChatMarkBody([{createdAt:""}])', emptyOpen)), '{}');

  const boom = boot({fail:true});
  let threw = false;
  try{await vm.runInContext('aideChatDeliver("hello")', boom);}catch(e){threw = true;}
  assert.strictEqual(threw, true, 'a real rpc error is not stored as sent');
  assert.ok(!boom.mem.evercare_aidechat1_ada, 'failed send does not stub-save');

  console.log('caregiver-aidechat1 static checks ok');
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
    console.log('caregiver-aidechat1 browser skipped (no puppeteer-core)');
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
    await page.goto('http://127.0.0.1:'+port+'/index.html?sheets=1', {waitUntil:'domcontentloaded', timeout:20000});
    await page.evaluate(function(){
      localStorage.setItem('cg_session', JSON.stringify({
        username:'portal.aide',
        name:'Portal Aide',
        loginAt:Date.now()-60*60*1000,
        mustChangePassword:false,
        needsEmail:false
      }));
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_portal.aide','1');
    });
    await page.reload({waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForFunction(function(){
      return document.getElementById('caregiverScreen').classList.contains('active');
    }, {timeout:8000});
    const tabs = await page.$$eval('#bottomNav button', function(btns){
      return btns.map(function(b){return b.textContent.replace(/[^A-Za-z]/g,'');});
    });
    assert.deepStrictEqual(tabs, ['Home','Timesheet','Inservices','More']);
    await page.click('#aideChatHomeBtn');
    await page.waitForFunction(function(){
      return document.getElementById('messagesScreen').classList.contains('active');
    }, {timeout:4000});
    await page.click('[data-aidechat-prompt="calloff"]');
    const filled = await page.$eval('#aideChatInput', function(el){return el.value;});
    assert.ok(/calling off/.test(filled), 'call-off prompt fills the composer');
    assert.ok(!/approved/i.test(filled));
    await page.click('#aideChatSend');
    await page.waitForFunction(function(){
      return document.querySelector('#aideChatThread [data-sender="aide"]');
    }, {timeout:4000});
    const stubView = await page.evaluate(function(){
      return {
        labels: Array.prototype.map.call(document.querySelectorAll('.aidechat-label'), function(el){return el.textContent;}),
        note: document.getElementById('aideChatNote').textContent,
        remi: document.querySelectorAll('[data-sender="remi"]').length,
        approved: /approved/i.test(document.getElementById('messagesScreen').innerText)
      };
    });
    assert.deepStrictEqual(stubView.labels, ['You']);
    assert.strictEqual(stubView.remi, 0, 'stub does not invent Remi');
    assert.ok(/not connected yet/.test(stubView.note));
    assert.strictEqual(stubView.approved, false);
    await page.$eval('#aideChatInput', function(el){el.blur();});
    await page.screenshot({path:path.join(shotDir, 'aidechat1-stub-phone.png')});

    await page.setRequestInterception(true);
    const cors = {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Headers':'*',
      'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',
      'Content-Type':'application/json'
    };
    const thread = [
      {id:'a1', body:'What is the status of my upcoming shift?', sender:'aide', created_at:'2026-09-25T14:00:00Z'},
      {id:'o1', body:'Office: your Friday shift is still on the schedule.', sender:'office', created_at:'2026-09-25T14:05:00Z'},
      {id:'r1', body:'Remi: a call-off is not decided in this chat. Call the office at 216-377-5991.', sender:'remi', created_at:'2026-09-25T14:06:00Z'}
    ];
    let lastSend = null;
    let lastMark = null;
    let markCount = 0;
    let remiContextHits = 0;
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
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true, data:thread.slice()})}).catch(function(){});
        return;
      }
      if(/aide_mark_office_messages_read/.test(url)){
        let markBody = {};
        try{markBody = JSON.parse(req.postData()||'{}');}catch(e){}
        lastMark = markBody;
        markCount += 1;
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true})}).catch(function(){});
        return;
      }
      if(/aide_chat_remi_context/.test(url)){
        remiContextHits += 1;
        req.respond({status:200, headers:cors, body:'[]'}).catch(function(){});
        return;
      }
      if(/aide_send_office_message/.test(url)){
        let sentBody = {};
        try{sentBody = JSON.parse(req.postData()||'{}');}catch(e){}
        lastSend = sentBody;
        const aide = {id:'a2', body:sentBody.p_body||'', sender:'aide', created_at:'2026-09-25T14:10:00Z'};
        const remi = {id:'r2', body:'Remi: for a pay question call 216.377.5991.', sender:'remi', created_at:'2026-09-25T14:10:02Z'};
        thread.push(aide, remi);
        req.respond({
          status:200,
          headers:cors,
          body:JSON.stringify({success:true, data:{message:aide, replies:[remi]}})
        }).catch(function(){});
        return;
      }
      req.respond({status:200, headers:cors, body:'[]'}).catch(function(){});
    });
    await page.evaluate(function(){
      const raw = JSON.parse(localStorage.getItem('cg_session'));
      raw.sbAccessToken = 'test-jwt';
      localStorage.setItem('cg_session', JSON.stringify(raw));
      localStorage.removeItem('evercare_sheets');
    });
    await page.goto('http://127.0.0.1:'+port+'/index.html', {waitUntil:'domcontentloaded', timeout:20000});
    await page.evaluate(function(){
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_portal.aide','1');
    });
    await page.reload({waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForSelector('#aideChatHomeBtn', {timeout:8000});
    await page.click('#aideChatHomeBtn');
    await page.waitForSelector('#aideChatThread [data-sender="remi"] .aidechat-phone', {timeout:8000});
    await page.waitForFunction(function(){
      return /Marked read/.test(document.getElementById('aideChatNote').textContent);
    }, {timeout:8000});
    const liveView = await page.evaluate(function(){
      const phone = document.querySelector('#aideChatThread [data-sender="remi"] .aidechat-phone');
      return {
        labels: Array.prototype.map.call(document.querySelectorAll('.aidechat-label'), function(el){return el.textContent;}),
        href: phone ? phone.getAttribute('href') : '',
        phoneText: phone ? phone.textContent : '',
        rule: document.getElementById('aideChatRule').textContent,
        note: document.getElementById('aideChatNote').textContent,
        name: document.getElementById('aideChatAideName').textContent
      };
    });
    assert.deepStrictEqual(liveView.labels, ['You','Office','Remi']);
    assert.strictEqual(liveView.href, 'tel:+12163775991');
    assert.strictEqual(liveView.phoneText, '(216) 377-5991');
    const locked = await page.$eval('#aideChatThread', function(el){return el.innerText;});
    assert.ok(!/216-377-5991|440|555-/.test(locked), 'thread shows no other number');
    assert.ok(/does not decide the call-off/.test(liveView.rule));
    assert.ok(/Marked read/.test(liveView.note), 'opening the thread shows mark-read');
    assert.strictEqual(liveView.name, 'Office · Marked read');
    assert.strictEqual(remiContextHits, 0, 'opening the thread does not call remi context');
    assert.strictEqual(markCount, 1, 'opening Messages marks read once');
    assert.strictEqual(lastMark && lastMark.p_before, '2026-09-25T14:06:00Z');
    await page.screenshot({path:path.join(shotDir, 'aidechat1-thread-phone.png')});
    await page.screenshot({path:path.join(shotDir, 'aidechat1-mark-read-phone.png')});
    await page.click('[data-aidechat-prompt="pay"]');
    await page.click('#aideChatSend');
    await page.waitForFunction(function(){
      const text = document.getElementById('aideChatThread').innerText;
      const phones = document.querySelectorAll('#aideChatThread [data-sender="remi"] .aidechat-phone');
      return /my pay/.test(text) && phones.length >= 2 && /pay question/.test(text);
    }, {timeout:8000});
    await page.evaluate(function(){
      const thread=document.getElementById('aideChatThread');
      if(thread)thread.scrollTop=thread.scrollHeight;
      const input=document.getElementById('aideChatInput');
      if(input)input.blur();
    });
    await page.screenshot({path:path.join(shotDir, 'aidechat1-pay-reply.png')});
    assert.strictEqual(lastSend && lastSend.p_escalate_kind, 'pay_question');
    assert.ok(lastSend && /pay/.test(lastSend.p_body||''));
  }finally{
    await browser.close();
    server.close();
  }
  console.log('caregiver-aidechat1 browser checks ok');
}
