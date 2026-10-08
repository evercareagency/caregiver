#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractFn(src, sig){
  const start = src.indexOf(sig);
  assert.ok(start >= 0, 'missing ' + sig);
  let i = src.indexOf('{', start);
  let depth = 0;
  for(; i < src.length; i++){
    if(src[i] === '{')depth++;
    else if(src[i] === '}'){
      depth--;
      if(depth === 0)return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + sig);
}

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-10-08-geo1">', 'newer tip meta is first');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-10-08-sec1-ui">') > 0, 'sec1-ui meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-msg-composer-rect1">') > 0, 'msg-composer-rect1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pwa-install-copy1">') > 0, 'pwa-install-copy1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-care-msg-send1">') > 0, 'care-msg-send1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-aide-notif-done-hide1">') > 0, 'aide-notif-done-hide1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pages-cache-fresh1">') > 0, 'pages-cache-fresh1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-aide-home-addr1-autofill1">') > 0, 'aide-home-addr1-autofill1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-aide-home-addr1">') > 0, 'aide-home-addr1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-care-msg-safe1">') > 0, 'care-msg-safe1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-punch-leftovers1">') > 0, 'punch-leftovers1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-27-care-msg-tab1">') > 0, 'care-msg-tab1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-27-vapid1">') > 0, 'vapid1 stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-27-clienthrs1d">') > 0, 'clienthrs1d stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-25-aidechat1">') > 0, 'aidechat1 stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-27-care-msg-tab1 v=care-msg-tab1 —'), 'tab build comment');
assert.ok(html.includes('v=care-msg-tab1'), 'tab probe');
assert.ok(html.includes('GHOST-CARE-MSG-TAB1-CONTRACT-v1'), 'contract name');
const tipComment = html.slice(html.indexOf('<!-- caregiver-build: 2026-09-27-care-msg-tab1'), html.indexOf('<!-- caregiver-build: 2026-09-27-vapid1'));
assert.ok(tipComment.includes('MERGE HOLD') && tipComment.includes('Do not claim LIVE'), 'this tip is merge hold');
assert.ok(!/CONTRACT-v1 is LIVE/.test(tipComment), 'this tip does not claim live');
assert.ok(html.includes('v=vapid1') && html.includes('v=clienthrs1d') && html.includes('v=aidechat1') && html.includes('v=offline1'), 'prior markers stay');

const nav = html.slice(html.indexOf('id="bottomNav"'), html.indexOf('id="deleteDraftModal"'));
const order = ['data-nav="home"', 'data-nav="timesheet"', 'data-nav="messages"', 'data-nav="inservices"', 'data-nav="more"'];
let prev = -1;
order.forEach(function(token){
  const at = nav.indexOf(token);
  assert.ok(at > prev, 'nav order ' + token);
  prev = at;
});
assert.ok(nav.includes('>Home</span>') && nav.includes('>Timesheet</span>') && nav.includes('>Messages</span>') && nav.includes('>Inservices</span>') && nav.includes('>More</span>'), 'five labels');
const msgTabStart = nav.indexOf('data-nav="messages"');
const msgTab = nav.slice(msgTabStart, nav.indexOf('</button>', msgTabStart));
assert.ok(msgTab.includes('id="msgNavBadge"'), 'badge lives on the Messages tab');
assert.ok(msgTab.includes('class="bn-badge"'), 'badge uses the shared badge class');
assert.ok(msgTab.includes('hidden'), 'badge starts hidden');
assert.ok(msgTab.includes('aria-hidden="true"'), 'badge is decorative');
assert.ok(msgTab.includes('bn-ico-wrap'), 'badge is anchored to the icon');
assert.ok(msgTab.includes("onclick=\"navGo('messages')\""), 'the tab is still the control');
assert.strictEqual(msgTab.indexOf('onclick="'), msgTab.indexOf("onclick=\"navGo('messages')\""), 'badge has no click of its own');
assert.ok(html.includes('.bottom-nav .bn-badge{') && html.includes('pointer-events:none') && html.includes('background:#ff3b30'), 'badge matches the inservices red dot');
assert.ok(html.includes('id="isNavBadge"'), 'inservices badge stays');
assert.ok(!nav.includes('>Call off<'), 'call off stays off the nav');

