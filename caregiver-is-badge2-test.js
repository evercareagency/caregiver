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

assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cgisbadge2 v=cgisbadge2 —'), 'cgisbadge2 marker');
assert.ok(html.includes('v=cgisbadge2'), 'cgisbadge2 probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgisbadge2">'), 'cgisbadge2 meta');
assert.ok(html.includes('v=cgisbadge1') && html.includes('v=isassign1') && html.includes('v=ishydr1'), 'prior inservice markers stay');
assert.ok(html.includes('v=cgquizlet1') && html.includes('v=nocert1') && html.includes('v=offline1'), 'quiz, nocert, offline stay');

const topicsFn = extractFn(html, 'async function sbMyInserviceTopics()');
const setFn = extractFn(html, 'function sbInserviceTopicSet(raw)');
const hydrateFn = extractFn(html, 'async function sbHydrateInserviceCompletions()');
const countFn = extractFn(html, 'function dueInserviceCount(assigned,isData)');
const paintFn = extractFn(html, 'function paintISDueChrome(dueCount)');
const notif = extractFn(html, 'async function checkISNotif()');
const listFn = extractFn(html, 'async function renderISList()');
const homeFn = extractFn(html, 'function showCaregiverHome()');
const showFn = extractFn(html, 'function cgRefreshInserviceDueOnShow()');
const submitFn = extractFn(html, 'async function submitInservice()');

assert.ok(topicsFn.includes("sbRest('rpc/my_inservice_topics',{method:'POST',body:{}})"), 'assignment stays the aide JWT rpc');
assert.ok(topicsFn.includes('sbEnsureCaregiverJwt'), 'topics ensure a session JWT before the read');
assert.ok(topicsFn.includes('sbRefreshCaregiverJwt'), '401 refreshes the session JWT once');
assert.ok(!topicsFn.includes('sbAnonHeaders'), 'topics do not send the anon key as the user');
assert.ok(!topicsFn.includes('set_password') && !topicsFn.includes('/auth/v1/user'), 'topics do not touch password auth');
assert.ok(hydrateFn.includes('sbEnsureCaregiverJwt') && hydrateFn.includes('sbRefreshCaregiverJwt'), 'hydrate uses the same JWT ensure and one refresh');
assert.ok(!hydrateFn.includes('my_inservice_topics') && !hydrateFn.includes('/rpc/'), 'hydrate stays on inservice_results');
assert.ok(countFn.includes("!data['completed_'+id]"), 'completed topics are not due');
assert.ok(countFn.includes('catalog.has(key)'), 'badge counts catalog ids only unless a title is shown');
assert.ok(listFn.includes('data-orphan-topic'), 'non-catalog titled rows paint a card');
assert.ok(listFn.includes('paintISDueChrome(dueInserviceCount(assigned,isData))'), 'inservices paint refreshes the badge from the same fetch');
assert.ok(listFn.includes('>Start</button>'), 'catalog assignments still start');
assert.ok(homeFn.includes('checkISNotif()'), 'home open refreshes the due chrome');
assert.ok(showFn.includes('checkISNotif()'), 'visible page refreshes the due chrome');
assert.ok(html.includes("window.addEventListener('pageshow'") && html.includes('cgRefreshInserviceDueOnShow()'), 'pageshow refreshes while logged in');
assert.ok(html.includes("document.visibilityState!=='visible'") && html.includes('cgRefreshInserviceDueOnShow()'), 'visibility refreshes only when shown');
assert.ok(submitFn.includes('checkISNotif()'), 'submit success still refreshes the due chrome');
assert.ok(notif.includes('sbMyInserviceTopics()') && notif.includes('sbHydrateInserviceCompletions'), 'banner re-fetches assignments and completions');
assert.ok(!notif.includes('completed_'), 'the due rule stays in dueInserviceCount');
assert.ok(!html.includes('function clearInserviceAssignment('), 'no invented clear-assignment client signal');

const CATALOG = [
  {id:1, shortTitle:'Diabetes Complications', title:'Complications of Diabetes'},
  {id:3, shortTitle:'Depression', title:'Depression: An Increasing Challenge'},
  {id:4, shortTitle:'Emergency Preparedness', title:'Emergency Preparedness: Overview'},
  {id:5, shortTitle:'Food Allergies', title:'Food Allergies: Protecting Your Clients'},
  {id:8, shortTitle:'Tuberculosis', title:'Infection Control: Tuberculosis'}
];

