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
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-09-28-aide-home-addr1">', 'aide-home-addr1 meta is first');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-care-msg-safe1">') > 0, 'care-msg-safe1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-punch-leftovers1">') > 0, 'punch-leftovers1 meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-28-aide-home-addr1 v=aide-home-addr1 ?v=aide-home-addr1 —'), 'aide-home-addr1 comment');
assert.ok(html.includes('?v=aide-home-addr1'), 'cache bust query');
assert.ok(html.includes('data-home-addr="v=aide-home-addr1"'), 'gate marker');
assert.ok(html.includes('data-cache="?v=aide-home-addr1"'), 'cache bust on the gate');
const tip = html.slice(html.indexOf('<!-- caregiver-build: 2026-09-28-aide-home-addr1'), html.indexOf('<!-- caregiver-build: 2026-09-28-care-msg-safe1'));
assert.ok(tip.includes('MERGE HOLD') && tip.includes('Do not claim LIVE'), 'merge hold');
assert.ok(tip.includes('CALLABLE'), 'Ace is callable');
assert.ok(!/CONTRACT-v1 is LIVE/.test(tip), 'this tip does not claim live');
assert.ok(tip.includes('aide_get_home_address') && tip.includes('aide_save_home_address'), 'rpc names documented');
assert.ok(tip.includes('p_home_address') && tip.includes('p_lat') && tip.includes('p_lng'), 'save args documented');
assert.ok(tip.includes('No new SQL'), 'no new sql');
assert.ok(tip.includes('MM/DD/YYYY'), 'dates people read');
assert.ok(html.includes('v=care-msg-safe1') && html.includes('v=punch-leftovers1') && html.includes('v=coveraide2') && html.includes('v=offline1'), 'prior markers stay');
assert.ok(html.includes('<footer>5510 Pearl Rd Ste 200, Cleveland, OH 44129'), 'site footer stays');
assert.ok(html.includes('function showTempMsg(msg,color)'), 'login toast stays');
assert.ok(html.includes('id="callOffSubmitBtn"'), 'cover submit stays');
assert.ok(html.includes("navigator.geolocation.getCurrentPosition"), 'punch GPS stays');

const gate = html.slice(html.indexOf('id="homeAddrScreen"'), html.indexOf('<!-- LOCATION PERMISSION'));
assert.ok(gate.includes('Where do you live?'), 'title');
assert.ok(gate.includes('CAREGIVER · EVERCARE'), 'brand line');
assert.ok(gate.includes('>Street address'), 'street label');
assert.ok(gate.includes('>City'), 'city label');
assert.ok(gate.includes('>State'), 'state label');
assert.ok(gate.includes('>ZIP'), 'zip label');
assert.ok(gate.includes('>Continue<'), 'continue');
assert.ok(gate.includes('homeaddr-ico-house') && gate.includes('homeaddr-ico-pin'), 'both marks');
assert.ok(!/nearby|near-rank|Cover rank|why we/i.test(gate), 'no why-copy on the gate');
assert.ok(html.includes('#homeAddrScreen.homeaddr-signup{background:#2a7f7f;}'), 'signup teal');
assert.ok(html.includes('#homeAddrScreen.homeaddr-missing{background:#1a2744;}'), 'missing navy');
assert.ok(html.includes('body.homeaddr-gate footer{display:none !important;}'), 'footer hides only while the gate is up');
assert.ok(html.includes('nominatim.openstreetmap.org/search'), 'client geocode');

const geoFn = extractFn(html, 'async function homeAddrGeocode(parts)');
assert.ok(!/getGpsPosition|navigator\.geolocation/.test(geoFn), 'home geocode is not punch GPS');
const gpsFn = extractFn(html, 'function getGpsPosition()');
assert.ok(gpsFn.includes('navigator.geolocation.getCurrentPosition'), 'punch GPS function stays');

