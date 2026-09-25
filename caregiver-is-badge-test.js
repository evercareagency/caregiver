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

assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cgisbadge1 v=cgisbadge1 —'), 'badge build comment');
assert.ok(html.includes('v=cgisbadge1'), 'badge probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgisbadge1">'), 'badge build meta');
assert.ok(html.includes('v=bcast1b') && html.includes('v=bcast1') && html.includes('v=isassign1') && html.includes('v=portal1'), 'prior markers stay');
assert.ok(html.includes('v=ishydr1') && html.includes('v=nocert1') && html.includes('v=offline1'), 'hydrate, nocert, offline stay');

const nav = html.slice(html.indexOf('id="bottomNav"'), html.indexOf('id="deleteDraftModal"'));
const tabStart = nav.indexOf('data-nav="inservices"');
const tabEnd = nav.indexOf('</button>', tabStart);
const tab = nav.slice(tabStart, tabEnd);
assert.ok(tab.includes('id="isNavBadge"'), 'badge lives on the Inservices tab');
assert.ok(tab.includes('hidden'), 'badge starts hidden');
assert.ok(tab.includes('aria-hidden="true"'), 'badge is decorative');
assert.ok(tab.includes('bn-ico-wrap'), 'badge is anchored to the books icon');
assert.ok(tab.includes('onclick="navGo(\'inservices\')"'), 'the tab is still the control');
assert.ok(!tab.includes('onclick="') || tab.indexOf('onclick="navGo') === tab.indexOf('onclick="'), 'badge has no click of its own');
assert.ok(html.includes('.bottom-nav .bn-badge{') && html.includes('pointer-events:none'), 'badge does not take taps');
assert.ok(html.includes('background:#ff3b30'), 'badge is solid red');
assert.ok(html.includes('min-height:56px') && html.includes('min-width:44px'), 'nav hit target stays at least 44px');
assert.ok(html.includes('You have an inservice due this month!'), 'home banner copy stays');

const notif = extractFn(html, 'async function checkISNotif()');
const countFn = extractFn(html, 'function dueInserviceCount(assigned,isData)');
const paintFn = extractFn(html, 'function paintISDueChrome(dueCount)');
assert.ok(notif.includes('dueInserviceCount(') && notif.includes('paintISDueChrome('), 'banner and badge share one paint');
assert.ok(notif.includes('sbMyInserviceTopics()'), 'count still reads the assignment set');
assert.ok(notif.indexOf('sbHydrateInserviceCompletions') < notif.indexOf('getISData()'), 'completions hydrate before the count');
assert.ok(!notif.includes('completed_'), 'the due rule is not copied into checkISNotif');
assert.ok(countFn.includes("!data['completed_'+id]"), 'due means assigned and not completed');
assert.ok(!/get_assigned_topic|get_is_reminder|getAssignedIS/.test(notif + countFn + paintFn), 'badge does not invent a Sheets due definition');
assert.ok(paintFn.includes('isNotifBanner') && paintFn.includes('isNavBadge'), 'one paint updates banner and badge');

function boot(opts){
  opts = opts || {};
  const calls = [];
  const banner = {innerHTML:'', style:{display:'none', background:''}};
  const badge = {hidden:true, textContent:'', style:{}};
  const box = {
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
      if(id === 'isNotifBanner')return banner;
      if(id === 'isNavBadge')return badge;
      return null;
    }}
  };
  box.isData = JSON.parse(JSON.stringify(opts.stored || {}));
  vm.createContext(box);
  vm.runInContext(extractFn(html, 'function sbInserviceTopicSet(raw)') + '\n' + extractFn(html, 'async function sbMyInserviceTopics()') + '\n' + countFn + '\n' + paintFn + '\n' + notif, box);
  box.calls = calls;
  box.banner = banner;
  box.badge = badge;
  return box;
}

(async function(){
  const two = boot({rows:['2', '5']});
  await vm.runInContext('checkISNotif()', two);
  assert.strictEqual(two.hydrated, true, 'badge path hydrates first');
  assert.strictEqual(two.banner.style.display, 'block', 'two due keeps the banner');
  assert.ok(two.banner.innerHTML.includes('inservice due this month'), 'banner copy stays');
  assert.strictEqual(two.badge.hidden, false, 'two due shows the badge');
  assert.strictEqual(two.badge.textContent, '2', 'badge count is the due count');

  const one = boot({
    rows:['2', '5'],
    stored:{completed_2:'September 2, 2026'}
  });
  await vm.runInContext('checkISNotif()', one);
  assert.strictEqual(one.banner.style.display, 'block', 'one due keeps the banner');
  assert.strictEqual(one.badge.hidden, false);
  assert.strictEqual(one.badge.textContent, '1', 'badge shows the remaining count');

  const clear = boot({
    rows:['2', '5'],
    stored:{completed_2:'September 2, 2026', completed_5:'September 3, 2026'}
  });
  await vm.runInContext('checkISNotif()', clear);
  assert.strictEqual(clear.banner.style.display, 'none', 'banner hides when none are due');
  assert.strictEqual(clear.badge.hidden, true, 'badge hides when none are due');
  assert.strictEqual(clear.badge.textContent, '', 'hidden badge has no number');

  const none = boot({rows:[]});
  await vm.runInContext('checkISNotif()', none);
  assert.strictEqual(none.banner.style.display, 'none');
  assert.strictEqual(none.badge.hidden, true, 'no assignment hides the badge');

  const sheets = boot({sb:false, rows:['2', '5']});
  await vm.runInContext('checkISNotif()', sheets);
  assert.strictEqual(sheets.calls.length, 0, 'sheets rollback does not call the rpc');
  assert.strictEqual(sheets.banner.style.display, 'none', 'sheets rollback hides the banner');
  assert.strictEqual(sheets.badge.hidden, true, 'sheets rollback hides the badge');

  const direct = boot({rows:[]});
  assert.strictEqual(vm.runInContext('dueInserviceCount(new Set(["2","5"]), {})', direct), 2);
  assert.strictEqual(vm.runInContext('dueInserviceCount(new Set(["2","5"]), {completed_2:"September 2, 2026"})', direct), 1);
  assert.strictEqual(vm.runInContext('dueInserviceCount(new Set(["2","5"]), {completed_2:"September 2, 2026", completed_5:"September 3, 2026"})', direct), 0);

  console.log('caregiver-is-badge-test: ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
