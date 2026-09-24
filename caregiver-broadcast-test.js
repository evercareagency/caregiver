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
  let quote = '';
  for(; i < src.length; i++){
    const c = src[i];
    if(quote){
      if(c === '\\'){i++; continue;}
      if(c === quote)quote = '';
      continue;
    }
    if(c === '"' || c === "'" || c === '`'){quote = c; continue;}
    if(c === '{')depth++;
    else if(c === '}'){
      depth--;
      if(depth === 0)return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + sig);
}

assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-bcast1b v=bcast1b —'), 'bcast1b marker');
assert.ok(html.includes('v=bcast1b'), 'bcast1b probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-bcast1b">'), 'bcast1b meta');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-bcast1 v=bcast1 —'), 'bcast marker');
assert.ok(html.includes('v=bcast1'), 'bcast probe');
assert.ok(html.includes('v=bcast1-cg') || html.includes('v=bcast1 —'), 'cg probe in comment');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-bcast1">'), 'bcast meta');
assert.ok(html.includes('GHOST-BROADCAST-CONTRACT-v1'), 'contract comment');
assert.ok(html.includes('v=warmoff1') && html.includes('v=portal1') && html.includes('v=isassign1'), 'warmoff portal assign stay');
assert.ok(html.includes('v=cgpdfv1') && html.includes('v=ishydr1') && html.includes('v=bakuuid1'), 'pdf hydrate backup stay');
assert.ok(html.includes('v=cgpdf1') && html.includes('v=home1') && html.includes('v=nocert1'), 'letter home nocert stay');
assert.ok(html.includes('v=sbseal1') && html.includes('v=offline1'), 'seal offline stay');
assert.ok(html.includes('id="broadcastBanner"') && html.includes('broadcast-banner'), 'banner DOM stays');

const paint = extractFn(html, 'function paintBroadcastBanner(msg)');
const msgFn = extractFn(html, 'function sbBroadcastMessage(data)');
const getFn = extractFn(html, 'async function sbGetActiveBroadcast()');
const loadFn = extractFn(html, 'async function loadBroadcastBanner()');
const homeFn = extractFn(html, 'function loadCaregiverScreen()');
const src = paint + '\n' + msgFn + '\n' + getFn + '\n' + loadFn;

assert.ok(homeFn.includes('loadBroadcastBanner()'), 'home loads the banner');
assert.ok(!homeFn.includes("store.get('broadcast_msg')"), 'home no longer reads store inline');
assert.ok(getFn.includes("sbRest('rpc/get_active_broadcast',{method:'POST',body:{}})"), 'cut uses aide JWT rpc');
assert.ok(!src.includes('send_broadcast') && !src.includes('clear_broadcast'), 'aide is read-only');
assert.ok(!html.includes("action:'broadcast'") && !html.includes("action:'get_broadcast'") && !html.includes("action:'send_broadcast'"), 'no Sheets /exec invent');
assert.ok(loadFn.includes('evercareSbEnabled()'), 'cut vs sheets rollback branch');
assert.ok(loadFn.includes("store.get('broadcast_msg')"), 'sheets rollback still reads broadcast_msg');
assert.ok(loadFn.indexOf('evercareSbEnabled()') < loadFn.indexOf("store.get('broadcast_msg')"), 'store path is rollback only');
assert.ok(!getFn.includes('SHEETS_URL') && !loadFn.includes('SHEETS_URL'), 'broadcast path never hits /exec');

function boot(opts){
  opts = opts || {};
  const calls = [];
  const banner = {textContent:'', classList:{_s:new Set(), add:function(c){this._s.add(c);}, remove:function(c){this._s.delete(c);}, contains:function(c){return this._s.has(c);}}};
  const box = {
    evercareSbEnabled: function(){return opts.sb !== false;},
    sbDataEnabled: function(){return opts.sb !== false && opts.token !== false;},
    sbRest: async function(q, req){
      calls.push({q:q, req:req || null});
      if(opts.fail)throw new Error('rpc failed');
      return opts.data;
    },
    store: {
      get: function(k){
        if(k === 'broadcast_msg')return opts.local == null ? null : opts.local;
        return null;
      }
    },
    document: {getElementById: function(id){return id === 'broadcastBanner' ? banner : null;}}
  };
  vm.createContext(box);
  vm.runInContext(src, box);
  box.calls = calls;
  box.banner = banner;
  return box;
}

