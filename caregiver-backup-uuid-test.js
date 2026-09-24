#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const CLIENT = 'af44b579-5881-46ea-8cb8-83a33c0af200';
const ORG = '33333333-3333-3333-3333-333333333333';
const AIDE = '22222222-2222-2222-2222-222222222222';
const ROW = 'c0ffee00-0000-4000-8000-000000000009';
const LOCAL = 'ts_1785608540832_ab12';
const STAMP = '1785608540832';

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

assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-backup-uuid">'), 'backup uuid meta');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-backup-uuid v=bakuuid1 —'), 'backup uuid marker');
assert.ok(html.includes('v=bakuuid1'), 'backup uuid probe');
assert.ok(html.includes('v=cgpdf1'), 'letter pdf stays');
assert.ok(html.includes('v=home1'), 'save-home stays');
assert.ok(html.includes('v=nocert1'), 'nocert stays');
assert.ok(html.includes('v=sbseal1'), 'auth seal stays');
assert.ok(html.includes('v=offline1'), 'offline save stays');
assert.ok(html.includes("if(!sbIsUuid(op.client_id))throw new Error('Pick a client first.');"), 'flush refuses a non-uuid client before upsert');
assert.ok(html.includes('if(row&&sbIsUuid(row.id))cgStampWeekTimesheetId(op,row.id)'), 'timesheet_id is stamped only from a server uuid');

const upsertSrc = extractFn(html, 'async function sbUpsertTimesheet(opts)');
assert.ok(!upsertSrc.includes('local_id:'), 'upsert does not copy local_id onto the row');
assert.ok(!upsertSrc.includes('client_op_id:'), 'upsert does not copy client_op_id onto the row');
assert.ok(upsertSrc.includes('delete insert.id'), 'insert drops timesheets.id');
assert.ok(upsertSrc.includes('legacy_id'), 'a millisecond id can ride only as legacy_id');

const urlConst = (html.match(/const SUPABASE_URL='([^']+)'/) || [])[1];
const keyConst = (html.match(/const SUPABASE_ANON_KEY='([^']+)'/) || [])[1];

const src = [
  extractFn(html, 'function evercareSbEnabled()'),
  extractFn(html, 'function sbUserHeaders(token)'),
  extractFn(html, 'async function sbRead(res)'),
  extractFn(html, 'function sbErrMsg(pack,fallback)'),
  extractFn(html, 'function sbToken()'),
  extractFn(html, 'function sbDataEnabled()'),
  extractFn(html, 'async function sbRest(path,opts)'),
  extractFn(html, 'function sbIsConflict(err)'),
  extractFn(html, 'async function sbEnsureOrgId()'),
  extractFn(html, 'function sbIsUuid(value)'),
  extractFn(html, 'function sbLegacyMs(value)'),
  extractFn(html, 'function sbClientRoster()'),
  extractFn(html, 'function sbAssignedClient(id)'),
  extractFn(html, 'function draftOfficeClient(ts)'),
  extractFn(html, 'function homeClientLabel(ts)'),
  extractFn(html, 'function askCloudBackup()'),
  extractFn(html, 'async function doCloudBackup()'),
  extractFn(html, 'function sbDayWire(day)'),
  extractFn(html, 'function sbWeekSunday(value)'),
  extractFn(html, 'function sbDayIndex(key)'),
  extractFn(html, 'function sbNormalizeDays(days)'),
  extractFn(html, 'function sbMergeDays(base,incoming)'),
  extractFn(html, 'function sbMergeDaysReplace(base,incoming)'),
  extractFn(html, 'function sbKeepSubmitted(existing,status)'),
  extractFn(html, 'function sbPatchTimesheet(id,body)'),
  extractFn(html, 'async function sbFindWeekRow(aideId,clientId,weekStart,status)'),
  extractFn(html, 'async function sbUpsertTimesheet(opts)'),
  'function closeModal(){}',
  'function openModal(id){opened.push(id);}',
  'function showTempMsg(msg){msgs.push(String(msg));}',
  'function getBackupTargetTS(){return target;}',
  'function weekDataForTS(){return {0:{tin:"08:00",tout:"12:00",hrs:"4:00",svcs:["Bathing"]}};}',
  'function daysPayloadFromWeekData(wd){return wd||{};}',
  'function totalHoursFromWeekData(){return "4:00";}',
  'function updateTSMeta(id,patch){metaWrites.push({id:id,patch:patch}); const row=drafts.find(function(t){return t.id===id;}); if(row)Object.assign(row,patch);}',
  'function renderTSHome(){rendered++;}'
].join('\n');

