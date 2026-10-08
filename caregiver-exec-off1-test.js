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
function count(re){
  const m = html.match(re);
  return m ? m.length : 0;
}

assert.strictEqual(count(/script\.google\.com/g), 0, 'script.google.com count');
assert.strictEqual(count(/script\.google\.com\/macros|AKfycb|SHEETS_URL/g), 0, 'P2 sheets url count');
assert.strictEqual(count(/\/exec/g), 0, '/exec count');
assert.strictEqual(count(/sheets=1/g), 0, 'sheets=1 count');
assert.strictEqual(count(/Apps Script/g), 0, 'Apps Script count');
assert.strictEqual(count(/warmkeep/g), 0, 'warmkeep count');
assert.strictEqual(count(/Sheets/g), 0, 'Sheets count');
assert.strictEqual(count(/warmUpSheets|aceExecSoft/g), 0, 'warm-up count');
assert.strictEqual(count(/sbPullSheetsTimesheetPdf|render_timesheet_pdf/g), 0, 'server pdf count');
assert.strictEqual(count(/fetch\(SHEETS_URL/g), 0, 'fetch SHEETS_URL count');
assert.ok(!html.includes('function apiPost('), 'apiPost is gone');
assert.ok(!html.includes('function switchTab('), 'signup tab switch is gone');
assert.ok(!html.includes('reset_user'), 'forgot username field is gone');
assert.ok(!html.includes('reset_newpwd'), 'in-modal new password is gone');
assert.ok(html.includes('data-exec-off1="EXEC_OFF1"'), 'EXEC_OFF1 marker');
assert.ok(html.includes('data-exec-cache="?v=exec-off1"'), 'exec-off1 cache tag');
assert.ok(html.includes('start_url:\'.\''), 'manifest start url stays clean');
assert.ok(html.includes('"start_url":"."') || html.includes('%22start_url%22:%22.%22'), 'home screen start url stays clean');
assert.ok(html.includes('const CG_SESSION_MS=8*60*60*1000;'), 'session stays 8 hours');
assert.ok(html.includes('sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H'), 'html2canvas SRI');
assert.ok(html.includes('sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk'), 'jspdf SRI');
assert.ok(html.includes("'/rest/v1/rpc/aide_login_email'"), 'sign-in stays aide_login_email');
assert.ok(!html.includes('resolve_' + 'username_email'), 'old username rpc stays gone');
assert.ok(html.includes('5510 Pearl Rd Ste 200, Cleveland, OH 44129'), 'office address stays on the page');
assert.ok(html.includes('(216) 377-5991'), 'office line stays on the page');

const correction = extractFn(html, 'async function checkForCorrection()');
assert.ok(correction.includes('status=eq.correction_requested'), 'corrections read correction_requested rows');
assert.ok(correction.includes('&is_active=eq.true'), 'corrections read active rows');
assert.ok(correction.includes('sbRest('), 'corrections use the aide JWT read');
assert.ok(!correction.includes('fetch('), 'corrections do not fetch Apps Script');
assert.ok(correction.includes('emptyCorrection'), 'a failed correction load is an empty state');

const submit = extractFn(html, 'async function doFinalSubmit()');
const offMsg = extractFn(html, 'function sheetsOffMessage(kind)');
assert.ok(offMsg.includes('still here') && offMsg.includes('(216) 377-5991'), 'save copy names the office and keeps the entries');
assert.ok(submit.includes('sheetsOffMessage()'), 'a failed submit names the office and keeps the form');
assert.ok(submit.indexOf('sheetsOffMessage()') < submit.indexOf('currentTS=null'), 'the form is cleared only after a successful save');
assert.ok(!submit.includes('e.message'), 'a failed submit does not show the raw error');
assert.ok(!submit.includes("action:'submit'") && !submit.includes("action:'resubmit'"), 'submit does not post Apps Script');

const sw = fs.readFileSync(path.join(__dirname, 'caregiver-push-sw.js'), 'utf8');
assert.ok(!/script\.google\.com|AKfycb|SHEETS_URL/.test(sw), 'service worker has no Apps Script url');

function screenBlock(id){
  const start = html.indexOf('id="' + id + '"');
  assert.ok(start > 0, id);
  return html.slice(start, start + 500);
}
assert.ok(screenBlock('authScreen').length > 40, 'login screen markup is present');
assert.ok(html.includes('id="caregiverScreen"'), 'timesheet screen markup is present');
assert.ok(html.includes('id="inserviceScreen"'), 'in-service screen markup is present');
assert.ok(html.includes('id="l_user"') && html.includes('id="loginBtn"'), 'login card still has username and Sign In');

const urlConst = (html.match(/const SUPABASE_URL='([^']+)'/) || [])[1];
const keyConst = (html.match(/const SUPABASE_ANON_KEY='([^']+)'/) || [])[1];

function el(extra){
  const node = {
    textContent: '',
    value: '',
    innerHTML: '',
    className: '',
    style: {display: ''},
    classList: {
      _on: {},
      add: function(c){node.classList._on[c] = true;},
      remove: function(c){delete node.classList._on[c];},
      contains: function(c){return !!node.classList._on[c];}
    },
    options: [{text: 'Ada Client'}],
    selectedIndex: 0
  };
  return Object.assign(node, extra || {});
}

function boot(opts){
  opts = opts || {};
  const calls = [];
  const nodes = {
    correctionBanner: el(),
    authScreen: el(),
    caregiverScreen: el(),
    inserviceScreen: el(),
    cg_client: el(),
    cg_svctype: el({value: 'Personal Care'}),
    cg_weekstart: el({value: '2026-09-20'}),
    cg_total: el({textContent: '4:00'}),
    cg_notes: el({value: 'Laundry'})
  };
  const box = {
    SUPABASE_URL: urlConst,
    SUPABASE_ANON_KEY: keyConst,
    currentUser: {username: 'aide.one', name: 'Aide One', sbAccessToken: 'jwt-test-token'},
    currentTS: 'local-ts',
    correctionData: null,
    list: [],
    msgs: [],
    JSON: JSON,
    Date: Date,
    Object: Object,
    Array: Array,
    String: String,
    Error: Error,
    encodeURIComponent: encodeURIComponent,
    document: {
      body: el(),
      getElementById: function(id){return nodes[id] || el();},
      querySelectorAll: function(sel){
        if(sel === '.screen')return [nodes.authScreen, nodes.caregiverScreen, nodes.inserviceScreen];
        return [];
      }
    },
    window: {scrollTo: function(){}},
    setTimeout: function(){return 0;},
    aideSetupRequired: function(){return false;},
    getAllTimesheets: function(){return box.list;},
    saveAllTimesheets: function(list){box.list = list;},
    store: {set: function(){}, get: function(){return null;}},
    renderTSHome: function(){box.rendered = true;},
    showTempMsg: function(msg){box.msgs.push(String(msg));},
    requireClientSelected: function(){return true;},
    requireHeaderSignatures: function(){return true;},
    requirePaperSignatures: function(){return true;},
    getGpsPosition: function(){return Promise.resolve({coords: {latitude: 1, longitude: 2}});},
    saveLocationStatus: function(){},
    buildDaysPayload: function(){return {0: {tin: '08:00', tout: '12:00'}};},
    getSelectedClient: function(){return {id: 'af44b579-5881-46ea-8cb8-83a33c0af200', name: 'Ada Client'};},
    evercareSbEnabled: function(){return true;},
    cgShouldSyncNow: function(){return true;},
    sbDataEnabled: function(){return opts.noJwt ? false : true;},
    sbUpsertTimesheet: function(){return Promise.reject(new Error('save failed'));},
    cgIsNetErr: function(){return false;},
    cgIsAuthErr: function(){return false;},
    cgEnqueueSubmit: function(){},
    cgPaintOfflineQueue: function(){},
    updateTSMeta: function(){},
    captureHdrSigs: function(){return {};},
    aceRejectMessage: function(){return 'rejected';},
    fetch: function(url, init){
      const rec = {url: String(url), init: init || {}};
      calls.push(rec);
      if(/script\.google\.com|\/exec/.test(rec.url)){
        return Promise.resolve({
          ok: false,
          status: opts.status || 401,
          text: function(){return Promise.resolve('<html><title>Sign in</title></html>');}
        });
      }
      const body = opts.rows || [];
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function(){return Promise.resolve(JSON.stringify(body));}
      });
    }
  };
  const src = [
    extractFn(html, 'function sbUserHeaders(token)'),
    extractFn(html, 'function sbToken()'),
    extractFn(html, 'async function sbRead(res)'),
    extractFn(html, 'function sbErrMsg(pack,fallback)'),
    extractFn(html, 'async function sbRest(path,opts)'),
    extractFn(html, 'function nyCivilYmd(date)'),
    extractFn(html, 'function civilWeekSunday(ymd)'),
    extractFn(html, 'function currentWeekSunday()'),
    extractFn(html, 'function formatWeekOfLabel(val)'),
    extractFn(html, 'function correctionNoteText(note)'),
    extractFn(html, 'function paintCorrectionBanner(banner, data)'),
    extractFn(html, 'function sheetsOffMessage(kind)'),
    extractFn(html, 'function cgWarnRaw(where, err)'),
    extractFn(html, 'function syncCorrectionsFromAdmin(rows)'),
    correction,
    extractFn(html, 'function showScreen(id)')
  ].join('\n');
  vm.createContext(box);
  vm.runInContext(src, box);
  box.calls = calls;
  box.nodes = nodes;
  return box;
}

