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
function extractConst(name){
  const start = html.indexOf('const ' + name + '=');
  assert.ok(start >= 0, 'missing const ' + name);
  const end = html.indexOf('];', start);
  assert.ok(end > start, 'unclosed const ' + name);
  return html.slice(start, end + 2);
}

assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-sb-pdf-write — ?sb=1 Save Day and Submit render/refresh the timesheet PDF into Storage; flag off stays on Sheets /exec -->'), 'pdf write build marker');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-sb-auth-login">'), 'auth build meta stays');
assert.ok(!/service_role/i.test(html), 'service_role must not be embedded');
assert.ok(html.includes("const SB_PDF_BUCKET='evercare-pdfs'"), 'bucket is evercare-pdfs');
assert.ok(html.includes('assets/blank-letter.png?v=a713ovl'), 'paper form blank');
assert.ok(fs.existsSync(path.join(__dirname, 'assets/blank-letter.png')), 'blank letter asset is in the tip');
assert.ok(html.includes('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'), 'html2canvas overlay');
assert.ok(html.includes('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'), 'jsPDF overlay');
assert.ok(!html.includes('pdf_link'), 'do not read or clear Sheet PdfLink');

const uploadFn = extractFn(html, 'async function uploadTimesheetPdf(opts)') + '\n' + extractFn(html, 'async function sbStorageUploadPdf(objectPath,pdfBytes)');
assert.ok(uploadFn.includes('/storage/v1/object/'), 'storage upload');
assert.ok(uploadFn.includes("'x-upsert':'true'"), 'upsert header');
assert.ok(uploadFn.includes("pdf_storage_path:objectPath"), 'patch storage path');
assert.ok(uploadFn.includes('pdf_documents?on_conflict=org_id,bucket,object_path'), 'pdf_documents upsert');
assert.ok(uploadFn.includes("doc_kind:'timesheet'"), 'doc kind');
assert.ok(uploadFn.indexOf('sbStorageUploadPdf') < uploadFn.indexOf('pdf_storage_path:objectPath'), 'upload before path patch');
assert.ok(uploadFn.indexOf('pdf_storage_path:objectPath') < uploadFn.indexOf('pdf_documents?'), 'path patch before registry');

const saveDay = extractFn(html, 'function saveDayData(i,dayObj)');
assert.ok(saveDay.includes('if(sbDataEnabled())sbSyncSavedDay'), 'flag on Save Day still syncs');
assert.ok(saveDay.indexOf("action:'save_timesheet_backup'") < 0, 'save day data does not post sheets itself');
const sync = extractFn(html, 'function sbSyncSavedDay(i,dayObj)');
assert.ok(sync.includes('sbRefreshTimesheetPdf(row.id)'), 'Save Day refresh runs after the week row id is known');
assert.ok(sync.includes('sbUpsertTimesheet'), 'Save Day still upserts the backup row');
assert.ok(sync.indexOf('sbUpsertTimesheet') < sync.indexOf('sbRefreshTimesheetPdf'), 'refresh follows the upsert');
const fin = extractFn(html, 'async function doFinalSubmit()');
assert.ok(fin.includes("action:'submit'"), 'flag off submit stays on /exec');
assert.ok(fin.includes('sbRefreshTimesheetPdf(row.id,weekData)'), 'soft submit refreshes the PDF');
assert.ok(fin.indexOf('evercareSbEnabled()') < fin.indexOf('sbRefreshTimesheetPdf'));
assert.ok(fin.indexOf('sbRefreshTimesheetPdf') < fin.indexOf("action:'submit'"), 'sheets submit is the flag-off branch');

const urlConst = (html.match(/const SUPABASE_URL='([^']+)'/) || [])[1];
const keyConst = (html.match(/const SUPABASE_ANON_KEY='([^']+)'/) || [])[1];
const pdfStart = html.indexOf('const SB_PDF_BUCKET=');
const pdfEnd = html.indexOf('// GHOST-CAREGIVER-DUAL-WRITE-CONTRACT-v1 §5.4');
assert.ok(pdfStart > 0 && pdfEnd > pdfStart, 'pdf block bounds');
const pdfBlock = html.slice(pdfStart, pdfEnd);