const afterLogin = extractFn(html, 'function afterLogin(opts)');
assert.ok(afterLogin.includes('if(aideSetupRequired())'), 'setup gate still first');
assert.ok(afterLogin.indexOf('loadCaregiverScreen()') > afterLogin.indexOf('aideSetupRequired()'), 'home load stays behind setup');
assert.ok(afterLogin.indexOf('beginHomeAddrGate()') > afterLogin.indexOf('aideSetupRequired()'), 'address gate is after setup');
assert.ok(afterLogin.indexOf('beginHomeAddrGate()') < afterLogin.indexOf('loadCaregiverScreen()'), 'address gate is before home');
assert.ok(!/await\s+/.test(afterLogin), 'afterLogin does not await');
assert.ok(!/supabase/i.test(afterLogin), 'afterLogin does not name supabase');

const helpers = [
  extractFn(html, 'function aideTruth(v)'),
  extractFn(html, 'function homeAddrUnwrap(data)'),
  extractFn(html, 'function homeAddrNum(v)'),
  extractFn(html, 'function homeAddrPick(node, keys)'),
  extractFn(html, 'function homeAddrNormalize(data)'),
  extractFn(html, 'function homeAddrShouldBlock(rec)'),
  extractFn(html, 'function homeAddrFirstKey()'),
  extractFn(html, 'function homeAddrIsFirstLogin()'),
  extractFn(html, 'function homeAddrLook(rec)'),
  extractFn(html, 'function homeAddrSplit(address)'),
  extractFn(html, 'function homeAddrPartsFrom(rec)'),
  extractFn(html, 'function homeAddrLine(parts)'),
  extractFn(html, 'function homeAddrSaveOk(data)')
].join('\n');

const mem = {};
const ctx = {
  currentUser: {username:'ada'},
  localStorage: {
    getItem: function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
    setItem: function(k, v){mem[k] = String(v);},
    removeItem: function(k){delete mem[k];}
  }
};
vm.createContext(ctx);
vm.runInContext(helpers, ctx);
const api = vm.runInContext('({homeAddrNormalize, homeAddrShouldBlock, homeAddrLook, homeAddrSplit, homeAddrLine, homeAddrSaveOk})', ctx);

const missing = api.homeAddrNormalize({success:true, data:{gate_required:true, home_address:null, home_lat:null, home_lng:null}});
assert.strictEqual(api.homeAddrShouldBlock(missing), true, 'gate_required blocks');
assert.strictEqual(missing.sawCoords, true, 'null coords still count as present keys');
const coordsOnly = api.homeAddrNormalize({home_lat:null, home_lng:null, gate_required:false, home_address:'123 Maple Ave, Cleveland, OH 44115'});
assert.strictEqual(api.homeAddrShouldBlock(coordsOnly), true, 'missing lat/lng blocks even when the flag is false');
assert.strictEqual(api.homeAddrLook(coordsOnly), 'missing', 'existing address without coords is the navy gate');
const saved = api.homeAddrNormalize({success:true, data:{gate_required:false, home_lat:'41.4993', home_lng:'-81.6944', home_address:'123 Maple Ave, Cleveland, OH 44115'}});
assert.strictEqual(api.homeAddrShouldBlock(saved), false, 'saved coords pass');
assert.strictEqual(saved.lat, 41.4993);
assert.strictEqual(saved.lng, -81.6944);
assert.strictEqual(api.homeAddrShouldBlock(api.homeAddrNormalize([])), false, 'empty list is not a gate');
assert.strictEqual(api.homeAddrShouldBlock(api.homeAddrNormalize({success:true, data:null})), false, 'empty success is not a gate');
assert.strictEqual(api.homeAddrShouldBlock({skipped:true}), false, 'a skipped read does not trap home');
const first = api.homeAddrNormalize({gate_required:true, first_login:true, home_lat:null, home_lng:null});
assert.strictEqual(api.homeAddrLook(first), 'signup', 'first login uses the teal gate');
ctx.localStorage.setItem('evercare_homeaddr_first_ada', '1');
assert.strictEqual(api.homeAddrLook(coordsOnly), 'signup', 'finish-account flag uses the teal gate');
const parts = api.homeAddrSplit('123 Maple Ave, Cleveland, OH 44115');
assert.strictEqual(JSON.stringify(parts), JSON.stringify({street:'123 Maple Ave', city:'Cleveland', state:'OH', zip:'44115'}));
assert.strictEqual(api.homeAddrLine({street:'123 Maple Ave', city:'Cleveland', state:'OH', zip:'44115'}), '123 Maple Ave, Cleveland, OH 44115');
assert.strictEqual(api.homeAddrSaveOk({success:true}), true);
assert.strictEqual(api.homeAddrSaveOk({success:false, error:'no'}), false);
assert.strictEqual(api.homeAddrSaveOk({home_lat:1, home_lng:2}), true);

