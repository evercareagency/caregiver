#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

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
function count(re, text){
  const m = String(text == null ? html : text).match(re);
  return m ? m.length : 0;
}

const vendorRe = new RegExp(
  ['nomi','natim'].join('') + '|' +
  ['open','street','map'].join('') + '|' +
  ['tile','\\.','osm'].join('') + '|' +
  ['leaf','let'].join(''),
  'i'
);

function walk(dir, out){
  fs.readdirSync(dir, {withFileTypes:true}).forEach(function(ent){
    if(ent.name === '.git' || ent.name === 'node_modules')return;
    const full = path.join(dir, ent.name);
    if(ent.isDirectory())walk(full, out);
    else out.push(full);
  });
  return out;
}
const files = walk(root, []);
let vendorHits = 0;
files.forEach(function(file){
  const buf = fs.readFileSync(file);
  if(buf.includes(0))return;
  const text = buf.toString('utf8');
  if(vendorRe.test(text))vendorHits++;
});
assert.strictEqual(vendorHits, 0, 'map vendor names stay at 0 across the repo');

assert.strictEqual(count(/script\.google\.com/g), 0, 'script.google.com count');
assert.strictEqual(count(/\/exec/g), 0, '/exec count');
assert.strictEqual(count(/sheets=1/g), 0, 'sheets=1 count');
assert.strictEqual(count(/AKfycb/g), 0, 'AKfycb count');
assert.strictEqual(count(/SHEETS_URL/g), 0, 'SHEETS_URL count');
assert.ok(html.includes('data-geo1="GEO1"'), 'GEO1 marker');
assert.ok(html.includes('<!-- caregiver-build: 2026-10-08-geo1'), 'GEO1 build comment');
assert.ok(html.includes('America/New_York'), 'ET week key stays');
assert.ok(html.includes('(216) 377-5991'), 'office line stays');
assert.ok(html.includes('5510 Pearl Rd Ste 200, Cleveland, OH 44129'), 'office address stays');
assert.ok(html.includes("format:'letter'"), 'PDF stays letter');
assert.ok(html.includes('Do this while you\'re at home. Your phone\'s location is saved once so we can offer shifts near you.'), 'home gate copy');
assert.ok(html.includes('Location is off for this site. Turn on Location in Settings, then come back home and tap Continue.'), 'denied copy');
assert.ok(html.includes('Couldn\'t get your location. Check that Location is on and tap Continue again.'), 'timeout copy');
assert.ok(html.includes('Location is rough. Step near a window and tap Continue again.'), 'poor accuracy copy');
assert.ok(html.includes('GPS saved · ±'), 'saved GPS label');

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-10-08-geo1">', 'geo1 meta is first');

files.filter(function(file){return /-test\.js$/.test(file);}).forEach(function(file){
  const text = fs.readFileSync(file, 'utf8');
  if(!text.includes('setRequestInterception'))return;
  const blocksHost = text.includes('script.google.com') || text.includes('script\\.google\\.com');
  assert.ok(blocksHost, path.basename(file) + ' blocks script.google.com');
  assert.ok(text.includes('req.abort') || text.includes('req.respond'), path.basename(file) + ' does not let that host through');
});

const capture = extractFn(html, 'async function captureDayLocationAndSave()');
assert.ok(!capture.includes('fetch('), 'Save Day does not reverse-geocode');
assert.ok(!/location\s*:/.test(capture), 'Save Day does not write a location label');
assert.ok(capture.includes('accuracyM') && capture.includes('gpsAt'), 'Save Day stores accuracy and time');
assert.ok(capture.indexOf('saveDayData(i,day)') > capture.indexOf('catch(err)'), 'a GPS miss still saves the day');
const ask = extractFn(html, 'async function askFinalSubmit()');
const fin = extractFn(html, 'async function doFinalSubmit()');
assert.ok(!ask.includes('getGpsPosition'), 'opening submit does not wait on GPS');
assert.ok(!fin.includes('getGpsPosition'), 'submit does not wait on GPS');
const begin = extractFn(html, 'function beginHomeAddrGate()');
const showGate = extractFn(html, 'function showHomeAddrGate(opts)');
assert.ok(!begin.includes('getGpsPosition') && !showGate.includes('getGpsPosition'), 'the home gate does not read GPS on load');
const submitHome = extractFn(html, 'async function submitHomeAddr()');
assert.ok(submitHome.includes('getGpsPosition()'), 'Continue reads the phone');
assert.ok(submitHome.includes("sbRest('rpc/aide_save_home_address'"), 'home save RPC stays');
assert.ok(submitHome.includes('p_lat:lat') && submitHome.includes('p_lng:lng') && submitHome.includes('p_home_address:line'), 'home save args stay');
assert.ok(!submitHome.includes('fetch('), 'Continue does not look the address up');
assert.ok(submitHome.includes('accuracy>200') && submitHome.includes('roughRetry'), 'a rough reading can be saved on the next Continue');
const gpsFn = extractFn(html, 'function getGpsPosition()');
assert.ok(gpsFn.includes('timeout:10000') && gpsFn.includes('setTimeout'), 'GPS aborts at 10 seconds');

