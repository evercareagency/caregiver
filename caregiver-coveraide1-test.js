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

assert.ok(html.includes('v=coveraide1'), 'coveraide1 marker');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-coveraide1 v=coveraide1 —'), 'coveraide1 comment');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-coveraide1">'), 'coveraide1 meta');
assert.ok(html.includes('GHOST-COVERAIDE1-CONTRACT-v1'), 'aide contract note');
assert.ok(html.includes('v=cgsiglock1') && html.includes('v=cgsigs1') && html.includes('v=cgisbadge2'), 'later markers stay');
assert.ok(html.includes('v=cgquizlet1') && html.includes('v=loginkb1') && html.includes('v=cgisbadge1') && html.includes('v=cghome1'), 'friday markers stay');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cghome1">'), 'cghome meta stays');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgsiglock1">'), 'cgsiglock meta stays');
assert.ok(html.includes('v=cgauth1') && html.includes('v=bcast1b') && html.includes('v=offline1'), 'older markers stay');

assert.ok(!html.includes('AIDE_CALL_OFF_RPC_CALLABLE'), 'callable flag stub is gone');
assert.ok(!html.includes('TODO(GHOST-COVERAIDE1-CONTRACT-v1)'), 'param stub todo is gone');
assert.ok(html.includes('rpc/aide_record_call_off'), 'aide record rpc path is named');
assert.ok(html.includes('rpc/aide_list_my_call_offs'), 'aide list rpc path is named');
assert.ok(html.includes('p_include_resolved:false'), 'list asks for open call-offs');
assert.ok(!html.includes('rpc/admin_record_call_off'), 'office record path stays on Admin');
assert.ok(!html.includes('p_regular_aide_id'), 'office record params stay on Admin');
assert.ok(!html.includes('aide_submitted'), 'source is not aide_submitted');
assert.ok(!html.includes("source:'phone'") && !html.includes("source:'ace'"), 'phone and ace are not source values');
assert.ok(html.includes("source:'aide'"), 'aide submit records source aide');
const rpcBody = extractFn(html, 'function aideCallOffRpcBody(record)');
assert.ok(rpcBody.includes('p_client_id') && rpcBody.includes('p_shift_start') && rpcBody.includes('p_shift_end') && rpcBody.includes('p_reason'), 'record body uses the locked params');
const listBody = extractFn(html, 'function aideListCallOffsBody()');
assert.ok(listBody.includes('p_include_resolved'), 'list body uses the locked param');
assert.ok(!listBody.includes('throw'), 'list body does not stub');
const refresh = extractFn(html, 'async function openCallOff()');
assert.ok(refresh.includes('aideListMyCallOffs'), 'open loads the aide list');
const submit = extractFn(html, 'async function submitAideCallOff()');
assert.ok(submit.includes('aidePostCallOff'), 'submit posts the aide record');
assert.ok(!submit.includes('AIDE_CALL_OFF_RPC_CALLABLE'), 'submit is not behind a stub flag');
assert.ok(!submit.includes('set_password') && !submit.includes('password'), 'call off does not touch passwords');

const home = html.slice(html.indexOf('id="cgHomeView"'), html.indexOf('id="cgFormView"'));
assert.ok(home.includes('id="callOffHomeBtn"'), 'home call off action');
assert.ok(home.includes('openCallOff()'), 'home action opens call off');
assert.ok(home.includes('>Call off</button>'), 'home button label');
assert.ok(home.includes('id="cgBackupBtn"'), 'home backup control stays');

const screen = html.slice(html.indexOf('id="callOffScreen"'), html.indexOf('id="moreScreen"'));
assert.ok(screen.includes('id="callOffChoices"'), 'shift picker');
assert.ok(screen.includes('id="callOffReason"'), 'optional reason');
assert.ok(screen.includes('id="callOffSubmitBtn"'), 'submit');
assert.ok(screen.includes('id="callOffConfirm"'), 'confirmation');
assert.ok(screen.includes('>Submitted<'), 'submitted word');
assert.ok(screen.includes('id="callOffConfirmChip">Open'), 'open status');
assert.ok(screen.includes('id="callOffList"'), 'status list');
assert.ok(screen.includes('Your call-offs'), 'list is this aide');
assert.ok(!/PTO|time off|time-off|vacation/i.test(screen), 'call off is not a time-off product');