const week = extractFn(html, 'function formatWeekOfLabel(val)');
const weekFn = vm.runInContext(week + '\nformatWeekOfLabel', ctx);
assert.strictEqual(weekFn('2026-09-28'), 'Week of 09/28/2026', 'dates people read stay MM/DD/YYYY');

console.log('caregiver-aide-home-addr1 static checks ok');

async function runBrowser(){
  if(process.env.SKIP_BROWSER === '1')return;
  let puppeteer;
  try{puppeteer = require('puppeteer-core');}
  catch(e){
    try{puppeteer = require('/tmp/cgtest/node_modules/puppeteer-core');}
    catch(e2){puppeteer = null;}
  }
  if(!puppeteer){
    console.log('puppeteer-core missing; static checks only');
    return;
  }
  const http = require('http');
  const shotDir = process.env.HOMEADDR_SHOTS || '/tmp/aide-home-addr1-shots';
  fs.mkdirSync(shotDir, {recursive:true});
  const root = __dirname;
  const server = http.createServer(function(req, res){
    const url = (req.url || '/').split('?')[0];
    const rel = url === '/' ? 'index.html' : url.replace(/^\//, '');
    const file = path.join(root, rel);
    if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
    fs.readFile(file, function(err, buf){
      if(err){res.writeHead(404);res.end('missing');return;}
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'});
      res.end(buf);
    });
  });
  await new Promise(function(resolve){server.listen(0, '127.0.0.1', resolve);});
  const port = server.address().port;
  const chrome = process.env.CHROME_PATH || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : '/usr/local/bin/google-chrome');
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try{
    const page = await browser.newPage();
    await page.setViewport({width:390, height:844, deviceScaleFactor:2, isMobile:true, hasTouch:true});
    page.on('pageerror', function(err){console.log('PAGEERROR', err && err.message);});
    await page.evaluateOnNewDocument(function(){
      var preset = null;
      try{preset = JSON.parse(localStorage.getItem('__homeAddrGet') || 'null');}catch(e){preset = null;}
      window.__homeAddr = {get:preset, saves:[], geos:[]};
      const orig = window.fetch.bind(window);
      window.fetch = function(url, init){
        const u = String(url);
        if(u.indexOf('nominatim.openstreetmap.org') !== -1){
          window.__homeAddr.geos.push(u);
          return Promise.resolve(new Response(JSON.stringify([{lat:'41.4993', lon:'-81.6944', display_name:'123 Maple Ave, Cleveland'}]), {status:200, headers:{'Content-Type':'application/json'}}));
        }
        if(u.indexOf('supabase.co') === -1)return orig(url, init);
        let body = {};
        try{body = init && init.body ? JSON.parse(init.body) : {};}catch(e){body = {};}
        let data = {success:true, data:null};
        if(u.indexOf('rpc/aide_get_home_address') !== -1){
          data = window.__homeAddr.get || {success:true, gate_required:false, home_lat:41.49, home_lng:-81.69, home_address:'1 Main St, Cleveland, OH 44115'};
        }else if(u.indexOf('rpc/aide_save_home_address') !== -1){
          window.__homeAddr.saves.push(body);
          data = {success:true, home_address:body.p_home_address, home_lat:body.p_lat, home_lng:body.p_lng};
        }
        return Promise.resolve(new Response(JSON.stringify(data), {status:200, headers:{'Content-Type':'application/json'}}));
      };
    });

    const origin = 'http://127.0.0.1:' + port;
    async function boot(opts){
      opts = opts || {};
      await page.goto(origin + '/index.html?v=aide-home-addr1' + (opts.search || ''), {waitUntil:'domcontentloaded', timeout:20000});
      await page.evaluate(function(o){
        localStorage.clear();
        sessionStorage.clear();
        if(o.sheets)localStorage.setItem('evercare_sheets', '1');
        if(o.first)localStorage.setItem('evercare_homeaddr_first_ada', '1');
        if(o.session !== false){
          localStorage.setItem('cg_session', JSON.stringify({
            username:'ada',
            name:'Ada Cole',
            loginAt:Date.now() - 60 * 60 * 1000,
            mustChangePassword:false,
            needsEmail:false,
            sbAccessToken: o.sheets ? '' : 'test-jwt'
          }));
        }
        sessionStorage.setItem('sandata_ack_session', '1');
        sessionStorage.setItem('notice_ack_ada', '1');
        if(o.get)localStorage.setItem('__homeAddrGet', JSON.stringify(o.get));
        else localStorage.removeItem('__homeAddrGet');
      }, opts);
      await page.reload({waitUntil:'domcontentloaded', timeout:20000});
    }

    await boot({
      get:{success:true, data:{gate_required:true, home_address:'123 Maple Ave, Cleveland, OH 44115', home_lat:null, home_lng:null}}
    });
    await page.waitForFunction(function(){
      const el = document.getElementById('homeAddrScreen');
      const nav = document.getElementById('bottomNav');
      const home = document.getElementById('caregiverScreen');
      return el && el.classList.contains('active') && el.classList.contains('homeaddr-missing') && !el.classList.contains('homeaddr-checking') && nav.hidden === true && !home.classList.contains('active');
    }, {timeout:8000});
    const missingView = await page.evaluate(function(){
      const screen = document.getElementById('homeAddrScreen');
      const bg = getComputedStyle(screen).backgroundColor;
      const pin = document.querySelector('.homeaddr-ico-pin');
      const house = document.querySelector('.homeaddr-ico-house');
      const footer = document.querySelector('footer');
      return {
        title: document.querySelector('.homeaddr-title').textContent,
        brand: document.querySelector('.homeaddr-brand').textContent,
        continueText: document.getElementById('homeAddrContinue').textContent,
        street: document.getElementById('homeAddrStreet').value,
        city: document.getElementById('homeAddrCity').value,
        state: document.getElementById('homeAddrState').value,
        zip: document.getElementById('homeAddrZip').value,
        bg: bg,
        pin: getComputedStyle(pin).display,
        house: getComputedStyle(house).display,
        footer: getComputedStyle(footer).display,
        nav: document.getElementById('bottomNav').hidden
      };
    });
    assert.strictEqual(missingView.title, 'Where do you live?');
    assert.strictEqual(missingView.brand, 'CAREGIVER · EVERCARE');
    assert.strictEqual(missingView.continueText, 'Continue');
    assert.strictEqual(missingView.street, '123 Maple Ave');
    assert.strictEqual(missingView.city, 'Cleveland');
    assert.strictEqual(missingView.state, 'OH');
    assert.strictEqual(missingView.zip, '44115');
    assert.strictEqual(missingView.pin, 'block');
    assert.strictEqual(missingView.house, 'none');
    assert.strictEqual(missingView.footer, 'none');
    assert.strictEqual(missingView.nav, true);
    assert.ok(missingView.bg === 'rgb(26, 39, 68)', 'navy gate ' + missingView.bg);
    await page.screenshot({path:path.join(shotDir, '02-missing-coords-gate.png')});

    await page.evaluate(function(){
      document.getElementById('homeAddrStreet').value = '';
      document.getElementById('homeAddrCity').value = '';
      document.getElementById('homeAddrState').value = '';
      document.getElementById('homeAddrZip').value = '';
    });
    await page.click('#homeAddrContinue');
    await page.waitForFunction(function(){
      const err = document.getElementById('homeAddrErr');
      return err && err.style.display === 'block' && /required/i.test(err.textContent);
    }, {timeout:4000});
    const blocked = await page.evaluate(function(){
      return {
        saves: window.__homeAddr.saves.length,
        home: document.getElementById('caregiverScreen').classList.contains('active'),
        gate: document.getElementById('homeAddrScreen').classList.contains('active')
      };
    });
    assert.strictEqual(blocked.saves, 0, 'invalid continue does not save');
    assert.strictEqual(blocked.home, false);
    assert.strictEqual(blocked.gate, true);

    await page.type('#homeAddrStreet', '123 Maple Ave');
    await page.type('#homeAddrCity', 'Cleveland');
    await page.type('#homeAddrState', 'OH');
    await page.type('#homeAddrZip', '44115');
    await page.click('#homeAddrContinue');
    await page.waitForFunction(function(){
      const home = document.getElementById('caregiverScreen');
      const nav = document.getElementById('bottomNav');
      return home.classList.contains('active') && nav.hidden === false && document.body.classList.contains('has-bottom-nav');
    }, {timeout:8000});
    const savedCall = await page.evaluate(function(){
      return {
        saves: window.__homeAddr.saves,
        geos: window.__homeAddr.geos,
        footer: getComputedStyle(document.querySelector('footer')).display,
        gate: document.getElementById('homeAddrScreen').classList.contains('active')
      };
    });
    assert.strictEqual(savedCall.saves.length, 1, 'one save');
    assert.strictEqual(savedCall.saves[0].p_home_address, '123 Maple Ave, Cleveland, OH 44115');
    assert.strictEqual(savedCall.saves[0].p_lat, 41.4993);
    assert.strictEqual(savedCall.saves[0].p_lng, -81.6944);
    assert.ok(savedCall.geos.length === 1 && /nominatim/.test(savedCall.geos[0]), 'nominatim before save');
    assert.notStrictEqual(savedCall.footer, 'none', 'footer returns on home');
    assert.strictEqual(savedCall.gate, false);
    await page.screenshot({path:path.join(shotDir, '03-home-after-continue.png')});

    await boot({
      first:true,
      get:{gate_required:true, home_address:null, home_lat:null, home_lng:null, first_login:true}
    });
    await page.waitForFunction(function(){
      const el = document.getElementById('homeAddrScreen');
      return el.classList.contains('active') && el.classList.contains('homeaddr-signup') && !el.classList.contains('homeaddr-checking');
    }, {timeout:8000});
    const signupView = await page.evaluate(function(){
      return {
        bg: getComputedStyle(document.getElementById('homeAddrScreen')).backgroundColor,
        house: getComputedStyle(document.querySelector('.homeaddr-ico-house')).display,
        pin: getComputedStyle(document.querySelector('.homeaddr-ico-pin')).display,
        nav: document.getElementById('bottomNav').hidden,
        title: document.querySelector('.homeaddr-title').textContent
      };
    });
    assert.ok(signupView.bg === 'rgb(42, 127, 127)', 'teal signup gate ' + signupView.bg);
    assert.strictEqual(signupView.house, 'block');
    assert.strictEqual(signupView.pin, 'none');
    assert.strictEqual(signupView.nav, true);
    assert.strictEqual(signupView.title, 'Where do you live?');
    await page.screenshot({path:path.join(shotDir, '01-signup-gate.png')});

    await boot({
      get:{success:true, data:{gate_required:false, home_lat:41.5, home_lng:-81.7, home_address:'1 Main St, Cleveland, OH 44115'}}
    });
    await page.waitForFunction(function(){
      return document.getElementById('caregiverScreen').classList.contains('active') && document.getElementById('bottomNav').hidden === false;
    }, {timeout:8000});
    const passed = await page.evaluate(function(){
      return document.getElementById('homeAddrScreen').classList.contains('active');
    });
    assert.strictEqual(passed, false, 'coords on file skip the gate');

    await boot({sheets:true, search:'&sheets=1', session:true, get:{gate_required:true, home_lat:null, home_lng:null}});
    await page.waitForFunction(function(){
      return document.getElementById('caregiverScreen').classList.contains('active');
    }, {timeout:8000});
    const sheets = await page.evaluate(function(){
      return {
        gate: document.getElementById('homeAddrScreen').classList.contains('active'),
        saves: window.__homeAddr.saves.length
      };
    });
    assert.strictEqual(sheets.gate, false, 'sheets rollback does not show the gate');
    assert.strictEqual(sheets.saves, 0);
  }finally{
    await browser.close();
    server.close();
  }
  console.log('caregiver-aide-home-addr1 browser checks ok');
}

runBrowser().catch(function(err){
  console.error(err);
  process.exit(1);
});
