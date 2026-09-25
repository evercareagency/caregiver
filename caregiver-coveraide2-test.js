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

assert.ok(html.includes('v=coveraide2'), 'coveraide2 marker');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-coveraide2 v=coveraide2 —'), 'coveraide2 comment');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-coveraide2">'), 'coveraide2 meta');
assert.ok(html.includes('GHOST-COVERAIDE2-CONTRACT-v1'), 'ace contract note');
assert.ok(html.includes('patches/coveraide2-v1.sql'), 'ace patch note');
assert.ok(html.includes('v=coveraide1') && html.includes('v=cgacct1') && html.includes('v=cgsave1'), 'prior markers stay');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-coveraide1">'), 'coveraide1 meta stays');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgacct1">'), 'cgacct1 meta stays');
assert.ok(html.includes('rpc/aide_record_call_off'), 'submit rpc name unchanged');
assert.ok(html.includes('rpc/aide_list_my_call_offs'), 'list rpc name unchanged');
assert.ok(!html.includes('rpc/list_my_calloffs'), 'does not switch list rpc');
assert.ok(!html.includes('rpc/admin_list_open_shifts'), 'admin list stays on Admin');
assert.ok(!html.includes('rpc/admin_record_call_off'), 'office record path stays on Admin');

const home = html.slice(html.indexOf('id="cgHomeView"'), html.indexOf('id="cgFormView"'));
assert.ok(home.includes('id="callOffHomeBtn"'), 'home call off stays');
assert.ok(home.includes('openCallOff()'), 'home still opens call off');

const account = html.slice(html.indexOf('id="moreScreen"'), html.indexOf('id="bottomNav"'));
assert.ok(!account.includes('id="callOffMoreBtn"') && !account.includes('>Call off</button>'), 'account does not gain call off');

const submit = extractFn(html, 'async function submitAideCallOff()');
assert.ok(submit.includes('callOffSubmitBlocked'), 'second tap is refused before another post');
assert.ok(submit.includes('callOffBusy=true'), 'in-flight guard is set');
assert.ok(submit.indexOf('callOffBusy=true') < submit.indexOf('aidePostCallOff'), 'guard is set before the post');
assert.ok(submit.includes('callOffSetSubmitBtn'), 'submit button disables');
assert.ok(submit.includes('callOffCaregiverRows'), 'list write keeps aide rows');
assert.ok(!submit.includes('set_password') && !submit.includes('password'), 'call off does not touch passwords');
const post = extractFn(html, 'async function aidePostCallOff(record)');
assert.ok(post.includes('callOffPostFlight'), 'overlapping posts share one request');
assert.strictEqual((post.match(/aide_record_call_off/g) || []).length, 1, 'record rpc is named once');

const ctx = {
  Math:Math, Date:Date, Number:Number, String:String, Intl:Intl, isFinite:isFinite,
  setTimeout:setTimeout, clearTimeout:clearTimeout,
  callOffPickKey:'', callOffShiftCache:[], callOffBusy:false, callOffBound:false,
  callOffIgnoreUntil:0, callOffGhostMs:800, callOffPostFlight:null
};
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
  'function callOffNormalizeRow(row)',
  'function callOffSource(row)',
  'function callOffSourceLabel(source)',
  'function callOffCaregiverRows(rows)',
  'function callOffSameShift(a,b)',
  'function callOffSubmitBlocked()',
  'function callOffSetSubmitBtn(btn, busy)',
  'function callOffStoreKey()',
  'function callOffReadList()',
  'function callOffWriteList(list)',
  'function callOffPartsFromIso(iso)',
  'function aideCallOffRpcBody(record)',
  'function aideListCallOffsBody()',
  'function aideUnwrapRpc(data)',
  'function callOffRpcError(node, fallback)',
  'function aideCallOffRowFromList(item, fallback)',
  'function aideCallOffFromRpc(data, record)',
  'function aideCallOffsFromRpc(data)',
  'async function aidePostCallOff(record)',
  'async function aideListMyCallOffs()',
  'function callOffShowErr(msg)',
  'function callOffWeekMap()',
  'function callOffSelectedShift()',
  'function callOffNeedsWhen(shift)',
  'function callOffPaintWhen(shift)',
  'function callOffEsc(s)',
  'function callOffPaintChoices()',
  'function callOffSelect(key)',
  'function callOffPaintList()',
  'function callOffPaintConfirm(record)',
  'function callOffChosenWhen(shift)',
  'async function submitAideCallOff()'
].forEach(function(sig){
  vm.runInContext(extractFn(html, sig), ctx);
});

