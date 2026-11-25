#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const http = require('http');
const {execFileSync} = require('child_process');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sqlPath = path.join(root, 'supabase/migrations/20261125120000_evv_visits_preview.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const scriptStart = html.indexOf('const SHEETS_URL=');
const scriptEnd = html.lastIndexOf('</script>');
assert.ok(scriptStart > 0 && scriptEnd > scriptStart, 'main script');
const scriptFile = path.join('/tmp', 'evv-caregiver-script-check.js');
fs.writeFileSync(scriptFile, html.slice(scriptStart, scriptEnd));
execFileSync(process.execPath, ['--check', scriptFile], {stdio:'inherit'});

const start = html.indexOf('// EVV-PREVIEW-START');
const end = html.indexOf('// EVV-PREVIEW-END');
assert.ok(start > 0 && end > start, 'preview markers');
const block = html.slice(start, end);
assert.ok(!/fetch\s*\(/.test(block), 'clock block does not call fetch');
assert.ok(!/https?:\/\//.test(block), 'clock block has no URL');
assert.ok(!/sandata\.(com|net|io)/i.test(block), 'clock block has no Sandata host');
assert.ok(!/aggregator/i.test(block), 'clock block has no aggregator');
assert.ok(!/service_role/i.test(block), 'clock block has no service role');
assert.ok(!/console\.(log|debug|info|warn|error)/.test(block), 'clock block does not log');
assert.ok(block.includes('Sandata send not connected yet'), 'send label');
const sendTag = (block.match(/<button type="button" class="btn btn-teal btn-full" id="evvSendBtn"[^>]*>/) || [])[0] || '';
assert.ok(sendTag.includes('disabled'), 'send control is disabled in markup');
assert.ok(!/onclick/.test(sendTag), 'send control has no click handler');
assert.ok(block.includes("sbRest('evv_visits"), 'visits use the aide session');
assert.ok(block.includes('evv=1'), 'flag is ?evv=1');
assert.ok(/This phone did not share its location/.test(block), 'plain denial message');

assert.ok(!/sandata\.(com|net|io)|hhaexchange|evv\.ohio|aggregator\./i.test(html), 'page has no EVV vendor host');
assert.ok(html.includes('id="sandataModal"'), 'Sandata reminder stays');
assert.ok(html.includes("Don't forget to <strong>clock in AND clock out</strong> using <strong>Sandata</strong>"), 'Sandata reminder copy stays');
assert.ok(html.includes('onclick="ackSandata()"'), 'Sandata ack stays');
assert.ok(html.includes('id="evvHomeTap" hidden'), 'clock tap is hidden without the flag');
assert.ok(html.includes('>Clock</button>'), 'home clock tap');
assert.ok(html.includes('>My Inservices'), 'inservices tap stays');
assert.ok(html.includes('id="callOffHomeBtn"'), 'call off stays');
const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-10-08-sec1-cg2">', 'cache token meta stays first');

assert.ok(/enable row level security/i.test(sql), 'RLS on');
assert.ok(/force row level security/i.test(sql), 'RLS forced');
assert.ok(sql.includes('evv_visits_aide_select'), 'aide select policy');
assert.ok(sql.includes('evv_visits_aide_insert'), 'aide insert policy');
assert.ok(sql.includes('evv_visits_aide_update'), 'aide update policy');
assert.ok(sql.includes('evv_visits_office_read'), 'office read policy');
assert.ok(sql.includes('using (org_id = public.current_org_id() and public.is_scheduler_office())'), 'office read uses scheduler helper');
assert.ok(sql.includes('public.is_org_admin()'), 'nurse swap is commented');
assert.ok(/admin, scheduler, or nurse/i.test(sql), 'nurse comment names the wider helper');
assert.ok(!/g\.aide_id = auth\.uid\(\)/.test(sql), 'assignment aide id is aides.id only');
assert.ok(sql.includes('g.aide_id = aide.id'), 'assignment matches the aide row');
assert.ok(sql.includes('g.org_id = aide.org_id'), 'assignment stays in the aide org');
assert.ok(sql.includes('c.org_id = aide.org_id'), 'client stays in the aide org');
assert.ok(/new\.clock_in_at := now\(\)/.test(sql), 'insert time is server now');
assert.ok(/new\.clock_out_at := now\(\)/.test(sql), 'clock-out time is server now');
assert.ok(!/if new\.clock_in_at is null/.test(sql), 'phone clock-in is not kept');
assert.ok(sql.includes('create trigger zz_audit_evv_visits'), 'audit trigger name');
assert.ok(sql.includes('after insert or update or delete on public.evv_visits'), 'audit watches every write');
assert.ok(sql.includes('execute function public._audit_row_change()'), 'audit calls the live helper');
assert.ok(sql.includes('evv_visits_one_open_per_aide'), 'one open visit');
assert.ok(!/create policy evv_visits_aide_delete/i.test(sql), 'no aide delete policy');
assert.ok(/grant select, insert, update/i.test(sql), 'no delete grant');
assert.ok(!/service_role/i.test(sql), 'migration has no service role');
assert.ok(sql.includes('auth.uid()'), 'aide policies use the session user');
assert.ok(sql.includes('Only an open visit can be clocked out'), 'update is clock-out only');
assert.ok(!/clock_in_at:\s*new Date/.test(block), 'client does not send clock-in time');
assert.ok(!/clock_out_at:\s*new Date/.test(block), 'client does not send clock-out time');

const box = {
  location:{search:'?evv=1'},
  Intl:Intl,
  Date:Date,
  Number:Number,
  String:String,
  isFinite:isFinite,
  Object:Object,
  Math:Math,
  encodeURIComponent:encodeURIComponent,
  navigator:{},
  document:{getElementById:function(){return null;}, querySelector:function(){return null;}}
};
vm.createContext(box);
vm.runInContext(block, box);
assert.strictEqual(vm.runInContext('evvPreviewOn()', box), true);
box.location.search = '';
assert.strictEqual(vm.runInContext('evvPreviewOn()', box), false);
box.location.search = '?x=1&evv=1';
assert.strictEqual(vm.runInContext('evvPreviewOn()', box), true);
assert.strictEqual(vm.runInContext('evvRound4(41.44184)', box), 41.4418);
const parts = vm.runInContext('evvNyParts("2026-11-25T14:02:00.000Z")', box);
assert.strictEqual(parts.ymd, '2026-11-25');
assert.strictEqual(parts.hm, '09:02');
assert.strictEqual(parts.dayIndex, 3);
assert.strictEqual(parts.weekStart, '2026-11-22');
assert.strictEqual(parts.clock, '9:02 AM');
const slots = vm.runInContext(`evvPrefillDaySlots([], [{
  status:'ready', client_id:'c',
  clock_in_at:'2026-11-25T14:02:00.000Z',
  clock_out_at:'2026-11-25T16:06:00.000Z'
}], '2026-11-22')`, box);
assert.strictEqual(slots[3].date, '2026-11-25');
assert.strictEqual(slots[3].tin, '09:02');
assert.strictEqual(slots[3].tout, '11:06');
assert.strictEqual(slots[3].fromIn, true);
const kept = vm.runInContext(`evvPrefillDaySlots([{},{},{},{date:'2026-11-25',tin:'08:00',tout:''}], [{
  status:'ready', clock_in_at:'2026-11-25T14:02:00.000Z', clock_out_at:'2026-11-25T16:06:00.000Z'
}], '2026-11-22')[3]`, box);
assert.strictEqual(kept.tin, '08:00');
assert.strictEqual(kept.fromIn, false);
assert.strictEqual(kept.tout, '11:06');
const otherWeek = vm.runInContext(`evvPrefillDaySlots([], [{
  status:'ready', clock_in_at:'2026-11-25T14:02:00.000Z', clock_out_at:'2026-11-25T16:06:00.000Z'
}], '2026-11-01')[3]`, box);
assert.strictEqual(otherWeek.tin, '');
const midWeek = vm.runInContext(`evvPrefillDaySlots([], [{
  status:'ready', clock_in_at:'2026-11-25T14:02:00.000Z', clock_out_at:'2026-11-25T16:06:00.000Z'
}], '2026-11-25')[3]`, box);
assert.strictEqual(midWeek.tin, '09:02');
const aide = '22222222-2222-4222-8222-222222222222';
const other = '66666666-6666-4666-8666-666666666666';
const clientIds = JSON.parse(vm.runInContext('JSON.stringify(evvClientsForAide('+JSON.stringify([
  {id:'a', name:'Dorothy Hale', is_active:true, assignments:[{aide_id:aide, is_active:true}]},
  {id:'b', name:'Someone Else', is_active:true, assignments:[{aide_id:other, is_active:true}]},
  {id:'c', name:'No embed', is_active:true, assignments:[]},
  {id:'d', name:'Profile id only', is_active:true, assignments:[{aide_id:'u', is_active:true}]}
])+','+JSON.stringify({sbAideId:aide, sbUserId:'u'})+').map(function(c){return c.id;}))', box));
assert.deepStrictEqual(clientIds, ['a','c']);
assert.ok(vm.runInContext('evvLocationMessage("denied")', box).indexOf('This phone did not share its location') === 0);
assert.ok(vm.runInContext('evvLocationMessage("denied")', box).indexOf('Settings') > 0);
const note = vm.runInContext(`evvHomeNote([{
  status:'ready', client_id:'a',
  clock_in_at:'2026-11-25T14:02:00.000Z', clock_out_at:'2026-11-25T16:06:00.000Z'
}], 'a', '2026-11-22')`, box);
assert.ok(note.line.indexOf('9:02 AM') > 0 && note.line.indexOf('11:06 AM') > 0);
assert.strictEqual(vm.runInContext('evvFriendlyError({pack:{status:404}, message:"Could not find evv_visits"})', box).indexOf('Nothing was sent.') > 0, true);

console.log('caregiver-evv-preview1 static checks ok');

const USER = '11111111-1111-4111-8111-111111111111';
const AIDE = '22222222-2222-4222-8222-222222222222';
const ORG = '33333333-3333-4333-8333-333333333333';
const CLIENT = '44444444-4444-4444-8444-444444444444';
const OTHER_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_AIDE = '66666666-6666-4666-8666-666666666666';

function b64url(obj){
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
const token = b64url({alg:'none',typ:'JWT'})+'.'+b64url({sub:USER,role:'authenticated',exp:9999999999})+'.sig';

function startServer(port){
  const srv = http.createServer(function(req, res){
    const url = new URL(req.url, 'http://127.0.0.1:'+port);
    let rel = decodeURIComponent(url.pathname);
    if(rel === '/')rel = '/index.html';
    const file = path.normalize(path.join(root, rel));
    if(file !== root && !file.startsWith(root+path.sep)){
      res.writeHead(403);res.end();return;
    }
    fs.readFile(file, function(err, buf){
      if(err){res.writeHead(404);res.end('missing');return;}
      const ext = path.extname(file);
      const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.css':'text/css'};
      res.writeHead(200, {'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(buf);
    });
  });
  return new Promise(function(resolve){srv.listen(port, '127.0.0.1', function(){resolve(srv);});});
}

async function runBrowser(){
  const puppeteer = require('/tmp/evvtest/node_modules/puppeteer-core');
  const port = 8766;
  const srv = await startServer(port);
  const shotDir = '/opt/cursor/artifacts/evv-preview';
  fs.mkdirSync(shotDir, {recursive:true});
  const state = {visits:[], bad:[], methods:[], writes:[]};
  const browser = await puppeteer.launch({
    executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
    headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']
  });
  try{
    await browser.defaultBrowserContext().overridePermissions('http://127.0.0.1:'+port, ['geolocation']);
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    await page.setGeolocation({latitude:41.4418, longitude:-81.7162, accuracy:10});
    await arm(page, state, false);
    await seed(page, port, true);
    await page.setViewport({width:390, height:844, deviceScaleFactor:2});
    await page.goto('http://127.0.0.1:'+port+'/index.html', {waitUntil:'domcontentloaded'});
    await reachHome(page);
    const hidden = await page.$eval('#evvHomeTap', function(el){return el.hasAttribute('hidden');});
    assert.strictEqual(hidden, true, 'flag off keeps the clock tap hidden');

    await page.evaluate(function(){
      sessionStorage.removeItem('sandata_ack_session');
      sessionStorage.removeItem('notice_ack_amina.hassan');
    });
    await shotFlow(page, port, 'phone', {width:390, height:844, deviceScaleFactor:2}, shotDir, state, true);

    const desk = await browser.newPage();
    desk.setDefaultTimeout(20000);
    await desk.setGeolocation({latitude:41.4418, longitude:-81.7162, accuracy:10});
    await arm(desk, state, false);
    await seed(desk, port, true);
    await shotFlow(desk, port, 'desktop', {width:1280, height:900, deviceScaleFactor:1}, shotDir, state, false);
    await desk.close();

    const denied = await browser.newPage();
    denied.setDefaultTimeout(20000);
    await arm(denied, state, true);
    await seed(denied, port, true);
    await denied.setViewport({width:390, height:844, deviceScaleFactor:2});
    state.visits.length = 0;
    const before = state.methods.filter(function(m){return m.method==='POST'&&m.url.indexOf('evv_visits')>=0;}).length;
    await denied.goto('http://127.0.0.1:'+port+'/index.html?evv=1', {waitUntil:'domcontentloaded'});
    await reachHome(denied);
    await denied.waitForSelector('#evvHomeClockBtn', {visible:true});
    await denied.click('#evvHomeClockBtn');
    await denied.waitForSelector('#evvClient');
    await denied.waitForFunction(function(id){
      const sel=document.getElementById('evvClient');
      return sel && Array.from(sel.options).some(function(o){return o.value===id;});
    }, {}, CLIENT);
    await denied.select('#evvClient', CLIENT);
    await denied.select('#evvService', 'Personal care');
    await denied.waitForFunction(function(){
      const box=document.getElementById('evvLocBox');
      return box && /did not share its location/.test(box.textContent||'');
    });
    await denied.click('#evvInBtn');
    await denied.waitForFunction(function(){
      var box=document.getElementById('evvLocBox');
      var alert=document.getElementById('evvAlert');
      var alertHidden=!alert||alert.hidden;
      return box && /did not share its location/.test(box.textContent||'') && alertHidden && (box.textContent.match(/did not share its location/g)||[]).length===1;
    });
    const after = state.methods.filter(function(m){return m.method==='POST'&&m.url.indexOf('evv_visits')>=0;}).length;
    assert.strictEqual(after, before, 'denied location does not save a visit');
    await denied.screenshot({path:path.join(shotDir, 'phone-location-denied.png')});
    await denied.close();

    assert.strictEqual(state.bad.length, 0, 'unexpected vendor request: '+state.bad.join(' | '));
    const vendor = state.methods.filter(function(m){
      return /sandata\.|aggregator|hhaexchange|evv\.ohio|ohio\.gov\/evv/i.test(m.url);
    });
    assert.deepStrictEqual(vendor, []);
    console.log('caregiver-evv-preview1 browser ok');
  }finally{
    await browser.close();
    await new Promise(function(resolve){srv.close(resolve);});
  }
}

async function arm(page, state, denyGeo){
  await page.setRequestInterception(true);
  page.on('request', function(req){
    const u = req.url();
    const method = req.method();
    state.methods.push({url:u, method:method});
    if(/sandata\.|aggregator|hhaexchange|evv\.ohio|nominatim|ohio\.gov/i.test(u)){
      state.bad.push(method+' '+u);
      req.abort().catch(function(){});
      return;
    }
    if(u.indexOf('supabase.co') >= 0){
      mockSupabase(req, state).catch(function(){req.abort().catch(function(){});});
      return;
    }
    if(/^http:\/\/127\.0\.0\.1:8766/.test(u) || /^http:\/\/localhost:8766/.test(u) || /fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare/.test(u)){
      req.continue().catch(function(){});
      return;
    }
    req.abort().catch(function(){});
  });
  await page.evaluateOnNewDocument(function(deny){
    if(navigator.serviceWorker){
      navigator.serviceWorker.register = function(){return Promise.resolve({update:function(){return Promise.resolve();}});};
      navigator.serviceWorker.getRegistration = function(){return Promise.resolve(null);};
    }
    if(deny && navigator.geolocation){
      navigator.geolocation.getCurrentPosition = function(_ok, err){
        if(typeof err === 'function')err({code:1});
      };
    }
  }, denyGeo);
  page.on('dialog', function(d){d.accept().catch(function(){});});
  page.on('pageerror', function(err){console.log('pageerror', err.message);});
}

function mockSupabase(req, state){
  const u = req.url();
  const method = req.method();
  if(method === 'OPTIONS'){
    return req.respond({status:204, headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}});
  }
  let body = null;
  if(method === 'POST' || method === 'PATCH'){
    try{body = JSON.parse(req.postData()||'{}');}catch(e){body = {};}
  }
  let data = [];
  if(u.indexOf('/rest/v1/rpc/') >= 0){
    const name = u.split('/rest/v1/rpc/')[1].split('?')[0];
    if(name === 'my_inservice_topics')data = [{topic_id:'1', topic_title:'Complications of Diabetes: Prevention and Care'}];
    else if(name === 'get_active_broadcast')data = {success:true, data:null};
    else data = [];
  }else if(u.indexOf('/rest/v1/clients') >= 0){
    const dorothy = {id:CLIENT, name:'Dorothy Hale', lat:41.4418, lng:-81.7162, is_active:true, assignments:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', is_active:true, aide_id:AIDE, client_id:CLIENT}]};
    const someone = {id:OTHER_ID, name:'Someone Else', lat:0, lng:0, is_active:true, assignments:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', is_active:true, aide_id:OTHER_AIDE, client_id:OTHER_ID}]};
    if(u.indexOf('assignments.aide_id=eq.'+encodeURIComponent(AIDE)) >= 0 || u.indexOf('assignments.aide_id=eq.'+AIDE) >= 0)data = [dorothy];
    else if(u.indexOf('assignments.aide_id=eq.') >= 0)data = [];
    else data = [dorothy, someone];
  }else if(u.indexOf('/rest/v1/evv_visits') >= 0){
    if(method === 'DELETE'){
      state.bad.push('DELETE evv_visits');
      data = [];
    }else if(method === 'POST'){
      state.writes.push({method:'POST', body:body||{}});
      const row = Object.assign({
        id:'77777777-7777-4777-8777-777777777777',
        status:'open',
        out_lat:null,
        out_lng:null
      }, body||{});
      row.id = '77777777-7777-4777-8777-' + String(state.visits.length+1).padStart(12,'0');
      row.status = 'open';
      row.clock_in_at = new Date().toISOString();
      row.clock_out_at = null;
      state.visits.push(row);
      data = [row];
    }else if(method === 'PATCH'){
      state.writes.push({method:'PATCH', body:body||{}});
      const idMatch = /id=eq\.([^&]+)/.exec(u);
      const id = idMatch ? decodeURIComponent(idMatch[1]) : '';
      const row = state.visits.find(function(v){return v.id===id && v.status==='open';});
      if(!row)data = [];
      else{
        const clockIn = row.clock_in_at;
        Object.assign(row, body||{});
        row.clock_in_at = clockIn;
        row.status = 'ready';
        row.clock_out_at = new Date().toISOString();
        data = [row];
      }
    }else{
      data = state.visits.filter(function(v){
        if(u.indexOf('status=eq.open')>=0 && v.status!=='open')return false;
        if(u.indexOf('status=eq.ready')>=0 && v.status!=='ready')return false;
        const client = /client_id=eq\.([^&]+)/.exec(u);
        if(client && v.client_id!==decodeURIComponent(client[1]))return false;
        const aide = /aide_user_id=eq\.([^&]+)/.exec(u);
        if(aide && v.aide_user_id!==decodeURIComponent(aide[1]))return false;
        return true;
      });
    }
  }else if(u.indexOf('/auth/v1/') >= 0){
    data = {access_token:token, refresh_token:'refresh-test', expires_in:3600, token_type:'bearer'};
  }
  return req.respond({
    status:200,
    contentType:'application/json',
    headers:{'Access-Control-Allow-Origin':'*'},
    body:JSON.stringify(data)
  });
}

async function seed(page, port, ack){
  const sess = {
    username:'amina.hassan',
    name:'Amina Hassan',
    loginAt:Date.now(),
    mustChangePassword:false,
    needsEmail:false,
    sbAccessToken:token,
    sbRefreshToken:'refresh-test',
    sbExpiresAt:Date.now()+8*60*60*1000,
    sbUserId:USER,
    sbAideId:AIDE,
    sbOrgId:ORG,
    email:'aide.preview@example.test'
  };
  await page.goto('http://127.0.0.1:'+port+'/index.html?evv=1', {waitUntil:'domcontentloaded'});
  await page.evaluate(function(s, ackNow){
    localStorage.setItem('cg_session', JSON.stringify(s));
    if(ackNow){
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_amina.hassan','1');
    }
  }, sess, ack);
}

async function reachHome(page, opts){
  opts = opts || {};
  const start = Date.now();
  var last = '';
  while(Date.now() - start < 20000){
    const mode = await page.evaluate(function(){
      var addr = document.getElementById('homeAddrScreen');
      if(addr && addr.classList.contains('active'))return 'addr';
      var sandata = document.getElementById('sandataModal');
      if(sandata && sandata.classList.contains('show'))return 'sandata';
      var notice = document.getElementById('alertModal');
      if(notice && notice.classList.contains('show'))return 'notice';
      var screen = document.getElementById('caregiverScreen');
      var home = document.getElementById('cgHomeView');
      if(screen && screen.classList.contains('active') && home && home.style.display !== 'none')return 'home';
      return '';
    });
    last = mode;
    if(mode === 'sandata'){
      if(opts.shotSandata)await page.screenshot({path:opts.shotSandata});
      await page.click('#sandataModal .mbtn-confirm');
    }else if(mode === 'notice'){
      await page.click('#alertModal .mbtn-confirm');
    }else if(mode === 'home')return;
    await new Promise(function(r){setTimeout(r, 150);});
  }
  throw new Error('home did not open ('+last+')');
}

async function shotFlow(page, port, label, viewport, shotDir, state, sandataShot){
  await page.setViewport(viewport);
  state.visits.length = 0;
  state.writes.length = 0;
  await page.evaluate(function(){
    var keep=localStorage.getItem('cg_session');
    localStorage.clear();
    if(keep)localStorage.setItem('cg_session', keep);
  });
  await page.goto('http://127.0.0.1:'+port+'/index.html?evv=1', {waitUntil:'domcontentloaded'});
  if(sandataShot){
    await reachHome(page, {shotSandata:path.join(shotDir, label+'-sandata-reminder.png')});
  }else{
    await reachHome(page);
  }
  await page.waitForSelector('#evvHomeClockBtn', {visible:true});
  await page.click('#evvHomeClockBtn');
  await page.waitForSelector('#evvClient');
  await page.waitForFunction(function(id, other){
    const sel=document.getElementById('evvClient');
    if(!sel)return false;
    const values=Array.from(sel.options).map(function(o){return o.value;});
    return values.indexOf(id)>=0 && values.indexOf(other)<0;
  }, {}, CLIENT, OTHER_ID);
  const aideText = await page.$eval('#evvAideName', function(el){return el.textContent;});
  assert.strictEqual(aideText, 'Amina Hassan');
  assert.strictEqual(await page.$('#evvAideName input'), null);
  await page.select('#evvClient', CLIENT);
  await page.select('#evvService', 'Personal care');
  await page.waitForFunction(function(){
    const box=document.getElementById('evvLocBox');
    return box && /41\.4418/.test(box.textContent||'') && /not a map/i.test(box.textContent||'');
  });
  await page.screenshot({path:path.join(shotDir, label+'-clock-in.png')});
  const postsBefore = state.visits.length;
  await page.click('#evvInBtn');
  await page.waitForSelector('#evvOutBtn', {visible:true});
  assert.strictEqual(state.visits.length, postsBefore+1, 'clock in saved one visit');
  assert.strictEqual(state.visits[state.visits.length-1].status, 'open');
  assert.strictEqual(state.visits[state.visits.length-1].client_id, CLIENT);
  assert.strictEqual(state.visits[state.visits.length-1].service_name, 'Personal care');
  const posted = state.writes.filter(function(w){return w.method==='POST';}).pop();
  assert.ok(posted, 'clock in posted a visit');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(posted.body, 'clock_in_at'), false, 'clock in leaves the time to the server');
  const shownIn = await page.$eval('.evv-live', function(el){return el.textContent;});
  const serverIn = await page.evaluate(function(iso){return evvNyParts(iso).clock;}, state.visits[state.visits.length-1].clock_in_at);
  assert.ok(shownIn.indexOf(serverIn) >= 0, 'clock-out screen shows the server clock-in');
  const locked = await page.$$eval('#evvClockBody select', function(nodes){return nodes.length;});
  assert.strictEqual(locked, 0, 'clock out locks the visit fields');
  await page.waitForFunction(function(){
    const box=document.getElementById('evvLocBox');
    return box && /41\.4418/.test(box.textContent||'');
  });
  await page.screenshot({path:path.join(shotDir, label+'-clock-out.png')});
  await page.click('#evvOutBtn');
  await page.waitForSelector('#evvSendBtn');
  const send = await page.$eval('#evvSendBtn', function(btn){
    return {disabled:btn.disabled, text:btn.textContent, onclick:btn.getAttribute('onclick')};
  });
  assert.strictEqual(send.disabled, true);
  assert.strictEqual(send.text, 'Sandata send not connected yet');
  assert.strictEqual(send.onclick, null);
  assert.strictEqual(state.visits[state.visits.length-1].status, 'ready');
  assert.ok(state.visits[state.visits.length-1].clock_out_at);
  const patched = state.writes.filter(function(w){return w.method==='PATCH';}).pop();
  assert.ok(patched, 'clock out patched the open visit');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(patched.body, 'clock_out_at'), false, 'clock out leaves the time to the server');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(patched.body, 'clock_in_at'), false, 'clock out does not resend the in time');
  const shownTimes = await page.$$eval('.evv-timebox .v', function(els){return els.map(function(el){return el.textContent;});});
  const serverTimes = await page.evaluate(function(row){
    return {inn:evvNyParts(row.clock_in_at).clock, out:evvNyParts(row.clock_out_at).clock};
  }, state.visits[state.visits.length-1]);
  assert.deepStrictEqual(shownTimes, [serverTimes.inn, serverTimes.out], 'ready screen shows the server times');
  const methodsBefore = state.methods.length;
  await page.$eval('#evvSendBtn', function(btn){btn.click();});
  await new Promise(function(r){setTimeout(r, 300);});
  const extra = state.methods.slice(methodsBefore).filter(function(m){return m.url.indexOf('evv_visits')>=0 || /sandata|aggregator/i.test(m.url);});
  assert.deepStrictEqual(extra, [], 'send button makes no request');
  await page.screenshot({path:path.join(shotDir, label+'-ready.png')});

  await page.click('#caregiverScreen .hdr-back');
  await page.waitForSelector('#cgTSList');
  await page.click('[data-nav="timesheet"]');
  await page.waitForSelector('#cg_client');
  await page.waitForFunction(function(id){
    const sel=document.getElementById('cg_client');
    return sel && Array.from(sel.options).some(function(o){return o.value===id;});
  }, {}, CLIENT);
  await page.select('#cg_client', CLIENT);
  await page.evaluate(function(){if(typeof onClientSelected==='function')onClientSelected();});
  await page.waitForFunction(function(){
    for(var i=0;i<7;i++){
      var inn=document.getElementById('d'+i+'_in');
      var out=document.getElementById('d'+i+'_out');
      if(inn && inn.value && out && out.value)return true;
    }
    return false;
  });
  const filled = await page.evaluate(function(row){
    var expectIn = evvNyParts(row.clock_in_at);
    var expectOut = evvNyParts(row.clock_out_at);
    for(var i=0;i<7;i++){
      var inn=document.getElementById('d'+i+'_in');
      var out=document.getElementById('d'+i+'_out');
      if(inn && inn.value===expectIn.hm && out && out.value===expectOut.hm){
        return {
          i:i,
          date:document.getElementById('d'+i+'_date').value,
          readOnly:inn.readOnly||inn.disabled,
          from:!!document.getElementById('evv_from_'+i)
        };
      }
    }
    return null;
  }, state.visits[state.visits.length-1]);
  assert.ok(filled, 'timesheet prefilled from the clock');
  assert.strictEqual(filled.readOnly, false, 'prefilled times stay editable');
  assert.strictEqual(filled.from, true, 'from the clock hint');
  await page.evaluate(function(i){
    var body=document.getElementById('dbody_'+i);
    if(body && !body.classList.contains('open'))toggleDay(i);
    var block=document.getElementById('db_'+i);
    if(block && block.scrollIntoView)block.scrollIntoView({block:'center'});
  }, filled.i);
  await page.screenshot({path:path.join(shotDir, label+'-timesheet.png')});
  await page.focus('#d'+filled.i+'_in');
  await page.evaluate(function(i){
    var el=document.getElementById('d'+i+'_in');
    el.focus();
    el.value='08:15';
    el.dispatchEvent(new Event('input', {bubbles:true}));
  }, filled.i);
  const edited = await page.$eval('#d'+filled.i+'_in', function(el){
    return {value:el.value, marked:el.getAttribute('data-evv')};
  });
  assert.strictEqual(edited.value, '08:15');
  assert.strictEqual(edited.marked, null);

  await page.click('#caregiverScreen .hdr-back');
  await page.waitForSelector('.evv-home-times');
  await page.screenshot({path:path.join(shotDir, label+'-home.png')});
  const inserviceTap = await page.$eval('#cgHomeView', function(home){
    return Array.from(home.querySelectorAll('button')).some(function(b){return /My Inservices/.test(b.textContent||'');});
  });
  assert.strictEqual(inserviceTap, true, 'home keeps My Inservices');
  await page.evaluate(function(){
    var btn=Array.from(document.querySelectorAll('#cgHomeView button')).find(function(b){return /My Inservices/.test(b.textContent||'');});
    if(btn)btn.click();
  });
  await page.waitForFunction(function(){
    var screen=document.getElementById('inserviceScreen');
    var list=document.getElementById('isTopicList');
    return screen && screen.classList.contains('active') && list && /Diabetes/.test(list.innerText||'');
  });
  await page.screenshot({path:path.join(shotDir, label+'-inservices.png')});
}

runBrowser().catch(function(err){
  console.error(err);
  process.exit(1);
});