const src = [
  extractConst('PERSONAL_CARE'),
  extractConst('ELIMINATION'),
  extractConst('HOUSEHOLD'),
  extractConst('MOBILITY'),
  extractConst('TREATMENTS'),
  extractConst('NUTRITION'),
  extractFn(html, 'function evercareSbEnabled()'),
  extractFn(html, 'function sbUserHeaders(token)'),
  extractFn(html, 'async function sbRead(res)'),
  extractFn(html, 'function sbErrMsg(pack,fallback)'),
  extractFn(html, 'function sbToken()'),
  extractFn(html, 'function sbDataEnabled()'),
  extractFn(html, 'async function sbRest(path,opts)'),
  extractFn(html, 'async function sbEnsureOrgId()'),
  extractFn(html, 'function sbDayWire(day)'),
  extractFn(html, 'function sbWeekSunday(value)'),
  extractFn(html, 'function sbDayIndex(key)'),
  extractFn(html, 'function sbNormalizeDays(days)'),
  extractFn(html, 'async function sbFindWeekRow(aideId,clientId,weekStart,status)'),
  extractFn(html, 'function sbMergeDays(base,incoming)'),
  extractFn(html, 'async function sbUpsertTimesheet(opts)'),
  sync,
  pdfBlock
].join('\n');

function bytesToString(body){
  if(body == null)return '';
  if(typeof body === 'string')return body;
  const u8 = body instanceof Uint8Array ? body : new Uint8Array(body.buffer || body);
  let s = '';
  for(let i = 0; i < u8.length; i++)s += String.fromCharCode(u8[i]);
  return s;
}

function run(opts){
  const calls = [];
  const warnings = [];
  const els = {
    cg_weekstart: {value: '2026-09-23'},
    cg_notes: {value: 'Extra laundry'},
    cg_svctype: {value: 'Personal Care'},
    cg_total: {textContent: '4:00'},
    cg_other_specify: {value: ''}
  };
  const box = {
    SUPABASE_URL: urlConst,
    SUPABASE_ANON_KEY: keyConst,
    window: {},
    location: {search: opts.search == null ? '?sb=1' : opts.search},
    localStorage: {getItem: function(){return null;}},
    document: {getElementById: function(id){return els[id] || {value: '', textContent: ''};}},
    currentUser: opts.currentUser || {
      username: 'aide.one',
      name: 'Aide One',
      sbAccessToken: 'jwt-test-token',
      sbUserId: '11111111-1111-1111-1111-111111111111',
      sbAideId: '22222222-2222-2222-2222-222222222222',
      sbOrgId: '4f97f4d3-6635-4544-904c-6b06aa02d40b'
    },
    currentTS: 'local-ts',
    console: {warn: function(){warnings.push(Array.prototype.join.call(arguments, ' '));}},
    showTempMsg: function(msg){box._msgs.push(msg);},
    _msgs: [],
    updateTSMeta: function(id, patch){box._meta = {id: id, patch: patch};},
    getAllTimesheets: function(){return [{id: 'local-ts', clientName: 'Ada Client', clientId: 'c-1', weekStart: '2026-09-20', notes: ''}];},
    getSelectedClient: function(){return {id: 'c-1', name: 'Ada Client'};},
    getUserWeekData: function(){
      return {
        1: {
          date: '2026-09-21',
          tin: '08:00',
          tout: '12:00',
          hrs: '4:00',
          svcs: ['Assist W/Bath-Bed/Tub/Shower'],
          aideSig: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          clientSig: 'signed-mark',
          clientSigInk: true
        }
      };
    },
    totalHoursFromWeekData: function(){return '4:00';},
    JSON: JSON, Date: Date, Object: Object, Array: Array, String: String, Error: Error,
    Uint8Array: Uint8Array, Blob: Blob, Promise: Promise, encodeURIComponent: encodeURIComponent,
    fetch: function(url, init){
      calls.push({url: String(url), init: init || {}});
      const u = String(url);
      const method = (init && init.method) || 'GET';
      if(u.indexOf('/storage/v1/object/') >= 0){
        const res = opts.storageFail
          ? {ok: false, status: 500, raw: 'storage denied'}
          : {ok: true, status: 200, raw: '{"Key":"ok"}'};
        return Promise.resolve({ok: res.ok, status: res.status, text: function(){return Promise.resolve(res.raw);}});
      }
      if(u.indexOf('/pdf_documents') >= 0){
        return Promise.resolve({ok: true, status: 201, text: function(){return Promise.resolve('');}});
      }
      if(u.indexOf('/rest/v1/timesheets') >= 0 && method === 'PATCH'){
        return Promise.resolve({ok: true, status: 200, text: function(){return Promise.resolve(JSON.stringify([{id: 'ts-9', status: 'backup'}]));}});
      }
      if(u.indexOf('/rest/v1/timesheets') >= 0){
        return Promise.resolve({ok: true, status: 200, text: function(){return Promise.resolve(JSON.stringify([{id: 'ts-9', status: 'backup', days: {}}]));}});
      }
      if(u.indexOf('/rest/v1/profiles') >= 0){
        return Promise.resolve({ok: true, status: 200, text: function(){return Promise.resolve('[]');}});
      }
      return Promise.resolve({ok: true, status: 200, text: function(){return Promise.resolve('[]');}});
    }
  };
  vm.createContext(box);
  vm.runInContext(src, box);
  box.calls = calls;
  box.warnings = warnings;
  return box;
}