const more = html.slice(html.indexOf('id="moreScreen"'), html.indexOf('id="bottomNav"'));
assert.ok(more.includes('id="callOffMoreBtn"'), 'more entry');
assert.ok(more.includes("Back up this week's draft"), 'backup stays on more');
assert.ok(more.includes('>Log out</button>'), 'logout stays');

const nav = html.slice(html.indexOf('id="bottomNav"'), html.indexOf('id="deleteDraftModal"'));
assert.ok(nav.includes('data-nav="home"') && nav.includes('data-nav="timesheet"') && nav.includes('data-nav="inservices"') && nav.includes('data-nav="more"'), 'four nav targets stay');
assert.ok(!nav.includes('data-nav="calloff"') && !nav.includes('>Call off<'), 'call off is not a fifth tab');
assert.ok(html.includes("callOffScreen:'home'"), 'call off keeps the home tab');

const ctx = {Math:Math, Date:Date, Number:Number, String:String, Intl:Intl, isFinite:isFinite};
vm.createContext(ctx);
[
  'function callOffYmd(d)',
  'function callOffTomorrowYmd(nowMs)',
  'function callOffCleanReason(reason)',
  'function callOffFormatTime(hm)',
  'function callOffFormatWhen(date, start, end)',
  'function callOffUpcomingFromDays(timesheets, weekDataById, clients, nowMs)',
  'function callOffValidate(shift, date, start, end, reason, nowMs)',
  'function callOffBuildRecord(shift, date, start, end, reason, nowMs, aideUsername)',
  'function callOffAlreadyOpen(rows, clientId, clientName, startsAt)',
  'function callOffStatusChip(status)',
  'function callOffRowsForAide(all, username)',
  'function callOffStoreKey()',
  'function callOffReadList()',
  'function callOffWriteList(list)',
  'function callOffNormalizeRow(row)',
  'function callOffSource(row)',
  'function callOffSourceLabel(source)',
  'function callOffPartsFromIso(iso)',
  'function aideCallOffRpcBody(record)',
  'function aideListCallOffsBody()',
  'function aideUnwrapRpc(data)',
  'function callOffRpcError(node, fallback)',
  'function aideCallOffRowFromList(item, fallback)',
  'function aideCallOffFromRpc(data, record)',
  'function aideCallOffsFromRpc(data)'
].forEach(function(sig){
  vm.runInContext(extractFn(html, sig), ctx);
});

const now = new Date(2026, 8, 25, 12, 0, 0).getTime();
const shifts = vm.runInContext('callOffUpcomingFromDays(' + JSON.stringify([
  {id:'ts1', clientName:'Ada Cole', clientId:'c1'},
  {id:'ts2', clientName:'', clientId:''}
]) + ',' + JSON.stringify({
  ts1:{
    0:{date:'2026-09-26', tin:'08:00', tout:'12:00'},
    1:{date:'2026-09-20', tin:'08:00', tout:'12:00'},
    2:{date:'2026-09-25', tin:'08:00', tout:'10:00'},
    3:{date:'2026-09-25', tin:'15:00', tout:'18:00'}
  }
}) + ',' + JSON.stringify([
  {id:'c2', name:'Bea Lang'},
  {id:'c2', name:'Bea Lang'},
  {id:'', name:''}
]) + ', ' + now + ')', ctx);
assert.strictEqual(shifts.length, 3, 'future shift, later today, and the other client');
assert.strictEqual(shifts[0].kind, 'shift');
assert.strictEqual(shifts[0].clientName, 'Ada Cole');
assert.strictEqual(shifts[0].date, '2026-09-25');
assert.strictEqual(shifts[1].date, '2026-09-26');
assert.strictEqual(shifts[2].kind, 'client');
assert.strictEqual(shifts[2].clientName, 'Bea Lang');