function run(opts){
  opts = opts || {};
  const calls = [];
  const box = {
    SUPABASE_URL: urlConst,
    SUPABASE_ANON_KEY: keyConst,
    location: {search: ''},
    localStorage: {getItem: function(){return null;}},
    currentUser: {
      username: 'mossier',
      name: 'Moss Aide',
      sbAccessToken: 'jwt-test-token',
      sbUserId: '11111111-1111-1111-1111-111111111111',
      sbAideId: AIDE,
      sbOrgId: ORG
    },
    currentTS: opts.currentTS || null,
    myClients: opts.myClients || [{id: CLIENT, name: 'Moe'}],
    drafts: opts.drafts,
    target: opts.target,
    msgs: [],
    opened: [],
    metaWrites: [],
    rendered: 0,
    calls: calls,
    JSON: JSON, Date: Date, Object: Object, Array: Array, String: String, Error: Error,
    encodeURIComponent: encodeURIComponent, Promise: Promise,
    fetch: function(url, init){
      calls.push({url: String(url), init: init || {}});
      const method = (init && init.method) || 'GET';
      const found = opts.foundRow;
      let raw = '[]';
      let status = 200;
      if(method === 'GET'){
        raw = JSON.stringify(found ? [found] : []);
      }else if(method === 'POST'){
        status = 201;
        raw = JSON.stringify([{id: ROW, status: 'backup'}]);
      }else if(method === 'PATCH'){
        raw = JSON.stringify([Object.assign({id: found && found.id || ROW, status: 'backup'}, JSON.parse(init.body))]);
      }
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status: status,
        text: function(){return Promise.resolve(raw);}
      });
    }
  };
  vm.createContext(box);
  vm.runInContext(src, box);
  return box;
}

function posts(box){
  return box.calls.filter(function(c){return (c.init.method || 'GET') === 'POST';});
}