function settle(){
  return new Promise(function(resolve){setTimeout(resolve, 40);});
}

(async function(){
  const org = '4f97f4d3-6635-4544-904c-6b06aa02d40b';
  const printBox = run({});
  const htmlOut = vm.runInContext('buildTimesheetPrintHtml(' + JSON.stringify({
    clientName: 'Ada Client',
    empName: 'Aide One',
    totalHrs: '4:00',
    notes: 'Extra laundry',
    days: {
      1: {
        date: '2026-09-21',
        tin: '08:00',
        tout: '12:00',
        hrs: '4:00',
        svcs: ['Assist W/Bath-Bed/Tub/Shower'],
        aideSig: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        clientSig: 'mark',
        clientSigInk: true
      }
    }
  }) + ')', printBox);
  assert.ok(htmlOut.indexOf('Ada Client') >= 0, 'overlay names the client');
  assert.ok(htmlOut.indexOf('Aide One') >= 0, 'overlay names the caregiver');
  assert.ok(htmlOut.indexOf('8:00 AM') >= 0, 'time in is on the paper row');
  assert.ok(htmlOut.indexOf('12:00 PM') >= 0, 'time out is on the paper row');
  assert.ok(htmlOut.indexOf('09/21/26') >= 0, 'day date is on the paper row');
  assert.ok(htmlOut.indexOf('class="ts-sig"') >= 0, 'aide signature image is placed');
  assert.ok(htmlOut.indexOf('✓') >= 0, 'service or client signature mark is placed');
  assert.ok(htmlOut.indexOf('assets/blank-letter.png') >= 0, 'blank form is the overlay background');
  assert.ok(htmlOut.indexOf('Extra laundry') >= 0, 'notes are on the form');

  const off = run({search: ''});
  const offResult = await vm.runInContext('sbRefreshTimesheetPdf("ts-9")', off);
  assert.strictEqual(offResult, false, 'flag off does not write a PDF');
  assert.strictEqual(off.calls.length, 0, 'flag off makes no supabase calls');

  const saved = run({});
  vm.runInContext('sbSyncSavedDay(1,{date:"2026-09-21",tin:"08:00",tout:"12:00",hrs:"4:00",svcs:["Assist W/Bath-Bed/Tub/Shower"],aideSig:"data:image/png;base64,aaa",clientSig:"sig"})', saved);
  await settle();
  assert.strictEqual(saved._msgs.length, 0, 'a PDF upload must not fail Save Day');
  assert.strictEqual(saved._meta.patch.cloudBackupId, 'ts-9');
  const storage = saved.calls.filter(function(c){return c.url.indexOf('/storage/v1/object/evercare-pdfs/') >= 0;});
  assert.strictEqual(storage.length, 1, 'one storage upload');
  assert.strictEqual(storage[0].init.method, 'POST');
  assert.strictEqual(storage[0].init.headers.Authorization, 'Bearer jwt-test-token');
  assert.strictEqual(storage[0].init.headers.apikey, keyConst);
  assert.strictEqual(storage[0].init.headers['Content-Type'], 'application/pdf');
  assert.strictEqual(storage[0].init.headers['x-upsert'], 'true');
  assert.ok(storage[0].url.indexOf('/evercare-pdfs/' + org + '/timesheet/ts-9.pdf') >= 0, storage[0].url);
  const pdfText = bytesToString(storage[0].init.body);
  assert.ok(pdfText.indexOf('%PDF') === 0, 'uploaded bytes are a real PDF');
  assert.ok(pdfText.indexOf('%%EOF') > 0, 'PDF trailer is present');
  assert.ok(pdfText.indexOf('/MediaBox [0 0 612 792]') > 0, 'letter page');
  assert.ok(pdfText.indexOf('Ada Client') > 0, 'PDF contains the client');
  assert.ok(pdfText.indexOf('08:00') > 0, 'PDF contains the saved time');
  assert.ok(pdfText.indexOf('aide signature on file') > 0, 'PDF records the aide signature');
  assert.ok(pdfText.indexOf('Assist W/Bath-Bed/Tub/Shower') > 0, 'PDF contains the service');
  const xrefAt = pdfText.indexOf('xref\n');
  const startxref = Number((pdfText.match(/startxref\n(\d+)/) || [])[1]);
  assert.strictEqual(startxref, xrefAt, 'xref offset matches');

  const patches = saved.calls.filter(function(c){return c.init.method === 'PATCH' && c.url.indexOf('/rest/v1/timesheets') >= 0;});
  assert.ok(patches.length >= 2, 'save patch plus pdf path patch');
  const pathPatch = patches[patches.length - 1];
  const pathBody = JSON.parse(pathPatch.init.body);
  assert.deepStrictEqual(pathBody, {pdf_storage_path: org + '/timesheet/ts-9.pdf'});
  assert.strictEqual(pathPatch.init.headers.Prefer, 'return=minimal');
  assert.strictEqual(pathPatch.init.headers.Authorization, 'Bearer jwt-test-token');
  const savePatch = JSON.parse(patches[0].init.body);
  assert.strictEqual(savePatch.status, 'backup');
  assert.strictEqual(savePatch.pdf_storage_path, undefined, 'Save Day body does not write the path');

  const docs = saved.calls.filter(function(c){return c.url.indexOf('/rest/v1/pdf_documents') >= 0;});
  assert.strictEqual(docs.length, 1);
  assert.strictEqual(docs[0].init.method, 'POST');
  assert.ok(docs[0].url.indexOf('on_conflict=org_id,bucket,object_path') >= 0);
  assert.strictEqual(docs[0].init.headers.Prefer, 'resolution=merge-duplicates,return=minimal');
  const docBody = JSON.parse(docs[0].init.body);
  assert.strictEqual(docBody.org_id, org);
  assert.strictEqual(docBody.doc_kind, 'timesheet');
  assert.strictEqual(docBody.entity_id, 'ts-9');
  assert.strictEqual(docBody.bucket, 'evercare-pdfs');
  assert.strictEqual(docBody.object_path, org + '/timesheet/ts-9.pdf');
  assert.strictEqual(docBody.content_type, 'application/pdf');
  assert.strictEqual(docBody.is_active, true);
  assert.strictEqual(docBody.byte_size, storage[0].init.body.byteLength);
  const storageAt = saved.calls.indexOf(storage[0]);
  const pathAt = saved.calls.indexOf(pathPatch);
  const docAt = saved.calls.indexOf(docs[0]);
  assert.ok(storageAt < pathAt && pathAt < docAt, 'upload, then path, then registry');

  const failed = run({storageFail: true});
  vm.runInContext('sbSyncSavedDay(1,{tin:"08:00",tout:"12:00",hrs:"4:00",svcs:["Bathing"],aideSig:"a",clientSig:"c"})', failed);
  await settle();
  assert.strictEqual(failed._msgs.length, 0, 'storage failure still leaves the day saved');
  assert.strictEqual(failed._meta.patch.cloudBackupId, 'ts-9');
  assert.ok(failed.warnings.some(function(w){return w.indexOf('timesheet pdf') >= 0;}), 'upload errors are logged quietly');
  assert.strictEqual(failed.calls.filter(function(c){return c.url.indexOf('/storage/v1/object/') >= 0;}).length, 1);
  const failedPatches = failed.calls.filter(function(c){return c.init.method === 'PATCH';});
  assert.strictEqual(failedPatches.length, 1, 'failed upload does not patch pdf_storage_path');
  assert.ok(!failed.calls.some(function(c){return c.url.indexOf('/pdf_documents') >= 0;}));

  const noOrg = run({currentUser: {username: 'aide.one', name: 'Aide One', sbAccessToken: 'jwt-test-token', sbUserId: '11111111-1111-1111-1111-111111111111', sbAideId: '22222222-2222-2222-2222-222222222222'}});
  const noOrgResult = await vm.runInContext('sbRefreshTimesheetPdf("ts-9",{1:{tin:"08:00",aideSig:"a",clientSig:"c",svcs:["Bathing"]}})', noOrg);
  assert.strictEqual(noOrgResult, false);
  assert.ok(!noOrg.calls.some(function(c){return c.url.indexOf('/storage/v1/') >= 0;}), 'missing org does not upload');

  console.log('caregiver-sb-pdf checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
