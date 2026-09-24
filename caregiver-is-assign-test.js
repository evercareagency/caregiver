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

assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-is-assign-unlock v=isassign1 —'), 'assign unlock marker');
assert.ok(html.includes('v=isassign1'), 'assign unlock probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-is-assign-unlock">'), 'assign unlock meta');
assert.ok(html.includes('v=portal1') && html.includes('v=ishydr1') && html.includes('v=cgpdfv1') && html.includes('v=bakuuid1'), 'portal, hydrate, pdf, backup markers stay');
assert.ok(html.includes('v=cgpdf1') && html.includes('v=home1') && html.includes('v=nocert1') && html.includes('v=sbseal1') && html.includes('v=offline1'), 'prior markers stay');

const listFn = extractFn(html, 'async function renderISList()');
const notif = extractFn(html, 'async function checkISNotif()');
const topicsFn = extractFn(html, 'async function sbMyInserviceTopics()');
const setFn = extractFn(html, 'function sbInserviceTopicSet(raw)');
const hydrateFn = extractFn(html, 'async function sbHydrateInserviceCompletions()');
const schedule = extractFn(html, 'function scheduleHomeBackgroundLoads()');
const unlockSrc = listFn + '\n' + notif + '\n' + topicsFn + '\n' + setFn;

assert.ok(listFn.includes('sbMyInserviceTopics()'), 'list reads the assignment set');
assert.ok(listFn.includes('assigned.has(String(is.id))'), 'list matches topic id as a string');
assert.ok(listFn.includes('locked=!isAssigned&&!completed'), 'unassigned incomplete cards stay locked');
assert.ok(listFn.includes('>Start</button>'), 'assigned cards still start');
assert.ok(listFn.includes('DUE THIS MONTH'), 'assigned incomplete cards still flag the month');
assert.ok(!/Print Certificate|View Cert|printCompletedISCert|printCurrentISCert/i.test(listFn), 'aides still have no certificate action');
assert.ok(!listFn.includes('getAssignedIS') && !listFn.includes('get_assigned_topic'), 'list does not read Sheets assignment');
assert.ok(!notif.includes('getAssignedIS') && !notif.includes('get_assigned_topic') && !notif.includes('get_is_reminder'), 'banner does not read Sheets assignment or reminder');
assert.ok(!unlockSrc.includes("action:'get_assigned_topic'") && !unlockSrc.includes("action:'get_is_reminder'"), 'unlock path has no Sheets assignment actions');
assert.ok(topicsFn.includes("sbRest('rpc/my_inservice_topics',{method:'POST',body:{}})"), 'assignment is the aide JWT rpc');
assert.ok(!topicsFn.includes('inservice_topic_assignment'), 'caregiver does not invent a table filter');
assert.ok(!hydrateFn.includes('my_inservice_topics'), 'completed hydrate stays on inservice_results');
assert.ok(notif.indexOf('sbHydrateInserviceCompletions') < notif.indexOf('getISData()'), 'banner sees office completions first');
assert.ok(notif.includes('sbMyInserviceTopics()'), 'banner uses the assignment set');
assert.ok(!/supabase/i.test(schedule), 'home scheduler must not name supabase');
const sbBranch = schedule.slice(schedule.indexOf('if(evercareSbEnabled())'), schedule.indexOf('if(aceExecSoft())return'));
assert.ok(sbBranch.includes('checkISNotif()'), 'home due banner runs on the default cut');
assert.ok(!html.includes('function getAssignedIS('), 'Sheets getAssignedIS is gone');

const TOPICS = [
  {id:2, shortTitle:'Dementia Care', title:'Dementia: Safety and Support Through Care'},
  {id:4, shortTitle:'Falls', title:'Fall Prevention'},
  {id:5, shortTitle:'Nutrition', title:'Nutrition Basics'}
];

function boot(opts){
  opts = opts || {};
  const calls = [];
  const el = {innerHTML:''};
  const banner = {innerHTML:'', style:{display:'none', background:''}};
  const box = {
    INSERVICES: TOPICS,
    currentUser: opts.user === null ? null : (opts.user || {username:'mossier', name:'Mo Aide', sbAccessToken:'jwt'}),
    sbDataEnabled: function(){return opts.sb !== false && !!(box.currentUser && box.currentUser.sbAccessToken);},
    getISData: function(){return box.isData;},
    saveISData: function(data){box.isData = data;},
    sbHydrateInserviceCompletions: async function(){box.hydrated = true; return box.isData;},
    sbRest: async function(q, req){
      calls.push({q:q, req:req || null});
      if(opts.fail)throw new Error('rpc failed');
      return opts.rows;
    },
    document: {getElementById: function(id){
      if(id === 'isTopicList')return el;
      if(id === 'isNotifBanner')return banner;
      return null;
    }},
    apiPost: async function(){throw new Error('sheets assignment must not run');}
  };
  box.isData = JSON.parse(JSON.stringify(opts.stored || {}));
  vm.createContext(box);
  vm.runInContext(setFn + '\n' + topicsFn + '\n' + extractFn(html, 'function escapeHtml(str)') + '\n' + extractFn(html, 'function formatCertDate(val)') + '\n' + listFn + '\n' + notif, box);
  box.calls = calls;
  box.el = el;
  box.banner = banner;
  return box;
}

