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

assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-offline-save">'), 'offline build meta');
assert.ok(html.includes('v=offline1'), 'offline probe');
assert.ok(html.includes('id="offlineQueueBanner"'), 'queue banner');
assert.ok(html.includes('id="offlineQueueRetry"'), 'retry control');
assert.ok(html.includes('Tap to retry'), 'retry label');
assert.ok(html.includes('will upload when you\\\'re back online'), 'offline phrase');
assert.ok(html.includes('Uploading…'), 'uploading phrase');
assert.ok(html.includes('Couldn\\\'t upload — tap to retry'), 'retry phrase');
assert.ok(html.includes("kind:kind"), 'queue stores a kind');
assert.ok(html.includes('client_op_id'), 'device op id');
assert.ok(html.includes('evercare_offline_pdf'), 'pdf bytes stay in their own store');

const saveDay = extractFn(html, 'function saveDayData(i,dayObj)');
assert.ok(saveDay.includes('if(sbDataEnabled())sbSyncSavedDay'), 'online Save Day still syncs');
assert.ok(saveDay.indexOf('cgEnqueueSaveDay') < saveDay.indexOf('if(sbDataEnabled())sbSyncSavedDay'), 'offline queue is before the live sync');
assert.ok(saveDay.includes('cgShouldSyncNow'));
assert.ok(saveDay.indexOf("action:'save_timesheet_backup'") < 0, 'save day data does not post sheets itself');

const fin = extractFn(html, 'async function doFinalSubmit()');
assert.ok(fin.includes('cgEnqueueSubmit'), 'submit can queue');
assert.ok(fin.includes("action:'submit'"), 'sheets submit stays');
assert.ok(fin.includes('sbRefreshTimesheetPdf(row.id,weekData)'), 'online submit still refreshes the PDF');
assert.ok(fin.indexOf('evercareSbEnabled()') < fin.indexOf("action:'submit'"));
assert.ok(fin.indexOf('sbRefreshTimesheetPdf') < fin.indexOf("action:'submit'"));
assert.ok(html.includes('evercare_sheets'), 'sheets rollback flag remains');
assert.ok(html.includes('sheets=1'), 'sheets query rollback remains');

const urlConst = (html.match(/const SUPABASE_URL='([^']+)'/) || [])[1];
const keyConst = (html.match(/const SUPABASE_ANON_KEY='([^']+)'/) || [])[1];
const sheetsUrl = (html.match(/const SHEETS_URL='([^']+)'/) || [])[1];

