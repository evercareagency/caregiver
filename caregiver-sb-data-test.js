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

const urlConst = (html.match(/const SUPABASE_URL='([^']+)'/) || [])[1];
const keyConst = (html.match(/const SUPABASE_ANON_KEY='([^']+)'/) || [])[1];
const schedule = extractFn(html, 'function scheduleHomeBackgroundLoads()');
assert.ok(!/supabase/i.test(schedule), 'home scheduler must not name supabase');
assert.ok(schedule.includes("apiGetCached('get_clients')"), 'sheets client prefetch stays');
assert.ok(schedule.indexOf('sbLoadHomeLists(restoreBackups)') < schedule.indexOf('if(aceExecSoft())return'), 'flag on lists run before the sheets health skip');
const sheetsLogin = extractFn(html, 'async function doLogin()');
assert.ok(sheetsLogin.includes("action:'login'"), 'sheets login stays on the flag-off path');

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
  extractFn(html, 'function sbPaintClients()'),
  extractFn(html, 'async function sbLoadAssignedClients()'),
  extractFn(html, 'function sbTimesheetToBackup(row)'),
  extractFn(html, 'async function sbListTimesheetsForHome()'),
  extractFn(html, 'function sbDayWire(day)'),
  extractFn(html, 'async function sbFindWeekRow(aideId,clientId,weekStart,status)'),
  extractFn(html, 'function sbMergeDays(base,incoming)'),
  extractFn(html, 'function sbMergeDaysReplace(base,incoming)'),
  extractFn(html, 'function sbKeepSubmitted(existing,status)'),
  extractFn(html, 'function sbWeekSunday(value)'),
  extractFn(html, 'function sbDayIndex(key)'),
  extractFn(html, 'function sbNormalizeDays(days)'),
  extractFn(html, 'async function sbUpsertTimesheet(opts)'),
  extractFn(html, 'async function sbSoftDeleteBackup(id)'),
  extractFn(html, 'function sbAnswerList(raw)'),
  extractFn(html, 'function sbGradeInservice(topicId,answers)'),
  extractFn(html, 'async function sbSubmitInservice(payload)'),
  'function currentWeekSunday(){return "2026-09-20";}',
  'function persistCgSession(sess){currentUser=sess;return sess;}'
].join('\n');

function storage(){
  const mem = {};
  return {
    getItem: function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
    setItem: function(k, v){mem[k] = String(v);},
    removeItem: function(k){delete mem[k];}
  };
}

function run(opts){
  const calls = [];
  const sel = {value:'', innerHTML:''};
  const box = {
    SUPABASE_URL: urlConst,
    SUPABASE_ANON_KEY: keyConst,
    window: {},
    location: {search: opts.search == null ? '?sb=1' : opts.search},
    localStorage: storage(),
    document: {getElementById: function(){return sel;}},
    myClients: [],
    currentUser: opts.currentUser || {
      username: 'aide.one',
      name: 'Aide One',
      sbAccessToken: 'jwt-test-token',
      sbUserId: '11111111-1111-1111-1111-111111111111',
      sbAideId: '22222222-2222-2222-2222-222222222222',
      sbOrgId: '33333333-3333-3333-3333-333333333333'
    },
    JSON: JSON, Date: Date, Object: Object, Array: Array, String: String, Error: Error,
    encodeURIComponent: encodeURIComponent,
    fetch: function(url, init){
      calls.push({url: String(url), init: init || {}});
      const u = String(url);
      const found = (opts.routes || []).find(function(route){return route.test.test(u);});
      const res = found ? found.res : {ok:true, status:200, raw:'[]'};
      return Promise.resolve({
        ok: res.ok,
        status: res.status,
        text: function(){return Promise.resolve(res.raw);}
      });
    }
  };
  vm.createContext(box);
  vm.runInContext(src, box);
  box.calls = calls;
  box.sel = sel;
  return box;
}