function cardsOf(htmlText){
  return htmlText.split('<div class="card"').slice(1);
}

(async function(){
  const shapes = [
    ['2', '5'],
    [{topic_id:'2'}, {topic_id:5}],
    {topic_ids:['2', '5']}
  ];
  for(let i = 0; i < shapes.length; i++){
    const box = boot({rows: shapes[i]});
    await vm.runInContext('renderISList()', box);
    const cards = cardsOf(box.el.innerHTML);
    assert.strictEqual(cards.length, 3, 'one card per topic');
    assert.ok(cards[0].includes('>Start</button>'), 'ALL topic 2 unlocks for mossier');
    assert.ok(cards[0].includes('DUE THIS MONTH'), 'topic 2 is due this month');
    assert.ok(cards[1].includes('>Locked</span>'), 'unassigned topic 4 stays locked');
    assert.ok(cards[2].includes('>Start</button>'), 'SELECTED topic 5 unlocks for mossier');
    assert.ok(cards[2].includes('DUE THIS MONTH'), 'topic 5 is due this month');
    assert.ok(!/Print Certificate|View Cert/i.test(box.el.innerHTML), 'unlocked cards have no certificate');
    assert.strictEqual(box.calls.length, 1, 'one assignment rpc');
    assert.strictEqual(box.calls[0].q, 'rpc/my_inservice_topics');
    assert.strictEqual(box.calls[0].req.method, 'POST');
    assert.strictEqual(JSON.stringify(box.calls[0].req.body), '{}');
  }

  const done = boot({
    rows: ['2', '5'],
    stored: {completed_2:'September 2, 2026', completedAt_2:'2026-09-02T15:00:00.000Z'}
  });
  await vm.runInContext('renderISList()', done);
  const doneCards = cardsOf(done.el.innerHTML);
  assert.ok(doneCards[0].includes('>Completed</span>'), 'completed assigned topic stays completed');
  assert.ok(doneCards[0].includes('Completed: September 2, 2026'), 'completion date stays');
  assert.ok(!doneCards[0].includes('>Start</button>'), 'completed topic is not startable');
  assert.ok(!doneCards[0].includes('DUE THIS MONTH'), 'completed topic is not due');
  assert.ok(doneCards[2].includes('>Start</button>'), 'the other assigned topic stays startable');

  const open = boot({rows: ['2', '5']});
  await vm.runInContext('checkISNotif()', open);
  assert.strictEqual(open.hydrated, true, 'banner hydrates completions first');
  assert.strictEqual(open.banner.style.display, 'block', 'mossier sees the due banner');
  assert.ok(open.banner.innerHTML.includes('inservice due this month'), 'banner copy stays');
  assert.ok(!open.calls.some(function(c){return String(c.q).indexOf('get_assigned_topic') >= 0;}), 'banner rpc is not sheets');

  const partial = boot({
    rows: ['2', '5'],
    stored: {completed_2:'September 2, 2026'}
  });
  await vm.runInContext('checkISNotif()', partial);
  assert.strictEqual(partial.banner.style.display, 'block', 'one open assigned topic keeps the banner');

  const clear = boot({
    rows: ['2', '5'],
    stored: {completed_2:'September 2, 2026', completed_5:'September 3, 2026'}
  });
  await vm.runInContext('checkISNotif()', clear);
  assert.strictEqual(clear.banner.style.display, 'none', 'banner hides when every assigned topic is completed');

  const none = boot({rows: []});
  await vm.runInContext('checkISNotif()', none);
  assert.strictEqual(none.banner.style.display, 'none', 'no assignment hides the banner');
  await vm.runInContext('renderISList()', none);
  assert.ok(cardsOf(none.el.innerHTML).every(function(card){return card.includes('>Locked</span>');}), 'empty rpc leaves every topic locked');

  const failed = boot({rows: ['2', '5'], fail: true});
  await vm.runInContext('renderISList()', failed);
  assert.ok(cardsOf(failed.el.innerHTML).every(function(card){return card.includes('>Locked</span>');}), 'a failed rpc does not unlock');
  assert.ok(!failed.calls.some(function(c){return String(c.q).indexOf('exec') >= 0;}), 'failure does not fall through to sheets');

  const sheets = boot({sb: false, rows: ['2', '5']});
  await vm.runInContext('sbMyInserviceTopics()', sheets);
  assert.strictEqual(sheets.calls.length, 0, 'sheets rollback does not call the rpc');
  await vm.runInContext('checkISNotif()', sheets);
  assert.strictEqual(sheets.banner.style.display, 'none', 'sheets rollback does not invent a due banner');

  console.log('caregiver-is-assign-test: ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