const src = [
  'const store={get:function(k){try{var raw=localStorage.getItem(k);return raw==null?null:JSON.parse(raw);}catch(e){return null;}},set:function(k,v){localStorage.setItem(k,JSON.stringify(v));},del:function(k){localStorage.removeItem(k);}};',
  "const CG_OFFLINE_QUEUE_KEY='evercare_offline_ops';",
  "const CG_QUEUE_FIELDS=['local_id','client_op_id','kind','created_at','attempt_count','last_error','status','org_id','aide_id','client_id','week_start','day_index','day_patch','days','header','timesheet_id','next_attempt_at'];",
  extractFn(html, 'function evercareSbEnabled()'),
  extractFn(html, 'function sbAnonHeaders()'),
  extractFn(html, 'function sbUserHeaders(token)'),
  extractFn(html, 'async function sbRead(res)'),
  extractFn(html, 'function sbErrMsg(pack,fallback)'),
  extractFn(html, 'function sbExpiresMs(auth)'),
  extractFn(html, 'function sbToken()'),
  extractFn(html, 'function sbDataEnabled()'),
  extractFn(html, 'async function sbRest(path,opts)'),
  extractFn(html, 'function sbIsConflict(err)'),
  extractFn(html, 'async function sbEnsureOrgId()'),
  extractFn(html, 'function sbDayWire(day)'),
  extractFn(html, 'function sbWeekSunday(value)'),
  extractFn(html, 'function sbDayIndex(key)'),
  extractFn(html, 'function sbNormalizeDays(days)'),
  extractFn(html, 'async function sbFindWeekRow(aideId,clientId,weekStart,status)'),
  extractFn(html, 'function sbMergeDays(base,incoming)'),
  extractFn(html, 'function sbMergeDaysReplace(base,incoming)'),
  extractFn(html, 'function sbKeepSubmitted(existing,status)'),
  extractFn(html, 'async function sbUpsertTimesheet(opts)'),
  extractFn(html, 'function cgNetOnline()'),
  extractFn(html, 'function cgShouldSyncNow()'),
  extractFn(html, 'function cgIsAuthErr(err)'),
  extractFn(html, 'function cgIsNetErr(err)'),
  extractFn(html, 'function cgDeviceOpId()'),
  extractFn(html, 'function cgReadQueue()'),
  extractFn(html, 'function cgWriteQueue(ops)'),
  extractFn(html, 'function cgSameWeek(a,b)'),
  extractFn(html, 'function cgBackoffMs(attemptCount)'),
  extractFn(html, 'function cgPlainError(err,op)'),
  extractFn(html, 'function cgOpReady(op,force)'),
  extractFn(html, 'function cgUpdateOp(id,patch)'),
  extractFn(html, 'function cgFailOp(op,err)'),
  extractFn(html, 'function cgScheduleBackoff()'),
  extractFn(html, 'function cgSlimRecord(record)'),
  extractFn(html, 'function cgPdfRecordFromOp(op)'),
  extractFn(html, 'function cgQueueWeekOp(kind,payload)'),
  extractFn(html, 'function cgEnqueueSaveDay(i,dayObj)'),
  extractFn(html, 'function cgEnqueueSubmit(payload)'),
  extractFn(html, 'function cgRequeuePdfAfterMiss(timesheetId,record)'),
  extractFn(html, 'function cgRemoveOp(id)'),
  extractFn(html, 'function cgStampWeekTimesheetId(sample,id)'),
  extractFn(html, 'function cgPdfMem()'),
  extractFn(html, 'async function cgPdfBytesPut(id,bytes)'),
  extractFn(html, 'async function cgPdfBytesGet(id)'),
  extractFn(html, 'async function cgPdfBytesDel(id)'),
  extractFn(html, 'function cgPdfDb()'),
  extractFn(html, 'async function sbRefreshCaregiverJwt()'),
  extractFn(html, 'async function sbEnsureCaregiverJwt()'),
  extractFn(html, 'async function cgFlushPdfOp(op)'),
  extractFn(html, 'function cgWeekGroups(ops)'),
  extractFn(html, 'async function cgFlushWeek(ops,force)'),
  extractFn(html, 'async function cgFlushOfflineQueue(force)'),
  extractFn(html, 'function cgPaintOfflineQueue()'),
  extractFn(html, 'function cgRetryOfflineQueue()'),
  extractFn(html, 'function saveDayData(i,dayObj)')
].join('\n');

function storage(){
  const mem = {};
  return {
    getItem: function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
    setItem: function(k, v){mem[k] = String(v);},
    removeItem: function(k){delete mem[k];},
    dump: function(){return mem;}
  };
}