const home = html.slice(html.indexOf('id="cgHomeView"'), html.indexOf('id="cgFormView"'));
assert.ok(!home.includes('id="aideChatHomeCard"') && !home.includes('id="aideChatHomeBtn"'), 'home messages card is gone');
assert.ok(home.includes('id="callOffHomeCard"') && home.includes('id="callOffHomeBtn"'), 'call off stays on home');
assert.ok(home.includes("Back up this week's draft"), 'home backup stays');

assert.ok(html.includes("messagesScreen:'messages'"), 'messages screen highlights the Messages tab');
assert.ok(html.includes("if(tab==='messages')"), 'nav routes messages');
assert.ok(html.includes('function openAideMessages()') && html.includes("showScreen('messagesScreen')"), 'tab opens the existing messages screen');
assert.ok(html.includes("h==='messages'||h==='caregiver/messages'"), 'hash deep links stay');
assert.ok(html.includes('open=messages'), 'query deep link stays');

const refreshFn = extractFn(html, 'async function refreshMsgNavBadge()');
assert.ok(refreshFn.includes("sbRest('rpc/aide_list_office_messages'"), 'badge reads the existing list');
assert.ok(!refreshFn.includes('aide_get_or_create_office_thread'), 'badge does not create a thread');
assert.ok(!refreshFn.includes('aide_mark_office_messages_read'), 'badge refresh does not mark read');
assert.ok(!refreshFn.includes('aide_send_office_message'), 'badge refresh does not send');
assert.ok(!/rpc\/aide_unread|rpc\/get_message_badge|rpc\/aide_count/.test(refreshFn + html.slice(html.indexOf('function msgUnreadCount'), html.indexOf('async function aideChatMarkRead'))), 'no new unread rpc');
const markFn = extractFn(html, 'async function aideChatMarkRead(rows)');
assert.ok(markFn.includes('aideChatRememberMarkedRead(rows)') && markFn.includes('clearMsgNavBadge()'), 'mark-read clears the badge');
assert.ok(extractFn(html, 'function showCaregiverHome()').includes('refreshMsgNavBadge()'), 'home open refreshes the badge');
assert.ok(extractFn(html, 'function scheduleHomeBackgroundLoads()').includes('refreshMsgNavBadge()'), 'login schedule refreshes the badge');
assert.ok(extractFn(html, 'function cgRefreshInserviceDueOnShow()').includes('refreshMsgNavBadge()'), 'pageshow and visibility refresh the badge');
assert.ok(html.includes("window.addEventListener('pageshow'") && html.includes('cgRefreshInserviceDueOnShow()'), 'pageshow hook stays');
assert.ok(html.includes("document.visibilityState!=='visible'") && html.includes('cgRefreshInserviceDueOnShow()'), 'visibility hook stays');

const start = html.indexOf('// v=aidechat1 GHOST-AIDECHAT1-CONTRACT-v1');
const end = html.indexOf('function showCaregiverHome()', start);
assert.ok(start > 0 && end > start, 'aide chat script block');
const src = html.slice(start, end);
assert.ok(!/sms:|mailto:|send_broadcast|set_password|auth\/v1/i.test(src), 'adapter does not send sms or reseal auth');