const shift = {key:'day:c1', kind:'shift', clientId:'c1', clientName:'Ada Cole', date:'2026-09-26', start:'08:00', end:'12:00'};
assert.strictEqual(vm.runInContext('callOffValidate(null,"","","","",' + now + ')', ctx), 'Pick an upcoming client or shift.');
assert.strictEqual(vm.runInContext('callOffValidate(' + JSON.stringify(shift) + ',"2026-09-26","08:00","12:00","",' + now + ')', ctx), '');
assert.strictEqual(vm.runInContext('callOffValidate(' + JSON.stringify(shift) + ',"2026-09-24","08:00","12:00","",' + now + ')', ctx), 'That date has already passed.');
assert.strictEqual(vm.runInContext('callOffValidate(' + JSON.stringify(shift) + ',"2026-09-26","12:00","08:00","",' + now + ')', ctx), 'End time must be after the start time.');
assert.strictEqual(vm.runInContext('callOffValidate(' + JSON.stringify(shift) + ',"2026-09-25","08:00","10:00","",' + now + ')', ctx), 'That shift has already ended.');
assert.strictEqual(vm.runInContext('callOffValidate(' + JSON.stringify(shift) + ',"2026-09-25","08:00","18:00","",' + now + ')', ctx), 'That shift has already started. Pick an upcoming one.');

const built = vm.runInContext('callOffBuildRecord(' + JSON.stringify(shift) + ',"2026-09-26","08:00","12:00","  sick  ",' + now + ',"aide.one")', ctx);
assert.strictEqual(built.ok, true);
assert.strictEqual(built.record.status, 'open');
assert.strictEqual(built.record.reason, 'sick');
assert.strictEqual(built.record.aideUsername, 'aide.one');
assert.strictEqual(built.record.source, 'aide');
assert.strictEqual(built.record.clientId, 'c1');
assert.ok(built.record.startsAt && built.record.endsAt, 'start and end are stored');

const blankReason = vm.runInContext('callOffBuildRecord(' + JSON.stringify(shift) + ',"2026-09-26","08:00","12:00","",' + now + ',"aide.one")', ctx);
assert.strictEqual(blankReason.ok, true);
assert.strictEqual(blankReason.record.reason, '');

assert.strictEqual(vm.runInContext('callOffAlreadyOpen([{status:"open", clientId:"c1", clientName:"Ada Cole", startsAt:' + JSON.stringify(built.record.startsAt) + '}],"c1","Ada Cole",' + JSON.stringify(built.record.startsAt) + ')', ctx), true);
assert.strictEqual(vm.runInContext('callOffAlreadyOpen([],"c1","Ada Cole","other")', ctx), false);
assert.strictEqual(vm.runInContext('callOffStatusChip("open")', ctx), 'Open');
assert.strictEqual(vm.runInContext('callOffStatusChip("call_off")', ctx), 'Open');
assert.strictEqual(vm.runInContext('callOffRowsForAide([{aideUsername:"aide.one",id:"a"},{aideUsername:"aide.two",id:"b"}],"aide.one").map(function(r){return r.id;}).join(",")', ctx), 'a');

const mem = {};
ctx.currentUser = {username:'aide.one', name:'Ada'};
ctx.store = {
  get:function(k){return mem[k] == null ? null : mem[k];},
  set:function(k,v){mem[k] = v;}
};
vm.runInContext('callOffWriteList([{aideUsername:"aide.one", id:"keep", status:"open"},{aideUsername:"aide.two", id:"drop", status:"open"}])', ctx);
assert.strictEqual(mem['evercare_coveraide1_aide.one'].length, 1);
assert.strictEqual(mem['evercare_coveraide1_aide.one'][0].id, 'keep');
assert.strictEqual(vm.runInContext('callOffReadList()[0].id', ctx), 'keep');
ctx.currentUser = {username:'aide.two'};
assert.strictEqual(vm.runInContext('callOffReadList().length', ctx), 0, 'another aide does not read this list');