function run(opts){
  opts = opts || {};
  const calls = [];
  const els = {};
  function el(id){
    if(!els[id]){
      els[id] = {
        id: id,
        textContent: '',
        value: id === 'cg_weekstart' ? '2026-09-23' : '',
        innerHTML: '',
        style: {display: ''},
        classList: {add: function(){}, remove: function(){}, contains: function(){return false;}}
      };
    }
    return els[id];
  }
  const box = {
    SUPABASE_URL: urlConst,
    SUPABASE_ANON_KEY: keyConst,
    SHEETS_URL: sheetsUrl,
    window: null,
    location: {search: opts.search == null ? '' : opts.search},
    localStorage: storage(),
    navigator: {onLine: opts.onLine !== false},
    document: {getElementById: function(id){return el(id);}},
    currentUser: opts.currentUser || {
      username: 'aide.one',
      name: 'Aide One',
      sbAccessToken: 'jwt-test-token',
      sbRefreshToken: 'refresh-1',
      sbExpiresAt: Date.now() + 60 * 60 * 1000,
      sbUserId: '11111111-1111-1111-1111-111111111111',
      sbAideId: '22222222-2222-2222-2222-222222222222',
      sbOrgId: '33333333-3333-3333-3333-333333333333'
    },
    currentTS: 'local-1',
    activeDayIdx: 0,
    scrollTo: function(){},
    DAYS: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    myClients: [{id:'c-1', name:'Ada Client'}],
    msgs: [],
    pdfUploads: [],
    failPdf: !!opts.failPdf,
    weekRow: null,
    calls: calls,
    els: els,
    JSON: JSON, Date: Date, Object: Object, Array: Array, String: String, Error: Error, Math: Math,
    Number: Number, encodeURIComponent: encodeURIComponent, Promise: Promise, Uint8Array: Uint8Array,
    getCheckedSvcs: function(){return ['Bathing'];},
    storedHasRealInk: function(){return true;},
    getUserWeekData: function(){return {};},
    saveUserWeekData: function(data){box._savedWeek = data;},
    refreshSaveDayState: function(){},
    showTempMsg: function(msg){box.msgs.push(msg);},
    getAllTimesheets: function(){return [{id:'local-1', clientId:'c-1', clientName:'Ada Client', weekStart:'2026-09-20'}];},
    getSelectedClient: function(){return {id:'c-1', name:'Ada Client'};},
    totalHoursFromWeekData: function(){return '4:00';},
    sbSyncSavedDay: function(){box._synced = true;},
    sbEnsurePdfLibs: async function(){return true;},
    renderTimesheetPdfBlob: async function(){
      const raw = '%PDF-1.4\n' + 'offline '.repeat(160) + '\n%%EOF\n';
      const u8 = new Uint8Array(raw.length);
      for(let i = 0; i < raw.length; i++)u8[i] = raw.charCodeAt(i);
      return u8;
    },
    uploadTimesheetPdf: async function(up){
      box.pdfAt = calls.length;
      box.pdfUploads.push(up);
      if(box.failPdf)throw new Error('PDF upload failed');
      return {objectPath: 'ok'};
    },
    fetch: function(url, init){
      calls.push({url: String(url), init: init || {}});
      const u = String(url);
      const method = (init && init.method) || 'GET';
      function pack(status, raw){
        return Promise.resolve({ok: status >= 200 && status < 300, status: status, text: function(){return Promise.resolve(raw);}});
      }
      if(u.indexOf('/auth/v1/token') >= 0){
        if(opts.refreshFail)return pack(401, JSON.stringify({error:'invalid_grant'}));
        return pack(200, JSON.stringify({access_token:'jwt-refreshed', refresh_token:'refresh-2', expires_in:3600}));
      }
      if(u.indexOf('script.google.com') >= 0 || u === sheetsUrl){
        return pack(500, '{"unexpected":true}');
      }
      if(u.indexOf('/rest/v1/timesheets') >= 0 && method !== 'GET' && opts.failTimesheet){
        return pack(500, JSON.stringify({message:'upstream'}));
      }
      if(u.indexOf('/rest/v1/timesheets') >= 0 && method === 'GET'){
        return pack(200, JSON.stringify(box.weekRow ? [box.weekRow] : []));
      }
      if(u.indexOf('/rest/v1/timesheets') >= 0 && method === 'POST'){
        box.weekRow = {id:'ts-9', status:'backup', days:{}};
        return pack(201, JSON.stringify([{id:'ts-9', status:'backup'}]));
      }
      if(u.indexOf('/rest/v1/timesheets') >= 0 && method === 'PATCH'){
        const sent = JSON.parse(init.body);
        box.weekRow = Object.assign({id:'ts-9', days: box.weekRow && box.weekRow.days}, sent);
        return pack(200, JSON.stringify([box.weekRow]));
      }
      return pack(200, '[]');
    }
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(src, box);
  return box;
}

function queueOf(box){
  return JSON.parse(box.localStorage.getItem('evercare_offline_ops') || '[]');
}

(async function(){
  const offline = run({onLine:false});
  vm.runInContext('saveDayData(0,{date:"2026-09-20",tin:"08:00",tout:"12:00",hrs:"4:00",svcs:["Bathing"],aideSig:"a",clientSig:"c",aideSigInk:true,clientSigInk:true,verified:null})', offline);
  assert.strictEqual(offline.calls.length, 0, 'offline Save Day does not call Supabase or Sheets');
  assert.strictEqual(offline._synced, undefined, 'offline Save Day does not start the live sync');
  const queued = queueOf(offline);
  assert.strictEqual(queued.length, 2, 'save day queues the week row and a pdf op');
  assert.strictEqual(queued[0].kind, 'save_day');
  assert.strictEqual(queued[1].kind, 'pdf_upload');
  assert.ok(queued[0].local_id && queued[0].client_op_id && queued[0].local_id !== queued[0].client_op_id);
  assert.ok(queued[0].client_op_id !== queued[1].client_op_id);
  assert.strictEqual(queued[0].status, 'pending');
  assert.strictEqual(queued[0].attempt_count, 0);
  assert.strictEqual(queued[0].last_error, '');
  assert.strictEqual(queued[0].org_id, '33333333-3333-3333-3333-333333333333');
  assert.strictEqual(queued[0].aide_id, '22222222-2222-2222-2222-222222222222');
  assert.strictEqual(queued[0].day_index, '0');
  assert.strictEqual(queued[0].day_patch.tin, '08:00');
  assert.strictEqual(queued[0].timesheet_id, '');
  assert.strictEqual(queued[0].record, undefined, 'the JSON mirror has no record blob');
  assert.strictEqual(queued[0].client_id, 'c-1');
  assert.strictEqual(queued[0].week_start, '2026-09-20');
  assert.strictEqual(queued[0].days['0'].tin, '08:00');
  const sealed = ['local_id','client_op_id','kind','created_at','attempt_count','last_error','status','org_id','aide_id','client_id','week_start','day_index','day_patch','days','header','timesheet_id','next_attempt_at'];
  Object.keys(queued[0]).forEach(function(k){assert.ok(sealed.indexOf(k) >= 0, 'unexpected queue field ' + k);});
  assert.ok(offline.localStorage.dump().evercare_offline_ops.indexOf('%PDF-') < 0, 'pdf bytes are not in the JSON mirror');
  assert.ok(offline.msgs.some(function(m){return m.indexOf("Saved on this phone — will upload when you're back online") >= 0;}));
  assert.strictEqual(offline.els.offlineQueueStatus.textContent, "Saved on this phone — will upload when you're back online");
  assert.strictEqual(offline.els.offlineQueueRetry.style.display, 'inline-flex');

  const sheets = run({onLine:false, search:'?sheets=1'});
  vm.runInContext('saveDayData(0,{tin:"08:00",tout:"12:00",hrs:"4:00",svcs:["Bathing"],aideSig:"a",clientSig:"c",verified:null})', sheets);
  assert.strictEqual(sheets.calls.length, 0, 'sheets rollback Save Day does not call Supabase');
  assert.strictEqual(sheets.localStorage.getItem('evercare_offline_ops'), null, 'sheets rollback does not queue');

  const live = run({onLine:true});
  vm.runInContext('saveDayData(1,{tin:"09:00",tout:"12:00",hrs:"3:00",svcs:["Bathing"],aideSig:"a",clientSig:"c",verified:null})', live);
  assert.strictEqual(live._synced, true, 'online Save Day still uses the live sync');
  assert.strictEqual(live.calls.length, 0, 'the live sync helper is the only network path');
  assert.strictEqual(queueOf(live).length, 0);

  const merged = run({onLine:false});
  vm.runInContext('cgQueueWeekOp("save_day",{client_id:"c-1",week_start:"2026-09-20",days:{"0":{tin:"08:00",tout:"12:00",svcs:["Bathing"]}},created_at:"2026-09-24T01:00:00.000Z"})', merged);
  const firstId = queueOf(merged)[0].client_op_id;
  vm.runInContext('cgQueueWeekOp("save_day",{client_id:"c-1",week_start:"2026-09-20",days:{"0":{tin:"09:00",svcs:["Dressing"]},"1":{tin:"10:00"}},created_at:"2026-09-24T01:05:00.000Z"})', merged);
  const one = queueOf(merged).filter(function(op){return op.kind === 'save_day';});
  assert.strictEqual(one.length, 1, 'later save day for the week updates the same op');
  assert.strictEqual(one[0].client_op_id, firstId, 'a later save keeps the same device op');
  assert.strictEqual(one[0].days['0'].tin, '09:00', 'later flush wins that day');
  assert.deepStrictEqual(one[0].days['0'].svcs, ['Dressing']);
  assert.strictEqual(one[0].days['0'].tout, undefined, 'later day replaces that index');
  assert.strictEqual(one[0].days['1'].tin, '10:00');
  assert.strictEqual(vm.runInContext('cgBackoffMs(1)', merged), 1000);
  assert.strictEqual(vm.runInContext('cgBackoffMs(2)', merged), 2000);
  assert.strictEqual(vm.runInContext('cgBackoffMs(6)', merged), 32000);
  assert.strictEqual(vm.runInContext('cgBackoffMs(7)', merged), 60000);
  assert.strictEqual(vm.runInContext('cgBackoffMs(8)', merged), 60000);
  const plain = run({onLine:true});
  assert.strictEqual(vm.runInContext('cgPlainError({message:"jwt expired",pack:{status:401}},{kind:"save_day"})', plain), 'Sign in again — this phone kept your day.');
  assert.strictEqual(vm.runInContext('cgPlainError({message:"duplicate key value",pack:{status:409}},{kind:"save_day"})', plain), 'This week is already saved. Tap to retry.');
  assert.strictEqual(vm.runInContext('cgPlainError({message:"bad",pack:{status:422}},{kind:"save_day"})', plain), "The office couldn't read this day. Tap to retry.");
  assert.strictEqual(vm.runInContext('cgPlainError({message:"entity too large",pack:{status:413}},{kind:"pdf_upload"})', plain), 'That PDF is too big to upload.');
  assert.strictEqual(vm.runInContext('cgPlainError({message:"storage",pack:{status:500}},{kind:"pdf_upload"})', plain), 'Saved at the office. The PDF still needs to upload — tap to retry.');

  const flush = run({onLine:true});
  vm.runInContext([
    'cgQueueWeekOp("save_day",{client_id:"c-1",week_start:"2026-09-20",days:{"0":{tin:"08:00",svcs:["Bathing"]}},header:{total_hours:"4:00",client_name:"Ada Client"},created_at:"2026-09-24T01:00:00.000Z"})',
    'cgQueueWeekOp("pdf_upload",{client_id:"c-1",week_start:"2026-09-20",days:{"0":{tin:"08:00"}},header:{client_name:"Ada Client",total_hours:"4:00"},created_at:"2026-09-24T01:00:01.000Z"})',
    'cgQueueWeekOp("submit",{client_id:"c-1",week_start:"2026-09-20",days:{"0":{tin:"08:00",svcs:["Bathing"]},"1":{tin:"09:00",svcs:["Laundry"]}},header:{total_hours:"8:00",client_name:"Ada Client"},created_at:"2026-09-24T02:00:00.000Z"})'
  ].join('\n'), flush);
  await vm.runInContext('cgFlushOfflineQueue()', flush);
  assert.ok(!flush.calls.some(function(c){return c.url === sheetsUrl || c.url.indexOf('script.google.com') >= 0;}), 'flush does not call Sheets');
  const post = flush.calls.find(function(c){return c.init.method === 'POST' && c.url.indexOf('/rest/v1/timesheets') >= 0;});
  const patch = flush.calls.find(function(c){return c.init.method === 'PATCH' && c.url.indexOf('/rest/v1/timesheets') >= 0;});
  assert.ok(post && patch, 'flush writes the week then submits it');
  assert.ok(flush.calls.indexOf(post) < flush.calls.indexOf(patch), 'save_day before submit');
  const postBody = JSON.parse(post.init.body);
  assert.strictEqual(postBody.status, 'backup');
  assert.strictEqual(postBody.client_op_id, undefined, 'client_op_id stays on the phone');
  const submitBody = JSON.parse(patch.init.body);
  assert.strictEqual(submitBody.client_op_id, undefined);
  const weekGet = flush.calls.find(function(c){return c.url.indexOf('/rest/v1/timesheets') >= 0 && (c.init.method || 'GET') === 'GET';});
  assert.ok(decodeURIComponent(weekGet.url).indexOf('is_active=eq.true') >= 0, 'idempotency is the active week natural key');
  assert.ok(!flush.calls.some(function(c){return c.url.indexOf('/rpc/') >= 0;}), 'flush adds no RPC');
  assert.strictEqual(submitBody.status, 'submitted');
  assert.ok(submitBody.submitted_at);
  assert.strictEqual(submitBody.days['1'].tin, '09:00');
  assert.strictEqual(flush.pdfUploads.length, 1, 'pdf runs after the week writes');
  assert.ok(flush.pdfAt > flush.calls.indexOf(patch), 'pdf upload follows submit');
  assert.strictEqual(flush.pdfUploads[0].timesheetId, 'ts-9');
  assert.strictEqual(flush.pdfUploads[0].orgId, '33333333-3333-3333-3333-333333333333');
  assert.ok(flush.localStorage.dump().evercare_offline_ops == null || flush.localStorage.dump().evercare_offline_ops.indexOf('%PDF-') < 0);
  assert.strictEqual(queueOf(flush).length, 0);
  assert.strictEqual(flush.els.offlineQueueStatus.textContent, 'Uploaded');
  const after = flush.calls.length;
  await vm.runInContext('cgFlushOfflineQueue()', flush);
  assert.strictEqual(flush.calls.length, after, 'a second flush does not write again');
  assert.strictEqual(flush.pdfUploads.length, 1);

  const pdfFail = run({onLine:true, failPdf:true});
  vm.runInContext('cgEnqueueSubmit({client_id:"c-1",week_start:"2026-09-20",days:{"0":{tin:"08:00",svcs:["Bathing"]}},header:{total_hours:"4:00",client_name:"Ada Client"},record:{clientName:"Ada Client",empName:"Aide One",days:{"0":{tin:"08:00",svcs:["Bathing"]}}}})', pdfFail);
  await vm.runInContext('cgFlushOfflineQueue()', pdfFail);
  const left = queueOf(pdfFail);
  assert.strictEqual(left.length, 1, 'pdf failure keeps only the pdf op');
  assert.strictEqual(left[0].kind, 'pdf_upload');
  assert.strictEqual(left[0].timesheet_id, 'ts-9');
  assert.ok(pdfFail.calls.some(function(c){return c.init.method === 'POST' && c.url.indexOf('/rest/v1/timesheets') >= 0;}), 'timesheet insert is kept');
  assert.strictEqual(pdfFail.calls.filter(function(c){return c.init.method === 'PATCH';}).length, 0, 'failed pdf does not patch the timesheet');
  const mirror = pdfFail.localStorage.dump().evercare_offline_ops;
  assert.ok(mirror.indexOf('%PDF-') < 0, 'failed pdf bytes stay out of the JSON mirror');
  assert.ok(pdfFail.__cgPdfBytes && pdfFail.__cgPdfBytes[left[0].client_op_id], 'bytes remain on the device');
  assert.strictEqual(pdfFail.els.offlineQueueStatus.textContent, 'Saved at the office. The PDF still needs to upload — tap to retry.');
  assert.strictEqual(left[0].attempt_count, 1);
  const posts = pdfFail.calls.filter(function(c){return c.init.method === 'POST' && c.url.indexOf('/rest/v1/timesheets') >= 0;}).length;
  pdfFail.failPdf = false;
  await vm.runInContext('cgRetryOfflineQueue()', pdfFail);
  assert.strictEqual(pdfFail.calls.filter(function(c){return c.init.method === 'POST' && c.url.indexOf('/rest/v1/timesheets') >= 0;}).length, posts, 'pdf retry does not insert another timesheet');
  assert.strictEqual(queueOf(pdfFail).length, 0);
  assert.strictEqual(pdfFail.els.offlineQueueStatus.textContent, 'Uploaded');

  const auth = run({onLine:true});
  auth.currentUser.sbAccessToken = '';
  auth.currentUser.sbRefreshToken = '';
  auth.currentUser.sbExpiresAt = Date.now() - 1000;
  vm.runInContext('cgQueueWeekOp("save_day",{client_id:"c-1",week_start:"2026-09-20",days:{"0":{tin:"08:00"}},header:{total_hours:"1:00"}})', auth);
  await vm.runInContext('cgFlushOfflineQueue()', auth);
  assert.strictEqual(auth.calls.length, 0, 'auth failure does not call the data API');
  assert.strictEqual(queueOf(auth).length, 1, 'auth failure keeps the op');
  assert.strictEqual(auth.els.offlineQueueStatus.textContent, 'Sign in again — this phone kept your day.');
  assert.strictEqual(queueOf(auth)[0].attempt_count, 1);

  const held = run({onLine:false});
  vm.runInContext('cgQueueWeekOp("submit",{client_id:"c-1",week_start:"2026-09-20",days:{"0":{tin:"08:00"}},header:{total_hours:"4:00"}})', held);
  await vm.runInContext('cgFlushOfflineQueue()', held);
  assert.strictEqual(held.calls.length, 0, 'flush while offline does not call Supabase');
  assert.strictEqual(queueOf(held).length, 1);

  const refresh = run({onLine:true});
  refresh.currentUser.sbExpiresAt = Date.now() - 5000;
  vm.runInContext('cgQueueWeekOp("save_day",{client_id:"c-1",week_start:"2026-09-20",days:{"0":{tin:"08:00",svcs:["Bathing"]}},header:{total_hours:"4:00",client_name:"Ada Client"}})', refresh);
  await vm.runInContext('cgFlushOfflineQueue()', refresh);
  const refreshCall = refresh.calls.find(function(c){return c.url.indexOf('grant_type=refresh_token') >= 0;});
  assert.ok(refreshCall, 'expired jwt is refreshed before flush');
  const wrote = refresh.calls.find(function(c){return c.url.indexOf('/rest/v1/timesheets') >= 0 && c.init.method === 'POST';});
  assert.ok(wrote, 'save still writes after refresh');
  assert.strictEqual(wrote.init.headers.Authorization, 'Bearer jwt-refreshed');
  assert.ok(refresh.calls.indexOf(refreshCall) < refresh.calls.indexOf(wrote));

  const backed = run({onLine:true, failTimesheet:true});
  vm.runInContext('cgQueueWeekOp("save_day",{client_id:"c-1",week_start:"2026-09-20",days:{"0":{tin:"08:00",svcs:["Bathing"]}},header:{total_hours:"4:00",client_name:"Ada Client"}})', backed);
  await vm.runInContext('cgFlushOfflineQueue()', backed);
  const heldOp = queueOf(backed).filter(function(op){return op.kind === 'save_day';})[0];
  assert.ok(heldOp, 'a failed write stays queued');
  assert.strictEqual(heldOp.attempt_count, 1);
  assert.strictEqual(heldOp.last_error, "The office couldn't take the upload. Tap to retry.");
  const waitMs = Date.parse(heldOp.next_attempt_at) - Date.now();
  assert.ok(waitMs > 200 && waitMs <= 1500, 'first retry waits about 1s');
  const tried = backed.calls.filter(function(c){return c.url.indexOf('/rest/v1/timesheets') >= 0 && c.init.method === 'POST';}).length;
  assert.ok(tried >= 1);
  await vm.runInContext('cgFlushOfflineQueue()', backed);
  assert.strictEqual(backed.calls.filter(function(c){return c.url.indexOf('/rest/v1/timesheets') >= 0 && c.init.method === 'POST';}).length, tried, 'backoff holds the next automatic flush');

  console.log('caregiver offline save checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