(async function(){
  const row = {
    id: 'c0ffee00-0000-4000-8000-000000000009',
    client_name: 'Ada Client',
    week_start: '2026-09-20',
    total_hours: '4:00',
    notes: '',
    days: {1: {tin: '08:00', tout: '12:00'}},
    correction_days: [1],
    correction_note: 'Fix Monday',
    submitted_at: '2026-09-24T12:00:00.000Z'
  };
  const painted = boot({rows: [row]});
  await painted.checkForCorrection();
  assert.strictEqual(painted.calls.length, 1, 'one correction read');
  assert.ok(painted.calls[0].url.indexOf('/rest/v1/timesheets?') >= 0, painted.calls[0].url);
  assert.ok(painted.calls[0].url.indexOf('status=eq.correction_requested') >= 0, 'status filter');
  assert.ok(painted.calls[0].url.indexOf('is_active=eq.true') >= 0, 'active filter');
  assert.strictEqual(painted.calls[0].init.headers.Authorization, 'Bearer jwt-test-token');
  assert.ok(painted.nodes.correctionBanner.classList.contains('show'), 'banner shows');
  assert.ok(painted.nodes.correctionBanner.textContent.indexOf('Week of 09/20/2026') >= 0, painted.nodes.correctionBanner.textContent);
  assert.ok(painted.nodes.correctionBanner.textContent.indexOf('needs corrections') >= 0);
  assert.ok(painted.nodes.correctionBanner.textContent.indexOf('Fix Monday') >= 0, 'the office note is on the banner');
  assert.strictEqual(painted.correctionData.clientName, 'Ada Client');
  assert.deepStrictEqual(painted.correctionData.correctionDays, [1]);
  assert.strictEqual(painted.list.length, 1, 'home list keeps the request');
  assert.ok(painted.rendered, 'home repaints');

  const empty = boot({rows: []});
  empty.nodes.correctionBanner.classList.add('show');
  await empty.checkForCorrection();
  assert.ok(!empty.nodes.correctionBanner.classList.contains('show'), 'no rows is an empty banner');

  for(const status of [401, 302, 403]){
    const locked = boot({status: status});
    locked.fetch = function(url){
      locked.calls.push({url: String(url)});
      return Promise.resolve({
        ok: false,
        status: status,
        text: function(){return Promise.resolve('<html><title>Sign in - Google Accounts</title></html>');}
      });
    };
    locked.nodes.correctionBanner.classList.add('show');
    await locked.checkForCorrection();
    assert.ok(!locked.nodes.correctionBanner.classList.contains('show'), 'status ' + status + ' is an empty state');
    assert.deepStrictEqual(locked.msgs, [], 'status ' + status + ' does not toast an error');
    assert.ok(!locked.calls.some(function(c){return /script\.google\.com|\/exec/.test(c.url);}), 'status ' + status + ' does not call Apps Script');
  }

  const screens = boot({});
  vm.runInContext("showScreen('authScreen');showScreen('caregiverScreen');showScreen('inserviceScreen');", screens);
  assert.ok(screens.nodes.inserviceScreen.classList.contains('active'), 'in-service screen renders');
  assert.ok(!screens.nodes.authScreen.classList.contains('active'), 'login yields to the next screen');
  assert.strictEqual(screens.calls.length, 0, 'showing screens does not call out');

  const failed = boot({});
  vm.runInContext(submit, failed);
  const before = failed.currentTS;
  await failed.doFinalSubmit();
  assert.strictEqual(failed.currentTS, before, 'a failed submit keeps the open timesheet');
  assert.ok(failed.msgs.some(function(m){return m.indexOf('(216) 377-5991') >= 0 && m.indexOf('still here') >= 0 && m.indexOf('save failed') < 0;}), failed.msgs.join(' | '));
  assert.ok(!failed.calls.some(function(c){return /script\.google\.com|\/exec/.test(c.url);}), 'submit failure does not call Apps Script');

  console.log('caregiver-exec-off1 checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
