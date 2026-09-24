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

assert.ok(html.includes('client-filter (Ace: no query this slice)'), 'list filter is client-side');
const homeFn = extractFn(html, 'function getHomeTimesheets()');
assert.ok(!homeFn.includes('sbRest'), 'home list does not query Ace');
assert.ok(!homeFn.includes('/rpc/'), 'home list adds no RPC');
const listQuery = extractFn(html, 'async function sbListTimesheetsForHome()');
assert.ok(listQuery.includes('status=eq.backup'), 'existing backup read stays');
assert.ok(!listQuery.includes('status=eq.submitted'), 'this slice does not query submitted rows');

const src = [
  extractFn(html, 'function isUnfinishedDraft(t)'),
  extractFn(html, 'function isSentBackWeek(t)'),
  extractFn(html, 'function isFullySubmittedWeek(t)'),
  extractFn(html, 'function aideSubmittedWeekKey(t)'),
  extractFn(html, 'function recentSubmittedWeekStarts(list,limit)'),
  extractFn(html, 'function isHomeListItem(t)'),
  extractFn(html, 'function isAideListCard(t,keepWeeks)'),
  extractFn(html, 'function getDraftTimesheets()'),
  extractFn(html, 'function getHomeTimesheets()'),
  extractFn(html, 'function sweepSubmittedLeftovers()')
].join('\n');

const rows = [
  {id:'d-old', clientName:'Ada', weekStart:'2026-08-02', status:'active'},
  {id:'fix-old', clientName:'Bea', weekStart:'2026-07-05', status:'correction_requested'},
  {id:'sub-aug', clientName:'Cara', weekStart:'2026-08-02', status:'submitted'},
  {id:'sub-sep6', clientName:'Ada', weekStart:'2026-09-06', status:'submitted'},
  {id:'sub-sep13', clientName:'Bea', weekStart:'2026-09-13', status:'locked'},
  {id:'sub-sep20-a', clientName:'Ada', weekStart:'2026-09-20', status:'submitted'},
  {id:'sub-sep20-b', clientName:'Bea', weekStart:'2026-09-20', status:'submitted'},
  {id:'blank', clientName:'No week', weekStart:'', status:'submitted'}
];
const mem = {'ts_list_aide.one': rows};
const box = {
  currentUser:{username:'aide.one'},
  store:{
    get:function(k){return mem[k] || null;},
    set:function(k,v){mem[k] = v;}
  },
  getAllTimesheets:function(){return mem['ts_list_aide.one'];}
};
vm.createContext(box);
vm.runInContext(src, box);
const shown = vm.runInContext('getHomeTimesheets().map(function(t){return t.id;})', box);
assert.deepStrictEqual(shown, ['d-old','fix-old','sub-sep13','sub-sep20-a','sub-sep20-b']);
assert.ok(shown.indexOf('sub-aug') < 0, 'older submitted week is hidden');
assert.ok(shown.indexOf('sub-sep6') < 0, 'third submitted week_start is hidden');
assert.ok(shown.indexOf('blank') < 0, 'submitted row without a week_start is hidden');
assert.strictEqual(mem['ts_list_aide.one'].length, rows.length, 'hidden rows stay stored');

const drafts = vm.runInContext('getDraftTimesheets().map(function(t){return t.id;})', box);
assert.deepStrictEqual(drafts, ['d-old']);

console.log('caregiver-home-list-test: ok');