const src = [
  extractFn(html, 'function gpsFailCopy(err)'),
  extractFn(html, 'function gpsRoughCopy()'),
  extractFn(html, 'function dayGpsLabel(d)'),
  extractFn(html, 'function sbDayWire(day)'),
  extractFn(html, 'function sbMergeDays(base,incoming)'),
  extractFn(html, 'function sbMergeDaysReplace(base,incoming)'),
  extractFn(html, 'function sbDayIndex(key)'),
  extractFn(html, 'function sbNormalizeDays(days)'),
  extractFn(html, 'function daysPayloadFromWeekData(wd)'),
  extractFn(html, 'function _normalizeBackupDays(days)'),
  extractFn(html, 'function buildDaysPayload()'),
  extractFn(html, 'function calcDistance(lat1,lng1,lat2,lng2)'),
  extractFn(html, 'async function captureDayLocationAndSave()'),
  extractFn(html, 'function civilWeekSunday(ymd)'),
  extractFn(html, 'function currentWeekSunday()'),
  extractFn(html, 'function sbWeekSunday(value)'),
  extractFn(html, 'function minsFromHrs(hrs)'),
  extractFn(html, 'function totalHoursFromWeekData(wd)'),
  extractFn(html, 'function cgSameWeek(a,b)'),
  extractFn(html, 'function cgDeviceOpId()'),
  extractFn(html, 'function cgReadQueue()'),
  extractFn(html, 'function cgWriteQueue(ops)'),
  extractFn(html, 'function cgQueueWeekOp(kind,payload)'),
  extractFn(html, 'function cgEnqueueSaveDay(i,dayObj)'),
  'const CG_OFFLINE_QUEUE_KEY=' + (html.match(/const CG_OFFLINE_QUEUE_KEY='[^']+'/) || [])[0].split('=')[1],
  'const CG_QUEUE_FIELDS=' + html.slice(html.indexOf('const CG_QUEUE_FIELDS='), html.indexOf(';', html.indexOf('const CG_QUEUE_FIELDS=')) + 1).split('=').slice(1).join('=').replace(/;$/, '')
].join('\n');

const mem = {};
const saved = [];
const msgs = [];
const fetches = [];
const nodes = {};
function el(extra){
  const node = {value:'', textContent:'', disabled:false, style:{display:''}, classList:{add:function(){}, remove:function(){}, contains:function(){return false;}}};
  return Object.assign(node, extra || {});
}
['homeAddrErr','homeAddrContinue','homeAddrState','locHelpLead','cg_other_specify','serviceMatrix','cg_client','cg_svctype','cg_weekstart','cg_total','cg_notes'].forEach(function(id){
  nodes[id] = el();
});
nodes.cg_weekstart.value = '2026-10-04';
nodes.cg_svctype.value = 'Personal Care';
nodes.cg_total.textContent = '4:00';
nodes.cg_notes.value = '';
nodes.cg_client.options = [{text:'Ada Client'}];
nodes.cg_client.selectedIndex = 0;
nodes.serviceMatrix.children = [1];

const week = {
  0: {
    date:'2026-10-05', tin:'08:00', tout:'12:00', hrs:'4:00',
    aideSig:'ink', clientSig:'ink', svcs:['Bathing'],
    lat:41.5, lng:-81.7, accuracyM:12, gpsAt:'2026-10-08T12:00:00.000Z',
    verified:true, distanceFt:40, savedAt:'saved',
    location:'10 Old Street, Cleveland'
  },
  1: {
    date:'2026-10-06', tin:'09:00', tout:'11:00', hrs:'2:00',
    aideSig:'ink', clientSig:'ink', svcs:['Bathing'],
    lat:41.51, lng:-81.71, accuracyM:8.5, gpsAt:'2026-10-08T15:04:00.000Z',
    verified:false, distanceFt:800
  }
};

const box = {
  homeAddrGate:{phase:'required', look:'missing', record:null, busy:false, saving:false, roughRetry:false},
  pendingDaySave:null,
  currentUser:{username:'ada', name:'Ada Cole', sbOrgId:'org', sbAideId:'aide'},
  currentTS:'ts-local',
  week:week,
  saved:saved,
  msgs:msgs,
  fetches:fetches,
  JSON:JSON, Date:Date, Object:Object, Array:Array, String:String, Number:Number, Math:Math, isFinite:isFinite,
  parseFloat:parseFloat, parseInt:parseInt, encodeURIComponent:encodeURIComponent,
  setTimeout:function(fn){return 1;},
  clearTimeout:function(){},
  document:{getElementById:function(id){return nodes[id] || el();}},
  navigator:{geolocation:null},
  getUserWeekData:function(){return box.week;},
  getCheckedSvcs:function(){return ['Bathing'];},
  getSelectedClient:function(){return {id:'c-1', name:'Ada Client', lat:41.5, lng:-81.7};},
  saveDayData:function(i, day){saved.push({i:i, day:day});},
  saveLocationStatus:function(status){box.locStatus = status;},
  showTempMsg:function(msg){msgs.push(String(msg));},
  getGpsPosition:function(){return box.gps();},
  fetch:function(url){
    const u = String(url);
    fetches.push(u);
    if(/script\.google\.com/.test(u))return Promise.reject(new Error('blocked'));
    return Promise.reject(new Error('unexpected fetch'));
  },
  store:{
    get:function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
    set:function(k, v){mem[k] = v;},
    del:function(k){delete mem[k];}
  },
  evercareSbEnabled:function(){return true;},
  sbDataEnabled:function(){return true;}
};
vm.createContext(box);
vm.runInContext(src, box);

const wired = vm.runInContext('sbDayWire', box)(week[1]);
assert.strictEqual(wired.lat, 41.51);
assert.strictEqual(wired.lng, -81.71);
assert.strictEqual(wired.accuracyM, 8.5);
assert.strictEqual(wired.gpsAt, '2026-10-08T15:04:00.000Z');
assert.ok(!('location' in wired), 'a day without a stored label does not gain one');
const oldWired = vm.runInContext('sbDayWire', box)(week[0]);
assert.strictEqual(oldWired.location, '10 Old Street, Cleveland', 'an old stored label still rides along');
assert.strictEqual(oldWired.accuracyM, 12);
assert.strictEqual(oldWired.gpsAt, '2026-10-08T12:00:00.000Z');

const normalized = vm.runInContext('sbNormalizeDays', box)({Mon:week[1]});
assert.strictEqual(normalized['1'].accuracyM, 8.5);
assert.strictEqual(normalized['1'].gpsAt, '2026-10-08T15:04:00.000Z');
assert.strictEqual(normalized['1'].lat, 41.51);
assert.strictEqual(normalized['1'].lng, -81.71);
const merged = vm.runInContext('sbMergeDays', box)({1:{tin:'01:00'}}, {'1':normalized['1']});
assert.strictEqual(merged['1'].gpsAt, '2026-10-08T15:04:00.000Z');
assert.strictEqual(merged['1'].accuracyM, 8.5);
const replaced = vm.runInContext('sbMergeDaysReplace', box)({}, {'1':wired});
assert.strictEqual(replaced['1'].lat, 41.51);
assert.strictEqual(replaced['1'].gpsAt, wired.gpsAt);

const backup = vm.runInContext('daysPayloadFromWeekData', box)(week);
assert.strictEqual(backup['1'].accuracyM, 8.5);
assert.strictEqual(backup['1'].gpsAt, '2026-10-08T15:04:00.000Z');
assert.ok(!('location' in backup['1']));
assert.strictEqual(backup['0'].location, '10 Old Street, Cleveland');
assert.strictEqual(backup['0'].accuracyM, 12);
const restored = vm.runInContext('_normalizeBackupDays', box)(backup);
assert.strictEqual(restored['1'].lat, 41.51);
assert.strictEqual(restored['1'].lng, -81.71);
assert.strictEqual(restored['1'].accuracyM, 8.5);
assert.strictEqual(restored['1'].gpsAt, '2026-10-08T15:04:00.000Z');

const payload = vm.runInContext('buildDaysPayload', box)();
assert.strictEqual(payload['1'].accuracyM, 8.5);
assert.strictEqual(payload['1'].gpsAt, '2026-10-08T15:04:00.000Z');
assert.strictEqual(payload['0'].accuracyM, 12);
assert.ok(!('location' in payload['1']));

const queued = vm.runInContext('cgEnqueueSaveDay(1, week[1])', box);
assert.ok(queued && queued.days && queued.days['1'], 'the offline queue keeps the day');
assert.strictEqual(queued.days['1'].lat, 41.51);
assert.strictEqual(queued.days['1'].lng, -81.71);
assert.strictEqual(queued.days['1'].accuracyM, 8.5);
assert.strictEqual(queued.days['1'].gpsAt, '2026-10-08T15:04:00.000Z');
assert.ok(!('location' in queued.days['1']));

assert.strictEqual(vm.runInContext('dayGpsLabel', box)(week[0]), '10 Old Street, Cleveland');
assert.strictEqual(vm.runInContext('dayGpsLabel', box)(week[1]), 'GPS saved · ±8.5 m');
assert.strictEqual(vm.runInContext('dayGpsLabel', box)({lat:1, lng:2, accuracyM:12}), 'GPS saved · ±12 m');
assert.strictEqual(vm.runInContext('dayGpsLabel', box)({lat:1, lng:2}), 'GPS saved');

(async function(){
box.gps = function(){
  return Promise.resolve({coords:{latitude:41.5, longitude:-81.7, accuracy:12.04}, timestamp:Date.parse('2026-10-08T16:00:00.000Z')});
};
box.pendingDaySave = {i:2, base:{date:'2026-10-07', tin:'08:00', tout:'12:00', hrs:'4:00', svcs:['Bathing'], location:'should not stick'}};
await vm.runInContext('captureDayLocationAndSave()', box);
assert.strictEqual(fetches.length, 0, 'a successful Save Day does not fetch');
assert.strictEqual(saved.length, 1);
assert.strictEqual(saved[0].day.lat, 41.5);
assert.strictEqual(saved[0].day.lng, -81.7);
assert.strictEqual(saved[0].day.accuracyM, 12);
assert.strictEqual(saved[0].day.gpsAt, '2026-10-08T16:00:00.000Z');
assert.strictEqual(saved[0].day.verified, true);
assert.ok(!('location' in saved[0].day), 'new Save Day drops the street label');

box.gps = function(){
  return Promise.resolve({coords:{latitude:41.9, longitude:-81.2, accuracy:250.04}, timestamp:Date.parse('2026-10-08T17:00:00.000Z')});
};
box.pendingDaySave = {i:3, base:{date:'2026-10-07', tin:'08:00', tout:'12:00', hrs:'4:00', svcs:['Bathing']}};
await vm.runInContext('captureDayLocationAndSave()', box);
assert.strictEqual(saved[1].day.accuracyM, 250);
assert.strictEqual(saved[1].day.verified, false);
assert.ok(saved[1].day.gpsAt);

box.gps = function(){return Promise.reject({code:1, message:'denied'});};
box.pendingDaySave = {i:4, base:{date:'2026-10-07', tin:'08:00', tout:'12:00', hrs:'4:00', svcs:['Bathing'], location:'old label'}};
await vm.runInContext('captureDayLocationAndSave()', box);
assert.strictEqual(saved.length, 3, 'denied GPS still saves the day');
assert.ok(!('lat' in saved[2].day));
assert.ok(!('location' in saved[2].day));
assert.ok(msgs.indexOf('Location is off for this site. Turn on Location in Settings, then come back home and tap Continue.') >= 0, 'denied copy');

box.gps = function(){return Promise.reject({code:3, message:'timeout'});};
box.pendingDaySave = {i:5, base:{date:'2026-10-07', tin:'08:00', tout:'12:00', hrs:'4:00', svcs:['Bathing']}};
await vm.runInContext('captureDayLocationAndSave()', box);
assert.strictEqual(saved.length, 4, 'a timeout still saves the day');
assert.ok(msgs.indexOf('Couldn\'t get your location. Check that Location is on and tap Continue again.') >= 0, 'timeout copy');
assert.strictEqual(fetches.length, 0, 'a failed Save Day does not fetch');

const homeSrc = [
  extractFn(html, 'function gpsFailCopy(err)'),
  extractFn(html, 'function gpsRoughCopy()'),
  extractFn(html, 'function homeAddrCoordsOk(lat,lng)'),
  extractFn(html, 'async function submitHomeAddr()')
].join('\n');
function homeNode(id){
  if(id === 'homeAddrErr')return home.err;
  if(id === 'homeAddrContinue')return home.btn;
  if(id === 'homeAddrState')return home.stateEl;
  if(id === 'locHelpLead')return home.lead;
  return null;
}
const home = {
  err:{textContent:'', style:{display:'none'}},
  btn:{disabled:false, textContent:'Continue'},
  stateEl:{value:''},
  lead:{textContent:''},
  saves:[],
  help:'',
  modal:'',
  entered:false,
  homeAddrGate:{phase:'required', saving:false, roughRetry:false},
  _locRetryFn:null,
  document:{getElementById:homeNode},
  homeAddrBindFields:function(){},
  homeAddrReadSettled:function(){return Promise.resolve({street:'10 Oak St', city:'Cleveland', state:'OH', zip:'44102'});},
  homeAddrStateCode:function(raw){return String(raw || '').trim().toUpperCase();},
  homeAddrLine:function(parts){return parts.street + ', ' + parts.city + ', ' + parts.state + ' ' + parts.zip;},
  showLocHelpInstructions:function(device){home.help = device;},
  openModal:function(id){home.modal = id;},
  homeAddrSaveOk:function(){return true;},
  homeAddrClearFirstLogin:function(){},
  enterHomeAfterAddr:function(){home.entered = true;},
  sbRest:function(path, opts){home.saves.push({path:path, body:opts.body});return Promise.resolve({ok:true});},
  fetch:function(url){
    if(/script\.google\.com/.test(String(url)))return Promise.reject(new Error('blocked'));
    return Promise.reject(new Error('unexpected fetch'));
  },
  getGpsPosition:function(){return home.gps();}
};
vm.createContext(home);
vm.runInContext(homeSrc, home);

home.gps = function(){return Promise.reject({code:1});};
await vm.runInContext('submitHomeAddr()', home);
assert.strictEqual(home.saves.length, 0, 'denied Continue does not save');
assert.strictEqual(home.err.textContent, 'Location is off for this site. Turn on Location in Settings, then come back home and tap Continue.');
assert.strictEqual(home.modal, 'locHelpModal');
assert.strictEqual(home.help, 'iphone');
assert.strictEqual(home.entered, false);

home.err.textContent = '';
home.modal = '';
home.gps = function(){return Promise.reject({code:3});};
await vm.runInContext('submitHomeAddr()', home);
assert.strictEqual(home.saves.length, 0, 'timeout Continue does not save');
assert.strictEqual(home.err.textContent, 'Couldn\'t get your location. Check that Location is on and tap Continue again.');
assert.strictEqual(home.modal, '');

home.err.textContent = '';
home.gps = function(){return Promise.resolve({coords:{latitude:41.49, longitude:-81.69, accuracy:240}});};
await vm.runInContext('submitHomeAddr()', home);
assert.strictEqual(home.saves.length, 0, 'the first rough reading waits');
assert.strictEqual(home.err.textContent, 'Location is rough. Step near a window and tap Continue again.');
assert.strictEqual(home.homeAddrGate.roughRetry, true);
await vm.runInContext('submitHomeAddr()', home);
assert.strictEqual(home.saves.length, 1, 'the second rough reading saves');
assert.strictEqual(home.saves[0].path, 'rpc/aide_save_home_address');
assert.strictEqual(home.saves[0].body.p_home_address, '10 Oak St, Cleveland, OH 44102');
assert.strictEqual(home.saves[0].body.p_lat, 41.49);
assert.strictEqual(home.saves[0].body.p_lng, -81.69);
assert.strictEqual(Object.keys(home.saves[0].body).sort().join(','), 'p_home_address,p_lat,p_lng');
assert.strictEqual(home.entered, true);

await vm.runInContext('fetch("https://script.google.com/macros/s/x")', home).then(function(){
  throw new Error('script.google.com was not blocked');
}, function(err){
  assert.strictEqual(err.message, 'blocked');
});

console.log('caregiver-geo1 checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});

async function runBrowser(){
  if(process.env.SKIP_BROWSER === '1')return;
  let puppeteer;
  try{puppeteer = require('puppeteer-core');}
  catch(e){
    try{puppeteer = require('/tmp/cgtest/node_modules/puppeteer-core');}
    catch(e2){console.log('puppeteer-core missing; static checks only');return;}
  }
  const browser = await puppeteer.launch({
    executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', function(req){
    const u = req.url();
    if(/script\.google\.com/.test(u)){req.abort();return;}
    req.continue();
  });
  await browser.close();
}
runBrowser();