(async function(){
  const show = boot({data:{message:'Office closed Friday'}});
  await vm.runInContext('loadBroadcastBanner()', show);
  assert.strictEqual(show.calls.length, 1, 'cut posts once');
  assert.strictEqual(show.calls[0].q, 'rpc/get_active_broadcast');
  assert.strictEqual(show.calls[0].req && show.calls[0].req.method, 'POST');
  assert.ok(show.calls[0].req && show.calls[0].req.body && typeof show.calls[0].req.body === 'object' && !Array.isArray(show.calls[0].req.body) && Object.keys(show.calls[0].req.body).length === 0, 'rpc body is {}');
  assert.strictEqual(show.banner.textContent, '🚨 Office closed Friday');
  assert.ok(show.banner.classList.contains('show'), 'message shows the banner');

  const shapes = [
    {message:'Alert A'},
    [{message:'Alert A'}],
    {success:true, data:{message:'Alert A', isActive:true}},
    {success:true, ok:true, data:{message:'Alert A'}},
    {ok:true, data:{success:true, data:{message:'Alert A'}}},
    [{success:true, data:{message:'Alert A'}}],
    '{"success":true,"data":{"message":"Alert A"}}',
    'Alert A'
  ];
  for(let i = 0; i < shapes.length; i++){
    const box = boot({data:shapes[i], local:'SHOULD_NOT_READ'});
    await vm.runInContext('loadBroadcastBanner()', box);
    assert.strictEqual(box.banner.textContent, '🚨 Alert A', 'shape '+i+' paints message');
    assert.ok(box.calls.length === 1, 'shape '+i+' does not read localStorage');
  }

  const emptyCases = [
    null, '', {}, {message:''}, {message:null}, [],
    {success:true, data:null},
    {success:true, data:{message:''}},
    {success:false, data:{message:'Alert A'}},
    {ok:false, error:'nope', data:{message:'Alert A'}}
  ];
  for(let i = 0; i < emptyCases.length; i++){
    const box = boot({data:emptyCases[i], local:'stale local'});
    await vm.runInContext('loadBroadcastBanner()', box);
    assert.strictEqual(box.banner.textContent, '', 'empty '+i+' hides');
    assert.ok(!box.banner.classList.contains('show'), 'empty '+i+' removes show');
  }

  const fail = boot({fail:true, local:'stale'});
  await vm.runInContext('loadBroadcastBanner()', fail);
  assert.strictEqual(fail.banner.textContent, '', 'rpc failure hides');
  assert.ok(!fail.banner.classList.contains('show'), 'rpc failure does not show local');

  const noJwt = boot({token:false, local:'stale'});
  await vm.runInContext('loadBroadcastBanner()', noJwt);
  assert.strictEqual(noJwt.calls.length, 0, 'no JWT skips rpc');
  assert.strictEqual(noJwt.banner.textContent, '', 'no JWT does not fall back to store on cut');

  const sheets = boot({sb:false, local:'Sheets-era alert'});
  await vm.runInContext('loadBroadcastBanner()', sheets);
  assert.strictEqual(sheets.calls.length, 0, 'sheets rollback does not call supabase');
  assert.strictEqual(sheets.banner.textContent, '🚨 Sheets-era alert');
  assert.ok(sheets.banner.classList.contains('show'), 'sheets rollback shows store msg');

  const sheetsEmpty = boot({sb:false, local:null});
  await vm.runInContext('loadBroadcastBanner()', sheetsEmpty);
  assert.strictEqual(sheetsEmpty.banner.textContent, '', 'sheets rollback hides when store empty');
  assert.ok(!sheetsEmpty.banner.classList.contains('show'), 'sheets empty removes show');

  const late = boot({token:false, data:{success:true, data:{message:'Late alert'}}});
  let tokenOn = false;
  late.sbDataEnabled = function(){return tokenOn;};
  const timers = [];
  late.setTimeout = function(fn){timers.push(fn); return timers.length;};
  late.Date = Date;
  await vm.runInContext('loadBroadcastBanner()', late);
  assert.strictEqual(late.calls.length, 0, 'missing jwt skips rpc');
  assert.strictEqual(late.banner.textContent, '', 'missing jwt hides');
  assert.strictEqual(timers.length, 1, 'arms one jwt watch');
  tokenOn = true;
  timers[0]();
  await new Promise(function(r){setImmediate(r);});
  assert.strictEqual(late.calls.length, 1, 'jwt within 2s retries the banner once');
  assert.strictEqual(late.calls[0].q, 'rpc/get_active_broadcast');
  assert.strictEqual(late.banner.textContent, '🚨 Late alert');
  assert.ok(late.banner.classList.contains('show'), 'late jwt shows the banner');
  assert.strictEqual(timers.length, 1, 'retry does not arm a second watch');

  const expired = boot({token:false, data:{success:true, data:{message:'Too late'}}});
  let now = 10000;
  expired.sbDataEnabled = function(){return false;};
  const expiredTimers = [];
  expired.setTimeout = function(fn){expiredTimers.push(fn); return expiredTimers.length;};
  expired.Date = {now: function(){return now;}};
  await vm.runInContext('loadBroadcastBanner()', expired);
  assert.strictEqual(expiredTimers.length, 1, 'watch waits for the jwt');
  now = 12000;
  expiredTimers[0]();
  assert.strictEqual(expired.calls.length, 0, 'jwt still missing after 2s does not call rpc');
  assert.strictEqual(expired.banner.textContent, '', 'expired watch stays hidden');

  console.log('caregiver-broadcast-test: ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