function boot(opts){
  opts = opts || {};
  const calls = [];
  const badge = {hidden:true, textContent:''};
  const note = {textContent:''};
  const thread = {innerHTML:'', scrollTop:0, scrollHeight:0, lastElementChild:null, appendChild:function(){}, scrollIntoView:function(){}};
  const ctx = {
    currentUser: opts.user === null ? null : {username:'ada', name:'Ada Cole', sbAccessToken: opts.token === false ? '' : 'jwt'},
    aideChatBusy:false,
    aideChatMode: opts.mode || 'ace',
    aideChatPollTimer:0,
    aideChatRows:[],
    aideChatBefore:'',
    aideChatHasEarlier:false,
    aideChatMarkTried:false,
    aideChatMarkedOpen:false,
    aideChatEscalateKind:'',
    aideChatDisplayNames:{remi:'', scheduler:'', admin:''},
    store:{get:function(){return [];}, set:function(){}},
    evercareSbEnabled:function(){return opts.sb !== false;},
    sbDataEnabled:function(){return opts.sb !== false && opts.token !== false;},
    sbRest: async function(q, req){
      calls.push({q:q, body:req && req.body, method:req && req.method});
      if(opts.missing){
        const err = new Error('Could not find the function public.'+q+' in the schema cache');
        err.pack = {status:404, data:{code:'PGRST202', message:err.message}};
        throw err;
      }
      if(typeof opts.sbRest === 'function')return opts.sbRest(q, req);
      return opts.data;
    },
    document:{
      getElementById:function(id){
        if(id==='msgNavBadge')return badge;
        if(id==='aideChatNote')return note;
        if(id==='aideChatThread')return thread;
        if(id==='messagesScreen')return {classList:{contains:function(){return true;}}};
        if(id==='aideChatAideName')return {textContent:''};
        if(id==='aideChatSend')return {disabled:false, textContent:'Send'};
        return null;
      },
      createElement:function(){
        return {className:'', textContent:'', innerHTML:'', id:'', dateTime:'', type:'', onclick:null, setAttribute:function(){}, appendChild:function(){}, scrollIntoView:function(){}};
      }
    },
    showScreen:function(){},
    requireAideSetup:function(){return true;},
    setInterval:function(){return 1;},
    clearInterval:function(){},
    setTimeout:function(){return 1;},
    requestAnimationFrame:function(fn){fn();},
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
  ctx.badge = badge;
  return ctx;
}

const rows = [
  {id:'a1', body:'Can I come Friday?', sender:'aide', created_at:'2026-09-27T14:00:00Z'},
  {id:'o1', body:'Friday is still open.', sender:'office', created_at:'2026-09-27T14:05:00Z', read_by_aide_at:null},
  {id:'r1', body:'Please submit the timesheet.', sender:'remi', created_at:'2026-09-27T14:06:00Z'},
  {id:'o2', body:'Already seen.', sender:'office', created_at:'2026-09-27T13:00:00Z', read_by_aide_at:'2026-09-27T13:10:00Z'},
  {id:'s1', body:'Cover tomorrow?', sender:'scheduler', created_at:'2026-09-27T14:07:00Z', unread:false},
  {id:'m1', body:'Pay note.', sender:'admin', created_at:'2026-09-27T14:08:00Z', is_read:false}
];

(async function(){
  const counted = boot({sb:false});
  counted.pack = {success:true, data:rows};
  assert.strictEqual(vm.runInContext('msgUnreadCount(aideChatRowsFromRpc(pack).rows)', counted), 3, 'office null stamp, remi missing stamp, and explicit unread count; aide, stamped, and unread false do not');
  const camel = boot({sb:false});
  camel.pack = {success:true, data:[{id:'r2', body:'Later.', sender:'remi', created_at:'2026-09-27T14:09:00Z', readByAideAt:'2026-09-27T14:10:00Z'}]};
  assert.strictEqual(vm.runInContext('msgUnreadCount(aideChatRowsFromRpc(pack).rows)', camel), 0, 'camelCase read stamp is read');
  const flag = boot({sb:false});
  flag.pack = {success:true, data:[{id:'o3', body:'Ping.', sender:'office', created_at:'2026-09-27T14:11:00Z', unread:true}]};
  assert.strictEqual(vm.runInContext('msgUnreadCount(aideChatRowsFromRpc(pack).rows)', flag), 1, 'explicit unread counts');

  const livePack = {success:true, data:[
    {id:'a1', body:'Status?', sender:'aide', created_at:'2026-09-27T14:00:00Z'},
    {id:'o1', body:'Still on.', sender:'office', created_at:'2026-09-27T14:05:00Z'},
    {id:'r1', body:'Reminder.', sender:'remi', created_at:'2026-09-27T14:06:00Z'}
  ]};
  const live = boot({data:livePack});
  live.pack = livePack;
  await vm.runInContext('refreshMsgNavBadge()', live);
  assert.deepStrictEqual(live.calls.map(function(c){return c.q;}), ['rpc/aide_list_office_messages'], 'refresh lists and does nothing else');
  assert.strictEqual(live.badge.hidden, false, 'two unread shows the badge');
  assert.strictEqual(live.badge.textContent, '2', 'badge count is the unread count');
  live.aideChatMode = 'ace';
  await vm.runInContext('aideChatMarkRead(aideChatRowsFromRpc(pack).rows)', live);
  assert.strictEqual(live.badge.hidden, true, 'mark-read clears the badge');
  assert.strictEqual(live.badge.textContent, '', 'cleared badge has no number');
  await vm.runInContext('refreshMsgNavBadge()', live);
  assert.strictEqual(live.badge.hidden, true, 'the same list stays clear after mark-read');

  const newer = boot({
    sbRest: async function(){
      return {success:true, data:[
        {id:'o1', body:'Still on.', sender:'office', created_at:'2026-09-27T14:05:00Z'},
        {id:'n1', body:'New from the office.', sender:'office', created_at:'2026-09-27T16:00:00Z'}
      ]};
    }
  });
  newer.seed = [{id:'o1', body:'Still on.', sender:'office', createdAt:'2026-09-27T14:05:00Z', senderRole:'office'}];
  await vm.runInContext('aideChatRememberMarkedRead([{id:"o1", createdAt:"2026-09-27T14:05:00Z", sender:"office"}]); refreshMsgNavBadge()', newer);
  assert.strictEqual(newer.badge.hidden, false, 'a newer office message shows again');
  assert.strictEqual(newer.badge.textContent, '1', 'only the new message counts');

  const missing = boot({missing:true});
  await vm.runInContext('refreshMsgNavBadge()', missing);
  assert.strictEqual(missing.badge.hidden, true, 'missing list rpc hides the badge');
  assert.strictEqual(missing.badge.textContent, '', 'missing list does not invent a count');
  assert.ok(!missing.calls.some(function(c){return c.q!=='rpc/aide_list_office_messages';}), 'missing list does not call another rpc');

  const sheets = boot({sb:false, data:{success:true, data:rows}});
  await vm.runInContext('refreshMsgNavBadge()', sheets);
  assert.strictEqual(sheets.calls.length, 0, 'sheets rollback does not call the list');
  assert.strictEqual(sheets.badge.hidden, true, 'sheets rollback hides the badge');

  const zero = boot({data:{success:true, data:[{id:'a1', body:'Only me.', sender:'aide', created_at:'2026-09-27T14:00:00Z'}]}});
  await vm.runInContext('refreshMsgNavBadge()', zero);
  assert.strictEqual(zero.badge.hidden, true, 'aide-only thread hides the badge');

  console.log('caregiver-msg-tab1 static checks ok');
  await runBrowser();
})().catch(function(err){
  console.error(err);
  process.exit(1);
});

function loadPuppeteer(){
  try{return require('puppeteer-core');}
  catch(e){
    try{return require('/tmp/cgtest/node_modules/puppeteer-core');}
    catch(e2){return null;}
  }
}

async function runBrowser(){
  if(process.env.SKIP_BROWSER==='1')return;
  const puppeteer = loadPuppeteer();
  if(!puppeteer){
    console.log('caregiver-msg-tab1 browser skipped (no puppeteer-core)');
    return;
  }
  const http = require('http');
  const shotDir = process.env.MSG_TAB_SHOTS || '/opt/cursor/artifacts';
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
    await page.evaluateOnNewDocument(function(){
      const orig = window.fetch.bind(window);
      window.fetch = function(input, init){
        let mode = '';
        try{mode = sessionStorage.getItem('__cgNet') || '';}catch(e){}
        const url = String(input && input.url || input || '');
        if(/script\.google\.com/.test(url))return Promise.reject(new Error('blocked'));
        if(mode && /supabase\.co/.test(url)){
          return Promise.resolve(new Response('[]', {status:200, headers:{'Content-Type':'application/json'}}));
        }
        return orig(input, init);
      };
    });
    await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    page.on('dialog', function(d){d.accept();});
    await page.goto('http://127.0.0.1:'+port+'/index.html?v=care-msg-tab1', {waitUntil:'domcontentloaded', timeout:20000});
    await page.evaluate(function(){
      localStorage.setItem('cg_session', JSON.stringify({
        username:'portal.aide',
        name:'Portal Aide',
        loginAt:Date.now()-60*60*1000,
        mustChangePassword:false,
        needsEmail:false,
        sbAccessToken:'jwt-test',
        sbRefreshToken:'refresh-test',
        sbExpiresAt:Date.now()+60*60*1000
      }));
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_portal.aide','1');
      sessionStorage.setItem('__cgNet','stub');
    });
    await page.reload({waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForFunction(function(){
      return document.getElementById('caregiverScreen').classList.contains('active');
    }, {timeout:8000});
    const tabs = await page.$$eval('#bottomNav button', function(btns){
      return btns.map(function(b){return b.getAttribute('data-nav');});
    });
    assert.deepStrictEqual(tabs, ['home','timesheet','messages','inservices','more']);
    const labels = await page.$$eval('#bottomNav button>span:last-child', function(nodes){
      return nodes.map(function(n){return n.textContent;});
    });
    assert.deepStrictEqual(labels, ['Home','Timesheet','Messages','Inservices','More']);
    assert.strictEqual(await page.$('#aideChatHomeCard'), null, 'messages card is not on home');
    assert.ok(await page.$('#callOffHomeCard'), 'call off card stays');
    const off = await page.$eval('#msgNavBadge', function(el){
      const style = getComputedStyle(el);
      return {hidden:el.hidden, text:el.textContent, pe:style.pointerEvents, bg:style.backgroundColor};
    });
    assert.strictEqual(off.hidden, true, 'sheets mode hides the badge');
    assert.strictEqual(off.text, '', 'hidden badge has no count');
    assert.strictEqual(off.pe, 'none', 'badge does not take taps');
    assert.strictEqual(off.bg, 'rgb(255, 59, 48)', 'badge is #ff3b30');
    const fit = await page.$eval('#bottomNav', function(el){
      return {
        scroll:el.scrollWidth,
        client:el.clientWidth,
        heights:Array.prototype.map.call(el.querySelectorAll('button>span:last-child'), function(n){return n.getBoundingClientRect().height;})
      };
    });
    assert.ok(fit.scroll <= fit.client + 1, 'five tabs fit without sideways scroll');
    assert.ok(fit.heights.every(function(h){return h > 0 && h < 20;}), 'tab labels stay on one line');
    await page.click('#bottomNav button[data-nav="messages"]');
    await page.waitForFunction(function(){
      const screen = document.getElementById('messagesScreen');
      const tab = document.querySelector('#bottomNav button[data-nav="messages"]');
      return screen.classList.contains('active') && tab.classList.contains('active');
    }, {timeout:4000});
    await page.click('#bottomNav button[data-nav="home"]');
    await page.waitForFunction(function(){
      return document.getElementById('cgHomeView').style.display !== 'none'
        && document.getElementById('caregiverScreen').classList.contains('active');
    }, {timeout:4000});
    await page.screenshot({path:path.join(shotDir, 'care-msg-tab1-home-badge-off.png')});

    await page.setRequestInterception(true);
    const cors = {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Headers':'*',
      'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',
      'Content-Type':'application/json'
    };
    let thread = [
      {id:'a1', body:'Can I work Friday?', sender:'aide', created_at:'2026-09-27T14:00:00Z'},
      {id:'o1', body:'Friday is still on the schedule.', sender:'office', created_at:'2026-09-27T14:05:00Z', read_by_aide_at:null},
      {id:'r1', body:'Reminder to submit your timesheet.', sender:'remi', created_at:'2026-09-27T14:06:00Z'}
    ];
    let listCalls = 0;
    let markCalls = 0;
    page.on('request', function(req){
      const url = req.url();
      if(/script\.google\.com/.test(url)){req.abort();return;}
      if(!/supabase\.co/.test(url)){req.continue().catch(function(){});return;}
      if(req.method()==='OPTIONS'){
        req.respond({status:204, headers:cors, body:''}).catch(function(){});
        return;
      }
      if(/aide_list_office_messages/.test(url)){
        listCalls += 1;
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true, data:thread.slice()})}).catch(function(){});
        return;
      }
      if(/aide_mark_office_messages_read/.test(url)){
        markCalls += 1;
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true})}).catch(function(){});
        return;
      }
      if(/aide_get_or_create_office_thread/.test(url)){
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true, data:{id:'t1'}})}).catch(function(){});
        return;
      }
      req.respond({status:200, headers:cors, body:'[]'}).catch(function(){});
    });
    await page.evaluate(function(){
      const raw = JSON.parse(localStorage.getItem('cg_session'));
      raw.sbAccessToken = 'test-jwt';
      localStorage.setItem('cg_session', JSON.stringify(raw));
      localStorage.removeItem('evercare_sheets');
      sessionStorage.removeItem('__cgNet');
    });
    await page.goto('http://127.0.0.1:'+port+'/index.html?v=care-msg-tab1', {waitUntil:'domcontentloaded', timeout:20000});
    await page.evaluate(function(){
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_portal.aide','1');
    });
    await page.reload({waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForFunction(function(){
      const badge = document.getElementById('msgNavBadge');
      return badge && badge.hidden === false && badge.textContent === '2';
    }, {timeout:8000});
    const hit = await page.evaluate(function(){
      const badge = document.getElementById('msgNavBadge');
      const rect = badge.getBoundingClientRect();
      const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const tab = el && el.closest ? el.closest('button[data-nav]') : null;
      return tab ? tab.getAttribute('data-nav') : '';
    });
    assert.strictEqual(hit, 'messages', 'tapping the badge hits the Messages tab');
    await page.screenshot({path:path.join(shotDir, 'care-msg-tab1-home-badge-on.png')});
    const navBox = await page.$eval('#bottomNav', function(el){
      const r = el.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    });
    await page.screenshot({
      path:path.join(shotDir, 'care-msg-tab1-nav-badge-on.png'),
      clip:{x:navBox.x, y:Math.max(0, navBox.y - 12), width:navBox.width, height:navBox.height + 12}
    });
    await page.click('#bottomNav button[data-nav="messages"]');
    await page.waitForFunction(function(){
      const screen = document.getElementById('messagesScreen');
      const badge = document.getElementById('msgNavBadge');
      const tab = document.querySelector('#bottomNav button[data-nav="messages"]');
      return screen.classList.contains('active') && tab.classList.contains('active') && badge.hidden === true && /Marked read/.test(document.getElementById('aideChatNote').textContent);
    }, {timeout:8000});
    assert.ok(markCalls >= 1, 'opening Messages marks read');
    assert.ok(listCalls >= 1, 'badge used the list rpc');
    await page.screenshot({path:path.join(shotDir, 'care-msg-tab1-messages-open.png')});
    await page.click('#bottomNav button[data-nav="home"]');
    await page.waitForFunction(function(){
      const badge = document.getElementById('msgNavBadge');
      const home = document.getElementById('cgHomeView');
      return home.style.display !== 'none' && badge.hidden === true;
    }, {timeout:8000});
    thread.push({id:'n1', body:'New office note.', sender:'office', created_at:'2026-09-27T16:00:00Z'});
    await page.evaluate(function(){
      if(typeof refreshMsgNavBadge==='function')return refreshMsgNavBadge();
    });
    await page.waitForFunction(function(){
      const badge = document.getElementById('msgNavBadge');
      return badge.hidden === false && badge.textContent === '1';
    }, {timeout:8000});
    await page.screenshot({path:path.join(shotDir, 'care-msg-tab1-home-badge-new.png')});

    await page.evaluate(function(){
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_portal.aide','1');
    });
    await page.goto('http://127.0.0.1:'+port+'/index.html?v=care-msg-tab1#messages', {waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForFunction(function(){
      return document.getElementById('messagesScreen').classList.contains('active');
    }, {timeout:8000});
  }finally{
    await browser.close();
    server.close();
  }
  console.log('caregiver-msg-tab1 browser checks ok');
}
