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

const src = [
  extractFn(html, 'function nyCivilYmd(date)'),
  extractFn(html, 'function civilWeekSunday(ymd)'),
  extractFn(html, 'function currentWeekSunday()'),
  extractFn(html, 'function sbWeekSunday(value)'),
  extractFn(html, 'function formatWeekOfLabel(val)')
].join('\n');

function at(iso){
  const Real = Date;
  const fixed = new Real(iso).getTime();
  function FakeDate(){
    if(arguments.length === 0)return new Real(fixed);
    return new Real(...arguments);
  }
  FakeDate.now = function(){return fixed;};
  FakeDate.parse = Real.parse;
  FakeDate.UTC = Real.UTC;
  FakeDate.prototype = Real.prototype;
  const box = {Date: FakeDate, Intl: Intl, Number: Number, String: String, isNaN: isNaN};
  vm.createContext(box);
  vm.runInContext(src, box);
  return box;
}

// 2026-10-07 23:30 America/New_York (EDT, UTC-4) is 2026-10-08 03:30Z.
const late = at('2026-10-08T03:30:00.000Z');
assert.strictEqual(late.nyCivilYmd(new late.Date()), '2026-10-07');
assert.strictEqual(late.currentWeekSunday(), '2026-10-04', 'after 8pm ET the week still starts Sunday 10/04/26');

// Spring-forward weekend: 2026-03-07 23:30 EST (UTC-5) is 2026-03-08 04:30Z.
const dst = at('2026-03-08T04:30:00.000Z');
assert.strictEqual(dst.nyCivilYmd(new dst.Date()), '2026-03-07');
assert.strictEqual(dst.currentWeekSunday(), '2026-03-01', 'the Saturday before spring-forward stays in the prior week');

const day = at('2026-10-07T16:00:00.000Z');
assert.strictEqual(day.sbWeekSunday('2026-10-05'), '2026-10-04', 'a Monday key collapses to that week Sunday');
assert.strictEqual(day.sbWeekSunday('2026-10-07'), '2026-10-04');
assert.strictEqual(day.civilWeekSunday('2026-10-04'), '2026-10-04');
assert.ok(day.formatWeekOfLabel(day.civilWeekSunday('2026-10-05')).indexOf('10/04/2026') >= 0, 'home card label uses the Sunday');

const home = extractFn(html, 'function renderTSHome()');
const recalc = extractFn(html, 'function recalcWeekStart()');
const preview = extractFn(html, 'function previewDay(i)');
const queue = extractFn(html, 'function cgQueueWeekOp(kind,payload)');
const save = extractFn(html, 'function cgEnqueueSaveDay(i,dayObj)');
const backup = extractFn(html, 'async function doCloudBackup()');
const restore = extractFn(html, 'async function restoreCloudBackups()');
const sync = extractFn(html, 'function sbSyncSavedDay(i,dayObj)');
assert.ok(home.includes('civilWeekSunday'), 'home card week label uses the New York Sunday');
assert.ok(recalc.includes('civilWeekSunday'), 'Save Day week key uses the New York Sunday');
assert.ok(preview.includes('civilWeekSunday'), 'saving a day stores the Sunday on the draft');
assert.ok(queue.includes('sbWeekSunday'), 'offline queue week key is the Sunday');
assert.ok(save.includes('week_start'), 'Save Day queue carries the week key');
assert.ok(backup.includes('civilWeekSunday'), 'backup list week is the Sunday');
assert.ok(restore.includes('civilWeekSunday'), 'restored backups keep the Sunday');
assert.ok(sync.includes('weekStart'), 'Save Day upload sends the week key');
assert.ok(!extractFn(html, 'function currentWeekSunday()').includes('toISOString'), 'week start does not use a UTC date');

console.log('caregiver-ny-week checks ok');