assert.strictEqual(vm.runInContext('callOffCaregiverRows([{source:"aide",id:"a"},{source:"office",id:"b"},{id:"c"},{source:"Aide",id:"d"}]).map(function(r){return r.id;}).join(",")', ctx), 'a');
assert.strictEqual(vm.runInContext('callOffSameShift({id:"os1", startsAt:"a"},{id:"os1", startsAt:"b"})', ctx), true);
assert.strictEqual(vm.runInContext('callOffSameShift({id:"os1", clientId:"c1", startsAt:"2026-09-26T12:00:00.000Z"},{id:"os2", clientId:"c1", startsAt:"2026-09-26T12:00:00.000Z"})', ctx), true);
assert.strictEqual(vm.runInContext('callOffSameShift({id:"os1", clientId:"c1", startsAt:"2026-09-26T12:00:00.000Z"},{id:"os2", clientId:"c1", startsAt:"2026-09-26T16:00:00.000Z"})', ctx), false);

const els = {};
function el(id){
  if(!els[id])els[id] = {id:id, hidden:true, textContent:'', value:'', innerHTML:'', className:'', style:{}, disabled:false, min:'', attrs:{}, setAttribute:function(k,v){this.attrs[k]=v;}, scrollIntoView:function(){}};
  return els[id];
}
ctx.document = {getElementById:function(id){return el(id);}};
ctx.currentUser = {username:'aide.one', name:'Ada'};
const mem = {};
ctx.store = {
  get:function(k){return mem[k] == null ? null : mem[k];},
  set:function(k,v){mem[k] = v;}
};
const tomorrow = vm.runInContext('callOffTomorrowYmd(Date.now())', ctx);
ctx.getAllTimesheets = function(){return [{id:'ts1', clientName:'Bowlax', clientId:'c1'}];};
ctx.weekDataForTS = function(){return {0:{date:tomorrow, tin:'08:00', tout:'14:00'}};};

let posts = 0;
let releasePost;
const postGate = new Promise(function(resolve){releasePost = resolve;});
ctx.sbRest = async function(path){
  if(String(path).indexOf('aide_record_call_off') >= 0){
    posts++;
    await postGate;
    return {
      success:true, open_shift_id:'os1', status:'open', source:'aide', idempotent:false,
      shift_start:'2026-09-26T12:00:00.000Z', shift_end:'2026-09-26T18:00:00.000Z',
      reason:'My baby birthday'
    };
  }
  if(String(path).indexOf('aide_list_my_call_offs') >= 0){
    return {
      success:true, count:2, call_offs:[
        {open_shift_id:'os1', status:'open', source:'aide', client_id:'c1', client_name:'Bowlax', reason:'My baby birthday', shift_start:'2026-09-26T12:00:00.000Z', shift_end:'2026-09-26T18:00:00.000Z'},
        {open_shift_id:'os-office', status:'open', source:'office', client_id:'c9', client_name:'Office Client', reason:'admin on behalf', shift_start:'2026-09-27T13:00:00.000Z', shift_end:'2026-09-27T17:00:00.000Z'}
      ]
    };
  }
  throw new Error('unexpected ' + path);
};
ctx.sbToken = function(){return 'tok';};

vm.runInContext('callOffPaintChoices(); callOffSelect(callOffShiftCache[0].key);', ctx);
el('callOffReason').value = 'My baby birthday';
const first = vm.runInContext('submitAideCallOff()', ctx);
const second = vm.runInContext('submitAideCallOff()', ctx);
assert.strictEqual(posts, 1, 'the second tap does not start another record while the first is in flight');
releasePost();
Promise.all([Promise.resolve(first), Promise.resolve(second)]).then(function(){
  assert.strictEqual(posts, 1, 'one submit is one aide_record_call_off');
  const ghost = vm.runInContext('submitAideCallOff()', ctx);
  return Promise.resolve(ghost);
}).then(function(){
  assert.strictEqual(posts, 1, 'a follow-up tap does not send another record');
  const listHtml = el('callOffList').innerHTML;
  assert.ok(listHtml.includes('Bowlax'), 'aide row is listed');
  assert.ok(listHtml.includes('My baby birthday'), 'reason is listed');
  assert.ok(listHtml.includes('calloff-chip-aide'), 'aide chip shows');
  assert.ok(!listHtml.includes('Office Client'), 'office row is hidden');
  assert.ok(!listHtml.includes('calloff-chip-office'), 'office chip is hidden');
  assert.strictEqual((listHtml.match(/calloff-chip-aide/g) || []).length, 1, 'one aide row');
  assert.strictEqual(el('callOffSubmitBtn').disabled, true, 'button stays disabled through the ghost-click window');
  assert.ok(vm.runInContext('callOffSubmitBlocked()', ctx), 'guard stays up after the post');
  console.log('caregiver-coveraide2-test: ok');
}).catch(function(err){
  console.error(err);
  process.exit(1);
});
