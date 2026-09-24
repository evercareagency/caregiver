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

assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-is-hydrate v=ishydr1 —'), 'inservice hydrate marker');
assert.ok(html.includes('v=ishydr1'), 'inservice hydrate probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-is-hydrate">'), 'inservice hydrate meta');
assert.ok(html.includes('v=cgpdfv1'), 'view pdf marker stays');
assert.ok(html.includes('v=nocert1'), 'nocert marker stays');
assert.ok(html.includes('v=bakuuid1') && html.includes('v=home1') && html.includes('v=sbseal1') && html.includes('v=offline1') && html.includes('v=cgpdf1'), 'prior markers stay');

const listFn = extractFn(html, 'async function renderISList()');
const hydrateAt = listFn.indexOf('sbHydrateInserviceCompletions');
const readAt = listFn.indexOf('getISData()');
assert.ok(hydrateAt > 0 && readAt > hydrateAt, 'list hydrates office completions before it paints');
assert.ok(listFn.includes('>Completed</span>'), 'completed badge stays');
assert.ok(listFn.includes('Completed: '), 'completion date stays');
assert.ok(listFn.includes('>Locked</span>'), 'unassigned cards stay locked');
assert.ok(!/Print Certificate|View Cert|printCompletedISCert|printCurrentISCert/i.test(listFn), 'aides still have no certificate action');
assert.ok(!listFn.includes('/rpc/'), 'list does not invent an inservice RPC');

const hydrateFn = extractFn(html, 'async function sbHydrateInserviceCompletions()');
assert.ok(hydrateFn.includes('inservice_results?'), 'hydrate reads inservice_results');
assert.ok(hydrateFn.includes('username=eq.'), 'hydrate matches the aide username');
assert.ok(hydrateFn.includes('topic_id'), 'hydrate reads topic_id');
assert.ok(hydrateFn.includes('submitted_at'), 'hydrate reads the office timestamp');
assert.ok(!hydrateFn.includes('/rpc/'), 'hydrate uses existing REST');
assert.ok(!hydrateFn.includes('my_inservice_topics'), 'hydrate does not add my_inservice_topics');
assert.ok(hydrateFn.includes("==='archived'"), 'archived office rows are not completions');
assert.ok(!hydrateFn.includes('delete isData') && !hydrateFn.includes('answers_'), 'hydrate does not clear quiz progress');

const notif = extractFn(html, 'async function checkISNotif()');
assert.ok(notif.indexOf('sbHydrateInserviceCompletions') < notif.indexOf('getISData()'), 'home reminder sees office completions');

function run(opts){
  const store = {data: JSON.parse(JSON.stringify(opts.stored || {}))};
  const calls = [];
  const box = {
    currentUser: opts.user === null ? null : (opts.user || {username: 'qa_probe', name: 'Probe Aide', sbAccessToken: 'jwt', sbAideId: '22222222-2222-2222-2222-222222222222'}),
    sbDataEnabled: function(){return opts.sb !== false && !!(box.currentUser && box.currentUser.sbAccessToken);},
    getISData: function(){return store.data;},
    saveISData: function(data){store.data = data; box.saved = true;},
    sbRest: async function(q){
      calls.push(q);
      if(opts.fail)throw new Error('select failed');
      return opts.rows || [];
    }
  };
  vm.createContext(box);
  vm.runInContext(hydrateFn, box);
  box.calls = calls;
  box.store = store;
  return box;
}

(async function(){
  const office = run({
    stored: {answers_4: '[0,1]', completed_3: 'August 1, 2026', completedAt_3: '2026-08-01T12:00:00.000Z'},
    rows: [
      {topic_id: 2, username: 'qa_probe', status: 'Active', completed: 'September 2, 2026', submitted_at: '2026-09-02T15:00:00.000Z'},
      {topic_id: '2', username: 'qa_probe', status: 'Active', completed: 'January 1, 2026', submitted_at: '2026-01-01T15:00:00.000Z'},
      {topic_id: 5, username: 'qa_probe', status: 'Archived', completed: 'July 1, 2026', submitted_at: '2026-07-01T15:00:00.000Z'},
      {topic_id: 9, username: 'other_aide', status: 'Active', completed: 'June 1, 2026', submitted_at: '2026-06-01T15:00:00.000Z'}
    ]
  });
  await vm.runInContext('sbHydrateInserviceCompletions()', office);
  assert.ok(office.calls[0].indexOf('inservice_results?') === 0, office.calls[0]);
  assert.ok(office.calls[0].indexOf('username=eq.qa_probe') >= 0, office.calls[0]);
  assert.ok(office.calls[0].indexOf('topic_id') >= 0);
  assert.strictEqual(office.calls.length, 1, 'one aide select');
  assert.strictEqual(office.store.data.answers_4, '[0,1]', 'in-progress answers stay');
  assert.strictEqual(office.store.data.completed_3, 'August 1, 2026', 'local completion stays when the office has no newer row');
  assert.strictEqual(office.store.data.completed_2, 'September 2, 2026', 'office topic 2 is completed');
  assert.strictEqual(office.store.data.completedAt_2, '2026-09-02T15:00:00.000Z', 'office timestamp is the completion date');
  assert.ok(!office.store.data.completed_5, 'archived topic is not completed');
  assert.ok(!office.store.data.completed_9, 'another aide is not copied');

  const failed = run({stored: {answers_4: '[1]', completed_3: 'August 1, 2026'}, fail: true});
  await vm.runInContext('sbHydrateInserviceCompletions()', failed);
  assert.strictEqual(failed.store.data.completed_3, 'August 1, 2026', 'a failed select keeps the phone cache');
  assert.strictEqual(failed.store.data.answers_4, '[1]', 'a failed select keeps in-progress answers');
  assert.ok(!failed.saved, 'a failed select does not rewrite the phone store');

  const sheets = run({sb: false, stored: {answers_4: '[1]'}});
  await vm.runInContext('sbHydrateInserviceCompletions()', sheets);
  assert.strictEqual(sheets.calls.length, 0, 'sheets rollback does not select inservice_results');
  assert.strictEqual(sheets.store.data.answers_4, '[1]');

  const el = {innerHTML: ''};
  const paint = {
    document: {getElementById: function(){return el;}},
    INSERVICES: [
      {id: 2, shortTitle: 'Dementia Care', title: 'Dementia: Safety and Support Through Care'},
      {id: 4, shortTitle: 'Falls', title: 'Fall Prevention'}
    ],
    sbMyInserviceTopics: async function(){return new Set();},
    sbHydrateInserviceCompletions: async function(){
      paint.hydrated = true;
      paint.isData = {completed_2: 'September 2, 2026', completedAt_2: '2026-09-02T15:00:00.000Z', answers_4: '[0]'};
    },
    getISData: function(){
      assert.strictEqual(paint.hydrated, true, 'paint reads the store after hydrate');
      return paint.isData;
    }
  };
  vm.createContext(paint);
  vm.runInContext(extractFn(html, 'function escapeHtml(str)') + '\n' + extractFn(html, 'function formatCertDate(val)') + '\n' + listFn, paint);
  await vm.runInContext('renderISList()', paint);
  assert.ok(el.innerHTML.includes('>Completed</span>'), 'office topic shows Completed');
  assert.ok(el.innerHTML.includes('Completed: September 2, 2026'), 'office date is on the card');
  assert.ok(el.innerHTML.includes('>Locked</span>'), 'a topic with only local answers stays locked');
  assert.ok(!/Print Certificate|View Cert|printCompletedISCert/i.test(el.innerHTML), 'hydrated card has no certificate');
  console.log('caregiver-is-hydrate checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