function boot(opts){
  opts = opts || {};
  const calls = [];
  const order = [];
  const el = {innerHTML:''};
  const banner = {innerHTML:'', style:{display:'none', background:''}};
  const badge = {hidden:true, textContent:''};
  const box = {
    INSERVICES: CATALOG,
    evercareSbEnabled: function(){return opts.sb !== false;},
    currentUser: opts.user === null ? null : (opts.user || {username:'mossier', name:'Mo Aide', sbAccessToken:'jwt-stale'}),
    sbDataEnabled: function(){return opts.sb !== false && !!(box.currentUser && box.currentUser.sbAccessToken);},
    sbEnsureCaregiverJwt: async function(){
      order.push('ensure');
      if(opts.ensureRefreshes){
        box.currentUser.sbAccessToken = 'jwt-fresh';
        return true;
      }
      return !!box.currentUser.sbAccessToken;
    },
    sbRefreshCaregiverJwt: async function(){
      order.push('refresh');
      box.refreshes = (box.refreshes || 0) + 1;
      if(opts.refreshFails)return false;
      box.currentUser.sbAccessToken = 'jwt-refreshed';
      return true;
    },
    getISData: function(){return box.isData;},
    saveISData: function(data){box.isData = data;},
    sbHydrateInserviceCompletions: async function(){box.hydrated = true; return box.isData;},
    sbRest: async function(q, req){
      calls.push({q:q, req:req || null, token:box.currentUser && box.currentUser.sbAccessToken});
      order.push('rest');
      if(opts.failStatus && calls.length <= (opts.failTimes || 1)){
        const err = new Error('HTTP ' + opts.failStatus);
        err.pack = {status:opts.failStatus};
        throw err;
      }
      if(opts.fail)throw new Error('rpc failed');
      return opts.rows;
    },
    document: {getElementById: function(id){
      if(id === 'isTopicList')return el;
      if(id === 'isNotifBanner')return banner;
      if(id === 'isNavBadge')return badge;
      return null;
    }}
  };
  box.isData = JSON.parse(JSON.stringify(opts.stored || {}));
  vm.createContext(box);
  vm.runInContext(setFn + '\n' + topicsFn + '\n' + countFn + '\n' + paintFn + '\n' + notif + '\n' + extractFn(html, 'function escapeHtml(str)') + '\n' + extractFn(html, 'function formatCertDate(val)') + '\n' + listFn + '\n' + showFn, box);
  box.calls = calls;
  box.order = order;
  box.el = el;
  box.banner = banner;
  box.badge = badge;
  return box;
}

function cardsOf(htmlText){
  return htmlText.split('<div class="card"').slice(1);
}