(async function(){
  const missing = run({
    target: {id: LOCAL, clientName: '', clientId: '', weekStart: '2026-09-21', status: 'active'},
    drafts: [{id: LOCAL, clientName: '', clientId: '', weekStart: '2026-09-21', status: 'active'}]
  });
  await vm.runInContext('doCloudBackup()', missing);
  assert.ok(missing.msgs.some(function(m){return m.indexOf('Pick a client first') >= 0;}), 'missing client is blocked');
  assert.strictEqual(missing.calls.length, 0, 'missing client does not POST');
  assert.strictEqual(missing.rendered, 0);

  const stamped = run({
    target: {id: LOCAL, clientName: '', clientId: STAMP, weekStart: '2026-09-21', status: 'active'},
    drafts: [{id: LOCAL, clientName: '', clientId: STAMP, weekStart: '2026-09-21', status: 'active'}]
  });
  await vm.runInContext('doCloudBackup()', stamped);
  assert.ok(stamped.msgs.some(function(m){return m.indexOf('Pick a client first') >= 0;}), 'Date.now client id is blocked');
  assert.strictEqual(stamped.calls.length, 0, 'a timestamp is not sent as client_id');
  assert.strictEqual(stamped.drafts[0].id, LOCAL, 'local ts_* id stays local');

  const tsId = run({
    target: {id: LOCAL, clientName: '', clientId: LOCAL, weekStart: '2026-09-21', status: 'active'},
    drafts: [{id: LOCAL, clientName: '', clientId: LOCAL, weekStart: '2026-09-21', status: 'active'}]
  });
  await vm.runInContext('doCloudBackup()', tsId);
  assert.strictEqual(tsId.calls.length, 0, 'ts_* is not sent as a uuid');

  vm.runInContext('askCloudBackup()', stamped);
  assert.strictEqual(stamped.opened.length, 0, 'confirm does not open when no assigned client');

  const named = run({
    target: {id: LOCAL, clientName: '', clientId: CLIENT, weekStart: '2026-09-21', notes: 'n', status: 'active'},
    drafts: [{id: LOCAL, clientName: '', clientId: CLIENT, weekStart: '2026-09-21', notes: 'n', status: 'active'}]
  });
  assert.strictEqual(vm.runInContext('homeClientLabel(target)', named), 'Moe', 'card name comes from the assignment');
  await vm.runInContext('doCloudBackup()', named);
  assert.ok(named.msgs.some(function(m){return m.indexOf('Backed up') >= 0;}), named.msgs.join(' | '));
  const get = named.calls.find(function(c){return (c.init.method || 'GET') === 'GET';});
  const post = posts(named);
  assert.ok(get, 'create-before-backup looks up the week');
  const q = decodeURIComponent(get.url);
  assert.ok(q.indexOf('org_id=eq.' + ORG) >= 0, 'natural key includes org');
  assert.ok(q.indexOf('aide_id=eq.' + AIDE) >= 0, 'natural key includes aide');
  assert.ok(q.indexOf('client_id=eq.' + CLIENT) >= 0, 'natural key includes the assignment client');
  assert.ok(q.indexOf('week_start=eq.2026-09-20') >= 0, 'natural key includes Sunday week_start');
  assert.ok(q.indexOf('is_active=eq.true') >= 0, 'natural key is the active row');
  assert.ok(q.indexOf(STAMP) < 0, 'lookup does not use the phone timestamp');
  assert.strictEqual(post.length, 1, 'no existing row inserts one backup');
  const body = JSON.parse(post[0].init.body);
  assert.strictEqual(body.id, undefined, 'INSERT omits id');
  assert.strictEqual(body.local_id, undefined);
  assert.strictEqual(body.client_op_id, undefined);
  assert.strictEqual(body.client_id, CLIENT);
  assert.strictEqual(body.org_id, ORG);
  assert.strictEqual(body.aide_id, AIDE);
  assert.strictEqual(body.status, 'backup');
  assert.strictEqual(body.legacy_id, STAMP, 'phone millisecond id is legacy_id only');
  assert.strictEqual(body.client_name, 'Moe');
  assert.strictEqual(named.drafts[0].id, LOCAL);
  assert.strictEqual(named.drafts[0].cloudBackupId, ROW);
  assert.strictEqual(named.drafts[0].clientId, CLIENT);
  assert.ok(!named.calls.some(function(c){
    const raw = JSON.stringify(c.init.body || '') + c.url;
    return raw.indexOf('"id":"' + STAMP + '"') >= 0 || raw.indexOf('id=eq.' + STAMP) >= 0 || raw.indexOf(LOCAL) >= 0;
  }), 'local ids never appear as uuid column values');

  const again = run({
    foundRow: {id: ROW, status: 'backup', days: {'0': {tin: '08:00', svcs: ['Bathing']}}},
    target: {id: LOCAL, clientName: 'Moe', clientId: CLIENT, weekStart: '2026-09-21', status: 'active'},
    drafts: [{id: LOCAL, clientName: 'Moe', clientId: CLIENT, weekStart: '2026-09-21', status: 'active'}]
  });
  await vm.runInContext('doCloudBackup()', again);
  assert.strictEqual(posts(again).length, 0, 'an existing week is patched');
  const patch = again.calls.find(function(c){return c.init.method === 'PATCH';});
  assert.ok(patch.url.indexOf('id=eq.' + ROW) >= 0);
  const patchBody = JSON.parse(patch.init.body);
  assert.strictEqual(patchBody.id, undefined);
  assert.strictEqual(patchBody.client_id, undefined);
  assert.strictEqual(patchBody.org_id, undefined);
  assert.strictEqual(patchBody.aide_id, undefined);
  assert.strictEqual(patchBody.legacy_id, undefined);
  assert.strictEqual(patchBody.status, 'backup');
  assert.strictEqual(again.drafts[0].cloudBackupId, ROW);

  const bare = run({myClients: []});
  await assert.rejects(function(){
    return vm.runInContext('sbUpsertTimesheet({clientId:"' + STAMP + '",weekStart:"2026-09-21",status:"backup",days:{},header:{}})', bare);
  }, /Pick a client first/);
  assert.strictEqual(bare.calls.length, 0, 'shared upsert does not POST a timestamp client_id');
  await assert.rejects(function(){
    return vm.runInContext('sbUpsertTimesheet({clientId:"' + LOCAL + '",weekStart:"2026-09-21",status:"backup",legacyId:"' + LOCAL + '",local_id:"' + LOCAL + '",client_op_id:"op-1",days:{},header:{}})', bare);
  }, /Pick a client first/);
  assert.strictEqual(bare.calls.length, 0, 'shared upsert does not POST a ts_* client_id');

  const byName = run({
    target: {id: LOCAL, clientName: 'Moe', clientId: STAMP, weekStart: '2026-09-21', status: 'active'},
    drafts: [{id: LOCAL, clientName: 'Moe', clientId: STAMP, weekStart: '2026-09-21', status: 'active'}]
  });
  assert.strictEqual(vm.runInContext('homeClientLabel(target)', byName), 'Moe');
  await vm.runInContext('doCloudBackup()', byName);
  const namedPost = JSON.parse(posts(byName)[0].init.body);
  assert.strictEqual(namedPost.client_id, CLIENT, 'the assignment uuid replaces the phone timestamp');
  assert.strictEqual(namedPost.legacy_id, STAMP);
  assert.strictEqual(byName.drafts[0].clientId, CLIENT);

  console.log('caregiver-backup-uuid checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