assert.strictEqual(vm.runInContext('callOffNormalizeRow({source:"phone"}).source', ctx), 'aide');
assert.strictEqual(vm.runInContext('callOffNormalizeRow({source:"ace"}).source', ctx), 'aide');
assert.strictEqual(vm.runInContext('callOffNormalizeRow({source:"office"}).source', ctx), 'office');
assert.strictEqual(vm.runInContext('callOffSource({source:"aide"})', ctx), 'aide');
assert.strictEqual(vm.runInContext('callOffSource({source:" office "})', ctx), 'office');
assert.strictEqual(vm.runInContext('callOffSource({source:"Aide"})', ctx), 'office', 'only the exact value aide counts');
assert.strictEqual(vm.runInContext('callOffSource({})', ctx), 'office');
assert.strictEqual(vm.runInContext('callOffSource({source:"phone"})', ctx), 'office');
assert.strictEqual(vm.runInContext('callOffSource({source:"ace"})', ctx), 'office');
assert.strictEqual(vm.runInContext('callOffSourceLabel("aide")', ctx), 'Aide');
assert.strictEqual(vm.runInContext('callOffSourceLabel("office")', ctx), 'Office');
assert.throws(function(){vm.runInContext('aideCallOffRpcBody({})', ctx);}, /assigned to you/);
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('aideCallOffRpcBody({clientId:"c1", startsAt:"2026-09-26T12:00:00.000Z", endsAt:"2026-09-26T16:00:00.000Z", reason:"  sick "})', ctx))), {
  p_client_id:'c1',
  p_shift_start:'2026-09-26T12:00:00.000Z',
  p_shift_end:'2026-09-26T16:00:00.000Z',
  p_reason:'sick'
});
assert.strictEqual(vm.runInContext('aideCallOffRpcBody({clientId:"c1", startsAt:"2026-09-26T12:00:00.000Z", endsAt:"2026-09-26T16:00:00.000Z", reason:""}).p_reason', ctx), null);
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('aideListCallOffsBody()', ctx))), {p_include_resolved:false});
ctx.currentUser = {username:'aide.one', name:'Ada'};
const mapped = vm.runInContext('aideCallOffFromRpc({success:true, open_shift_id:"os1", status:"open", source:"aide", submitted_by_aide_id:"aide-1", shift_start:"2026-09-26T12:00:00.000Z", shift_end:"2026-09-26T16:00:00.000Z", schedule_exception_id:"ex1", urgency_within_48h:true, idempotent:false}, {id:"local", clientId:"c1", clientName:"Ada Cole", reason:"sick", source:"aide", aideUsername:"aide.one"})', ctx);
assert.strictEqual(mapped.ok, true);
assert.strictEqual(mapped.record.id, 'os1');
assert.strictEqual(mapped.record.status, 'open');
assert.strictEqual(mapped.record.source, 'aide');
assert.strictEqual(mapped.record.clientName, 'Ada Cole');
assert.strictEqual(mapped.record.submittedByAideId, 'aide-1');
assert.strictEqual(mapped.record.scheduleExceptionId, 'ex1');
assert.strictEqual(mapped.record.urgencyWithin48h, true);
assert.strictEqual(mapped.record.idempotent, false);
assert.strictEqual(mapped.record.reachedOffice, true);
assert.strictEqual(vm.runInContext('aideCallOffFromRpc({success:true, open_shift_id:"os2", source:"office"}, {id:"local", source:"aide"}).record.source', ctx), 'office');
assert.strictEqual(vm.runInContext('aideCallOffFromRpc({success:true, open_shift_id:"os3"}, {id:"local", source:"aide"}).record.source', ctx), 'aide', 'a record reply without source stays aide');
assert.strictEqual(vm.runInContext('aideCallOffFromRpc({success:true, open_shift_id:"os4", idempotent:true, source:"aide"}, {id:"local", source:"aide"}).record.idempotent', ctx), true);
const failed = vm.runInContext('aideCallOffFromRpc({success:false, error:"nope"}, {id:"local"})', ctx);
assert.strictEqual(failed.ok, false);
assert.strictEqual(failed.error, 'nope');
const listed = vm.runInContext('aideCallOffsFromRpc({success:true, count:1, call_offs:[{open_shift_id:"os1", status:"open", source:"aide", client_id:"c1", client_name:"Ada Cole", reason:"sick", shift_start:"2026-09-26T12:00:00.000Z", shift_end:"2026-09-26T16:00:00.000Z"}]})', ctx);
assert.strictEqual(listed.ok, true);
assert.strictEqual(listed.count, 1);
assert.strictEqual(listed.rows[0].clientName, 'Ada Cole');
assert.strictEqual(listed.rows[0].source, 'aide');
assert.strictEqual(listed.rows[0].aideUsername, 'aide.one');
assert.strictEqual(vm.runInContext('aideCallOffsFromRpc({success:true, count:1, call_offs:[{open_shift_id:"os9", status:"open"}]}).rows[0].source', ctx), 'office', 'a list row without source stays office');
assert.strictEqual(vm.runInContext('aideCallOffsFromRpc({success:false, error:"later"}).ok', ctx), false);

console.log('caregiver-coveraide1-test: ok');