(async function(){
  const mo = boot({
    stored:{completed_4:'September 4, 2026', completedAt_4:'2026-09-04T15:00:00.000Z'},
    rows:[
      {topic_id:3, topic_title:'Depression: An Increasing Challenge'},
      {topic_id:5, topic_title:'Food Allergies: Protecting Your Clients'},
      {topic_id:8, topic_title:'Infection Control: Tuberculosis'}
    ]
  });
  await vm.runInContext('renderISList()', mo);
  assert.deepStrictEqual(mo.order.slice(0, 2), ['ensure', 'rest'], 'list ensures the JWT then reads the rpc');
  assert.strictEqual(mo.calls[0].q, 'rpc/my_inservice_topics');
  assert.strictEqual(mo.calls[0].token, 'jwt-stale', 'the rpc uses the session access token');
  const cards = cardsOf(mo.el.innerHTML);
  assert.strictEqual(cards.length, 5, 'catalog cards only when every assignment is in the catalog');
  assert.ok(cards[1].includes('Depression') && cards[1].includes('>Start</button>') && cards[1].includes('DUE THIS MONTH'), 'topic 3 unlocks');
  assert.ok(cards[2].includes('>Completed</span>') && !cards[2].includes('DUE THIS MONTH'), 'completed topic 4 stays completed and not due');
  assert.ok(cards[3].includes('Food Allergies') && cards[3].includes('>Start</button>'), 'topic 5 unlocks');
  assert.ok(cards[4].includes('Tuberculosis') && cards[4].includes('>Start</button>'), 'topic 8 unlocks');
  assert.ok(cards[0].includes('>Locked</span>'), 'unassigned catalog topic stays locked');
  assert.strictEqual(mo.badge.textContent, '3', 'badge matches the three catalog dues');
  assert.strictEqual(mo.badge.hidden, false);
  assert.strictEqual(mo.banner.style.display, 'block');

  const recovered = boot({
    failStatus:401,
    failTimes:1,
    rows:[{topic_id:'3'}, {topic_id:'5'}, {topic_id:'8'}]
  });
  await vm.runInContext('checkISNotif()', recovered);
  assert.strictEqual(recovered.refreshes, 1, 'one JWT refresh after 401');
  assert.strictEqual(recovered.calls.length, 2, 'the rpc is retried once');
  assert.strictEqual(recovered.calls[1].token, 'jwt-refreshed', 'the retry sends the refreshed session JWT');
  assert.strictEqual(recovered.badge.textContent, '3', 'a recovered rpc paints the Ace due count');
  assert.ok(recovered.order.indexOf('refresh') < recovered.order.lastIndexOf('rest'), 'refresh happens before the retry');

  const still401 = boot({failStatus:401, failTimes:2, rows:[{topic_id:'3'}]});
  await vm.runInContext('renderISList()', still401);
  assert.strictEqual(still401.refreshes, 1, 'a second 401 does not refresh again');
  assert.strictEqual(still401.calls.length, 2, 'only one retry');
  assert.ok(cardsOf(still401.el.innerHTML).every(function(card){return card.includes('>Locked</span>');}), 'soft 401 leaves the list locked');
  assert.strictEqual(still401.badge.hidden, true, 'soft 401 hides the badge');
  assert.strictEqual(still401.badge.textContent, '', 'hidden badge has no number');

  const refreshNo = boot({failStatus:401, refreshFails:true, rows:[{topic_id:'3'}]});
  await vm.runInContext('sbMyInserviceTopics()', refreshNo);
  assert.strictEqual(refreshNo.refreshes, 1);
  assert.strictEqual(refreshNo.calls.length, 1, 'failed refresh does not retry the rpc');

  const otherFail = boot({fail:true, rows:[{topic_id:'3'}]});
  await vm.runInContext('sbMyInserviceTopics()', otherFail);
  assert.strictEqual(otherFail.refreshes, undefined, 'a non-auth failure does not refresh');
  assert.strictEqual(otherFail.calls.length, 1);

  const orphan = boot({
    rows:[
      {topic_id:3, topic_title:'Depression'},
      {topic_id:'99', topic_title:'Office Only Topic'},
      {topic_id:'77'}
    ]
  });
  await vm.runInContext('renderISList()', orphan);
  assert.ok(orphan.el.innerHTML.includes('data-orphan-topic="99"'), 'titled non-catalog topic is a card');
  assert.ok(orphan.el.innerHTML.includes('Office Only Topic') && orphan.el.innerHTML.includes('DUE THIS MONTH'), 'orphan card is due');
  assert.ok(!orphan.el.innerHTML.includes('data-orphan-topic="77"'), 'untitled non-catalog id is not a card');
  assert.strictEqual(orphan.badge.textContent, '2', 'badge counts catalog 3 plus the titled orphan, not the bare id');

  const bare = boot({rows:['77']});
  await vm.runInContext('checkISNotif()', bare);
  assert.strictEqual(bare.badge.hidden, true, 'an assignment the list cannot show does not keep the badge');
  assert.strictEqual(vm.runInContext('dueInserviceCount(new Set(["77"]), {})', bare), 0);

  const cleared = boot({
    rows:['3', '5', '8'],
    stored:{completed_3:'September 3, 2026', completed_5:'September 5, 2026', completed_8:'September 8, 2026'}
  });
  await vm.runInContext('checkISNotif()', cleared);
  assert.strictEqual(cleared.badge.hidden, true, 'badge hides when every catalog assignment is completed');
  assert.strictEqual(cleared.banner.style.display, 'none');

  const sheets = boot({sb:false, rows:['3', '5', '8']});
  await vm.runInContext('checkISNotif()', sheets);
  assert.strictEqual(sheets.calls.length, 0, 'sheets rollback does not call the rpc');
  assert.strictEqual(sheets.order.indexOf('ensure'), -1, 'sheets rollback does not refresh a JWT');
  assert.strictEqual(sheets.badge.hidden, true);

  const shown = boot({rows:[]});
  shown.checkISNotif = function(){shown.showChecks = (shown.showChecks || 0) + 1;};
  await vm.runInContext('cgRefreshInserviceDueOnShow()', shown);
  assert.strictEqual(shown.showChecks, 1, 'a logged-in visible page re-fetches');
  shown.currentUser = null;
  await vm.runInContext('cgRefreshInserviceDueOnShow()', shown);
  assert.strictEqual(shown.showChecks, 1, 'logged out does not re-fetch');

  const hydrateBox = {
    evercareSbEnabled: function(){return true;},
    currentUser:{username:'mossier', sbAccessToken:'jwt-stale'},
    sbDataEnabled: function(){return !!hydrateBox.currentUser.sbAccessToken;},
    sbEnsureCaregiverJwt: async function(){hydrateBox.order.push('ensure'); return true;},
    sbRefreshCaregiverJwt: async function(){
      hydrateBox.order.push('refresh');
      hydrateBox.currentUser.sbAccessToken = 'jwt-refreshed';
      return true;
    },
    getISData: function(){return hydrateBox.isData;},
    saveISData: function(data){hydrateBox.isData = data;},
    sbRest: async function(q){
      hydrateBox.order.push('rest');
      hydrateBox.queries.push(q);
      if(hydrateBox.queries.length === 1){
        const err = new Error('HTTP 401');
        err.pack = {status:401};
        throw err;
      }
      return [{topic_id:4, username:'mossier', status:'Active', completed:'September 4, 2026', submitted_at:'2026-09-04T15:00:00.000Z'}];
    }
  };
  hydrateBox.isData = {};
  hydrateBox.order = [];
  hydrateBox.queries = [];
  vm.createContext(hydrateBox);
  vm.runInContext(hydrateFn, hydrateBox);
  await vm.runInContext('sbHydrateInserviceCompletions()', hydrateBox);
  assert.deepStrictEqual(hydrateBox.order, ['ensure', 'rest', 'refresh', 'rest'], 'hydrate retries once after 401');
  assert.ok(hydrateBox.queries[0].indexOf('inservice_results?') === 0, 'retry stays on inservice_results');
  assert.strictEqual(hydrateBox.isData.completed_4, 'September 4, 2026', 'the retried select hydrates the completion');

  console.log('caregiver-is-badge2-test: ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
