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

assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-save-home v=home1 —'), 'save-home marker');
assert.ok(html.includes('v=home1'), 'save-home probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-save-home">'), 'save-home meta');
assert.ok(html.includes('v=nocert1'), 'cert strip stays');
assert.ok(html.includes('v=sbseal1'), 'auth seal stays');
assert.ok(html.includes('v=offline1'), 'offline save stays');

const listFn = extractFn(html, 'async function renderISList()');
assert.ok(listFn.includes('>Completed</span>'), 'completed badge stays');
assert.ok(!/Print Certificate|View Cert|printCompletedISCert/i.test(listFn), 'done cards still have no certificate action');

const save = extractFn(html, 'function saveDayData(i,dayObj)');
const enqueueAt = save.indexOf('cgEnqueueSaveDay');
const syncAt = save.indexOf('if(sbDataEnabled())sbSyncSavedDay');
assert.ok(enqueueAt > 0 && syncAt > enqueueAt, 'offline queue stays before the live sync');
assert.ok(!save.includes('backToTSHome'), 'Save Day stays on the timesheet');
assert.ok(!save.includes('showCaregiverHome'), 'Save Day does not open Home');

const fin = extractFn(html, 'async function doFinalSubmit()');
const rejectAt = fin.indexOf('if(!data||data.success!==true)');
const homeAt = fin.indexOf('showCaregiverHome()');
assert.ok(rejectAt > 0 && homeAt > rejectAt, 'week submit shows Home only after success');
assert.ok(!fin.slice(0, rejectAt).includes('showCaregiverHome'), 'a failed submit does not leave for Home');
assert.ok(fin.indexOf('cgEnqueueSubmit') < homeAt, 'queued submit still enqueues before Home');
assert.ok(fin.indexOf('sbUpsertTimesheet') < homeAt, 'live submit still upserts before Home');
assert.ok(!fin.includes("cgSuccessView').style.display='block'"), 'week submit does not stay on the submitted screen');
assert.ok(fin.includes('Timesheet submitted.'), 'online submit still confirms');
assert.ok(fin.includes('will upload when you\\\'re back online'), 'queued submit still uses the offline sentence');

function el(id, extra){
  return Object.assign({
    id:id,
    textContent:'',
    innerHTML:'',
    value:'',
    style:{display:''},
    classList:{add:function(){}, remove:function(){}, contains:function(){return false;}}
  }, extra||{});
}

function runSave(opts){
  const box = {
    DAYS:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    activeDayIdx:1,
    window:{scrollTo:function(){}},
    scrollTo:function(){},
    document:{getElementById:function(id){return el(id);}},
    getCheckedSvcs:function(){return opts.svcs == null ? ['Bathing'] : opts.svcs;},
    storedHasRealInk:function(){return opts.ink !== false;},
    getUserWeekData:function(){return {};},
    saveUserWeekData:function(){box._stored = true;},
    refreshSaveDayState:function(){},
    showTempMsg:function(){},
    evercareSbEnabled:function(){return opts.sheets !== true;},
    cgShouldSyncNow:function(){return !!opts.live;},
    sbDataEnabled:function(){return true;},
    cgEnqueueSaveDay:function(){box._queued = true;},
    cgNetOnline:function(){return !!opts.live;},
    cgPaintOfflineQueue:function(){box._painted = true;},
    sbSyncSavedDay:function(){box._synced = true;},
    backToTSHome:function(){box._home = (box._home||0)+1; box._homeAfterSync = !!box._synced; box._homeAfterQueue = !!box._queued;}
  };
  vm.createContext(box);
  vm.runInContext(save, box);
  vm.runInContext('saveDayData(1,{date:"2026-09-21",tin:"08:00",tout:"12:00",hrs:"4:00",svcs:["Bathing"],aideSig:"a",clientSig:"c",aideSigInk:true,clientSigInk:true,verified:null})', box);
  return box;
}

const blocked = runSave({svcs:[], live:true});
assert.strictEqual(blocked._home, undefined, 'empty services do not go Home');
assert.strictEqual(blocked._stored, undefined, 'empty services do not save');

const unsigned = runSave({ink:false, live:true});
assert.strictEqual(unsigned._home, undefined, 'missing signatures do not go Home');
assert.strictEqual(unsigned._stored, undefined, 'missing signatures do not save');

const live = runSave({live:true});
assert.strictEqual(live._synced, true, 'online Save Day still syncs');
assert.strictEqual(live._queued, undefined, 'online Save Day does not queue');
assert.strictEqual(live._stored, true, 'online Save Day still stores the day');
assert.strictEqual(live._home, undefined, 'online Save Day stays on the timesheet');

const offline = runSave({live:false});
assert.strictEqual(offline._synced, undefined, 'offline Save Day does not live-sync');
assert.strictEqual(offline._queued, true, 'offline Save Day still queues');
assert.strictEqual(offline._painted, true, 'offline Save Day still paints the queue');
assert.strictEqual(offline._home, undefined, 'offline Save Day stays on the timesheet');

const sheets = runSave({sheets:true, live:false});
assert.strictEqual(sheets._queued, undefined, 'sheets rollback still does not queue');
assert.strictEqual(sheets._stored, true, 'sheets Save Day still stores locally');
assert.strictEqual(sheets._home, undefined, 'sheets Save Day stays on the timesheet');

const views = {cgHomeView:el('cgHomeView',{style:{display:'none'}}), cgFormView:el('cgFormView',{style:{display:'block'}}), cgSuccessView:el('cgSuccessView',{style:{display:'block'}})};
const homeBox = {
  document:{getElementById:function(id){return views[id] || null;}},
  showScreen:function(id){homeBox.screen = id;},
  renderTSHome:function(){homeBox.rendered = true;},
  window:{scrollTo:function(){homeBox.scrolled = true;}}
};
vm.createContext(homeBox);
vm.runInContext(extractFn(html, 'function showCaregiverHome()'), homeBox);
vm.runInContext('showCaregiverHome()', homeBox);
assert.strictEqual(homeBox.screen, 'caregiverScreen');
assert.strictEqual(views.cgHomeView.style.display, 'block', 'Home view is shown');
assert.strictEqual(views.cgFormView.style.display, 'none', 'timesheet form is hidden');
assert.strictEqual(views.cgSuccessView.style.display, 'none', 'submit success screen is hidden');
assert.strictEqual(homeBox.rendered, true, 'Home list refreshes');

console.log('caregiver-save-home-test: ok');