(async function(){
  const bare = run({search:''});
  assert.strictEqual(vm.runInContext('sbDataEnabled()', bare), true, 'default uses the jwt data path with no ?sb=1');
  const sheets = run({search:'?sheets=1'});
  assert.strictEqual(vm.runInContext('sbDataEnabled()', sheets), false, 'sheets emergency does not use the jwt data path');
  const oldOpt = run({search:'?sb=0'});
  assert.strictEqual(vm.runInContext('sbDataEnabled()', oldOpt), true, 'missing or sb=0 does not fall through to Sheets');

  const clients = run({
    routes:[{
      test:/\/clients\?/,
      res:{ok:true, status:200, raw:JSON.stringify([
        {id:'c-off', name:'Inactive', is_active:false, lat:1, lng:2, assignments:[]},
        {id:'c-1', name:'Ada Client', address:'1 Main', lat:41.4, lng:-81.6, is_active:true, legacy_id:'14', assignments:[
          {id:'a-1', is_active:true, aide_id:'22222222-2222-2222-2222-222222222222', client_id:'c-1'},
          {id:'a-old', is_active:false, aide_id:'22222222-2222-2222-2222-222222222222', client_id:'c-1'}
        ]}
      ])}
    }]
  });
  const loaded = await vm.runInContext('sbLoadAssignedClients()', clients);
  assert.strictEqual(loaded.length, 1);
  assert.strictEqual(loaded[0].name, 'Ada Client');
  assert.strictEqual(loaded[0].assignments.length, 1);
  assert.strictEqual(loaded[0].assignedAides[0], 'aide.one');
  assert.ok(clients.sel.innerHTML.indexOf('Ada Client') >= 0);
  assert.ok(!clients.sel.innerHTML.includes('Inactive'));
  const clientUrl = decodeURIComponent(clients.calls[0].url);
  assert.ok(clientUrl.indexOf('/rest/v1/clients?') >= 0);
  assert.ok(clientUrl.indexOf('is_active=eq.true') >= 0);
  assert.ok(clientUrl.indexOf('assignments(id,is_active,aide_id,client_id)') >= 0);
  assert.strictEqual(clients.calls[0].init.headers.Authorization, 'Bearer jwt-test-token');
  assert.strictEqual(clients.calls[0].init.headers.apikey, keyConst);
  assert.strictEqual(clients.calls[0].init.method, 'GET');

  const lists = run({
    routes:[
      {test:/status=eq\.backup/, res:{ok:true, status:200, raw:JSON.stringify([
        {id:'bak-1', client_id:'c-1', client_name:'Ada Client', week_start:'2026-09-13', status:'backup', days:{'0':{tin:'08:00'}}, svc_type:'Personal Care/Home Making', notes:'n', updated_at:'2026-09-23T12:00:00Z'}
      ])}},
      {test:/week_start=eq\./, res:{ok:true, status:200, raw:JSON.stringify([
        {id:'bak-1', client_id:'c-1', client_name:'Ada Client', week_start:'2026-09-13', status:'backup', days:{}},
        {id:'sub-1', client_id:'c-1', client_name:'Ada Client', week_start:'2026-09-20', status:'submitted', days:{'1':{tin:'09:00'}}},
        {id:'dr-1', client_id:'c-2', client_name:'Bea', week_start:'2026-09-20', status:'draft', days:{'2':{tin:'10:00'}}}
      ])}}
    ]
  });
  const home = await vm.runInContext('sbListTimesheetsForHome()', lists);
  assert.strictEqual(home.success, true);
  assert.strictEqual(lists.calls.length, 1, 'get_my_backups is the backup select only');
  assert.ok(lists.calls[0].url.indexOf('status=eq.backup')>=0);
  assert.ok(lists.calls[0].url.indexOf('is_active=eq.true')>=0);
  assert.strictEqual(JSON.stringify(Array.prototype.map.call(home.data, function(row){return row.id;})), JSON.stringify(['bak-1']));
  assert.strictEqual(home.data[0].clientName, 'Ada Client');
  assert.strictEqual(home.data[0].clientId, 'c-1');
  assert.strictEqual(home.data[0].weekStart, '2026-09-13');
  assert.strictEqual(home.data[0].days['0'].tin, '08:00');

  const merge = run({
    routes:[{
      test:/limit=1/,
      res:{ok:true, status:200, raw:JSON.stringify([{id:'ts-1', status:'backup', days:{'0':{tin:'08:00', svcs:['Bathing']}}}])}
    },{
      test:/\/timesheets\?id=eq\.ts-1/,
      res:{ok:true, status:200, raw:JSON.stringify([{id:'ts-1', status:'backup'}])}
    }]
  });
  const merged = await vm.runInContext('sbUpsertTimesheet({clientId:"c-1",weekStart:"2026-09-23",status:"backup",days:{"Mon":{in:"09:00",out:"12:00",svcs:["Dressing"]}},header:{total_hours:"4:00",emp_name:"Aide One",client_name:"Ada Client",username:"aide.one",svc_type:"Personal Care/Home Making"}})', merge);
  assert.strictEqual(merged.id, 'ts-1');
  const patch = merge.calls.find(function(c){return c.init.method === 'PATCH';});
  assert.ok(patch, 'existing backup is patched');
  assert.ok(!merge.calls.some(function(c){return c.init.method === 'POST';}));
  const patchBody = JSON.parse(patch.init.body);
  assert.strictEqual(patchBody.days['0'].tin, '08:00', 'earlier day is kept');
  assert.deepStrictEqual(patchBody.days['0'].svcs, ['Bathing']);
  assert.strictEqual(patchBody.days['1'].tin, '09:00');
  assert.strictEqual(patchBody.days['1'].tout, '12:00');
  assert.strictEqual(patchBody.days.Mon, undefined);
  assert.ok(decodeURIComponent(merge.calls[0].url).indexOf('week_start=eq.2026-09-20')>=0, 'week_start is the Sunday of that week');
  assert.strictEqual(patchBody.total_hours, '4:00');
  assert.strictEqual(patchBody.emp_name, 'Aide One');
  assert.strictEqual(patchBody.status, 'backup');
  assert.strictEqual(patchBody.submitted_at, null);
  assert.strictEqual(patch.init.headers.Prefer, 'return=representation');
  assert.strictEqual(patch.init.headers.Authorization, 'Bearer jwt-test-token');

  const created = run({
    routes:[{
      test:/limit=1/,
      res:{ok:true, status:200, raw:'[]'}
    },{
      test:/\/rest\/v1\/timesheets$/,
      res:{ok:true, status:201, raw:JSON.stringify([{id:'ts-new', status:'backup'}])}
    }]
  });
  const inserted = await vm.runInContext('sbUpsertTimesheet({clientId:"c-1",weekStart:"2026-09-20",status:"backup",days:{"0":{tin:"08:00",hrs:"3:00",svcs:["Bathing"],aideSig:"a",clientSig:"c"}},header:{total_hours:"3:00",client_name:"Ada Client"}})', created);
  assert.strictEqual(inserted.id, 'ts-new');
  const post = created.calls.find(function(c){return c.init.method === 'POST';});
  const postBody = JSON.parse(post.init.body);
  assert.strictEqual(postBody.status, 'backup');
  assert.strictEqual(postBody.submitted_at, null);
  assert.strictEqual(postBody.is_active, true);
  assert.strictEqual(postBody.org_id, '33333333-3333-3333-3333-333333333333');
  assert.strictEqual(postBody.aide_id, '22222222-2222-2222-2222-222222222222');
  assert.strictEqual(postBody.client_id, 'c-1');
  assert.strictEqual(postBody.week_start, '2026-09-20');
  assert.strictEqual(postBody.days['0'].tin, '08:00');
  assert.strictEqual(postBody.emp_name, 'Aide One');

  const submit = run({
    routes:[{
      test:/aide_id=eq\./,
      res:{ok:true, status:200, raw:JSON.stringify([{id:'ts-1', status:'backup', days:{'0':{tin:'08:00'}}}])}
    },{
      test:/\/timesheets\?id=eq\.ts-1/,
      res:{ok:true, status:200, raw:JSON.stringify([{id:'ts-1', status:'submitted'}])}
    }]
  });
  const submitted = await vm.runInContext('sbUpsertTimesheet({clientId:"c-1",weekStart:"2026-09-20",status:"submitted",days:{"0":{tin:"08:00",svcs:["Bathing"]},"1":{tin:"10:00",svcs:["Laundry"]}},header:{total_hours:"8:00"}})', submit);
  assert.strictEqual(submitted.status, 'submitted');
  const submitPatch = submit.calls.find(function(c){return c.init.method === 'PATCH';});
  const submitBody = JSON.parse(submitPatch.init.body);
  assert.strictEqual(submitBody.status, 'submitted');
  assert.ok(submitBody.submitted_at);
  assert.strictEqual(submitBody.days['1'].tin, '10:00', 'submit writes the full days object');
  assert.strictEqual(submitBody.header_aide_sig, undefined);
  assert.strictEqual(submitBody.header_client_sig, undefined);
  assert.ok(!submit.calls.some(function(c){return c.init.method === 'POST';}));

  const clash = run({
    routes:[{
      test:/limit=1/,
      res:{ok:true, status:200, raw:JSON.stringify([{id:'ts-sub', status:'submitted', days:{'0':{tin:'08:00', tout:'12:00', svcs:['Bathing'], aideSig:'a'}, '2':{tin:'07:00'}}}])}
    },{
      test:/\/timesheets\?id=eq\.ts-sub/,
      res:{ok:true, status:200, raw:JSON.stringify([{id:'ts-sub', status:'submitted'}])}
    }]
  });
  const remarked = await vm.runInContext('sbUpsertTimesheet({clientId:"c-1",weekStart:"2026-09-20",status:"backup",days:{"0":{tin:"09:00"},"1":{tin:"10:00"},"2":{tin:"11:00",tout:"15:00",svcs:["Laundry"]}},header:{}})', clash);
  assert.strictEqual(remarked.id, 'ts-sub');
  const remarkBody = JSON.parse(clash.calls.find(function(c){return c.init.method==='PATCH';}).init.body);
  assert.strictEqual(remarkBody.status, undefined, 'save day must not downgrade a submitted week');
  assert.strictEqual(remarkBody.submitted_at, undefined, 'submitted_at stays on the server');
  assert.strictEqual(remarkBody.days['0'].tin, '09:00', 'later flush wins that day');
  assert.strictEqual(remarkBody.days['0'].tout, '', 'later day replaces that index');
  assert.strictEqual(remarkBody.days['1'].tin, '10:00', 'a new day is merged');
  assert.strictEqual(remarkBody.days['2'].tin, '11:00', 'later day replaces that index');
  assert.ok(!clash.calls.some(function(c){return c.init.method==='POST';}), 'save day updates the active week row');

  // GHOST-CAREGIVER-DUAL-WRITE-CONTRACT-v1: soft-delete is PATCH is_active=false, not DELETE.
  const removed = run({
    routes:[{
      test:/\/timesheets\?id=eq\.bak-1$/,
      res:{ok:true, status:200, raw:JSON.stringify([{id:'bak-1', is_active:false, status:'backup'}])}
    }]
  });
  const gone = await vm.runInContext('sbSoftDeleteBackup("bak-1")', removed);
  assert.strictEqual(gone.is_active, false);
  assert.strictEqual(removed.calls.length, 1);
  assert.strictEqual(removed.calls[0].init.method, 'PATCH');
  assert.deepStrictEqual(JSON.parse(removed.calls[0].init.body), {is_active:false});
  assert.strictEqual(removed.calls[0].init.headers.Prefer, 'return=representation');
  assert.strictEqual(removed.calls[0].init.headers.Authorization, 'Bearer jwt-test-token');
  assert.ok(removed.calls[0].url.indexOf('/rest/v1/timesheets?id=eq.bak-1')>=0);

  const ins = run({
    routes:[{
      test:/\/inservice_results\?/,
      res:{ok:true, status:201, raw:JSON.stringify([{id:'ir-1', legacy_id:'1', score_correct:1, score_total:2, score_pct:50, submitted_at:'2026-09-24T00:00:00.000Z'}])}
    }]
  });
  vm.runInContext('INSERVICES=[{id:1,title:"Diabetes",questions:[{q:"Q1",options:["a","b"],answer:1},{q:"Q2",options:["c","d"],answer:0}]}]', ins);
  const graded = await vm.runInContext('sbSubmitInservice({username:"aide.one",emp_name:"Aide One",topic_id:1,topic_title:"Diabetes",answers:[1,1],signature:"sig",completed:"Sep 24, 2026"})', ins);
  assert.strictEqual(graded.id, 'ir-1');
  assert.strictEqual(ins.calls.length, 1);
  const insPost = ins.calls[0];
  assert.strictEqual(insPost.init.method, 'POST');
  assert.ok(insPost.url.indexOf('/rest/v1/inservice_results?')>=0);
  assert.ok(decodeURIComponent(insPost.url).indexOf('id,legacy_id,score_correct,score_total,score_pct,submitted_at')>=0);
  const insBody = JSON.parse(insPost.init.body);
  assert.strictEqual(insBody.org_id, '33333333-3333-3333-3333-333333333333');
  assert.strictEqual(insBody.aide_id, '22222222-2222-2222-2222-222222222222');
  assert.strictEqual(insBody.topic_id, '1');
  assert.strictEqual(insBody.status, 'Active');
  assert.strictEqual(insBody.score_correct, 1);
  assert.strictEqual(insBody.score_total, 2);
  assert.strictEqual(insBody.score_pct, 50);
  assert.deepStrictEqual(insBody.answers, [1, 1]);
  assert.strictEqual(insBody.graded_detail.items[0].isCorrect, true);
  assert.strictEqual(insBody.graded_detail.items[1].isCorrect, false);
  assert.strictEqual(insBody.signature, 'sig');
  assert.ok(insBody.submitted_at);
  assert.ok(insBody.legacy_id);
  assert.strictEqual(insPost.init.headers.Prefer, 'return=representation');
  assert.ok(!ins.calls.some(function(c){return c.init.method==='PATCH'||c.init.method==='PUT'||c.init.method==='DELETE';}));

  const noAide = run({currentUser:{username:'aide.one', name:'Aide One', sbAccessToken:'jwt-test-token', sbUserId:'11111111-1111-1111-1111-111111111111', sbOrgId:'33333333-3333-3333-3333-333333333333'}});
  await assert.rejects(function(){return vm.runInContext('sbSubmitInservice({topic_id:1,answers:[1]})', noAide);}, /Sign in again/);
  assert.strictEqual(noAide.calls.length, 0, 'missing aide id does not write inservice_results');

  const submitIs = extractFn(html, 'async function submitInservice()');
  assert.ok(submitIs.includes("action:'submit_inservice'"), 'flag off inservice still posts Sheets');
  assert.ok(submitIs.includes('SHEETS_URL'));
  assert.ok(submitIs.indexOf('evercareSbEnabled()') < submitIs.indexOf('SHEETS_URL'), 'flag check precedes the sheets inservice post');
  assert.ok(submitIs.includes('sbSubmitInservice('), 'flag on inserts inservice_results');
  const delFn = extractFn(html, 'async function deleteTimesheetBackup(id)');
  assert.ok(delFn.includes("action:'delete_timesheet_backup'"), 'flag off delete still posts Sheets');
  assert.ok(delFn.indexOf('evercareSbEnabled()') < delFn.indexOf('delete_timesheet_backup'));
  assert.ok(delFn.includes('sbSoftDeleteBackup(id)'));
  const saveDay = extractFn(html, 'function saveDayData(i,dayObj)');
  assert.ok(saveDay.includes('sbSyncSavedDay'), 'flag on Save Day syncs the open day');
  const fin = extractFn(html, 'async function doFinalSubmit()');
  assert.ok(fin.includes("action:'submit'"), 'flag off submit stays on /exec');
  assert.ok(fin.indexOf('evercareSbEnabled()') < fin.indexOf("action:'submit'"));
  const sheetsBackup = extractFn(html, 'async function doCloudBackup()');
  assert.ok(sheetsBackup.includes("action:'save_timesheet_backup'"));
  assert.ok(sheetsBackup.indexOf('evercareSbEnabled()') < sheetsBackup.indexOf('apiPost(payload)'));
  const loc = extractFn(html, 'function saveLocationStatus(status)');
  assert.ok(loc.includes("action:'save_location_status'"), 'sheets rollback can still post location');
  assert.ok(loc.indexOf('evercareSbEnabled()') < loc.indexOf('SHEETS_URL'), 'default Save Day and submit do not post location to /exec');

  console.log('caregiver-sb-data checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
