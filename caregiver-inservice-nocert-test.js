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

assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-inservice-nocert v=nocert1 —'), 'nocert build marker');
assert.ok(html.includes('v=nocert1'), 'nocert probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-inservice-nocert">'), 'nocert meta');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-sb-seal v=sbseal1 —'), 'auth seal marker stays');
assert.ok(html.includes('v=sbseal1'), 'auth seal probe stays');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-sb-seal">'), 'auth seal meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-offline-save v=offline1 —'), 'offline marker stays');
assert.ok(html.includes('v=offline1'), 'offline probe stays');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-offline-save">'), 'offline meta stays');

const listFn = extractFn(html, 'async function renderISList()');
assert.ok(listFn.includes('>Completed</span>'), 'completed badge');
assert.ok(!listFn.includes('>Done</span>'), 'done badge is replaced');
assert.ok(listFn.includes('Completed: '), 'completion date stays on the card');
assert.ok(!listFn.includes('printCompletedISCert'), 'completed cards do not print');
assert.ok(!listFn.includes('printCurrentISCert'), 'completed cards do not open the current cert');
assert.ok(!/Print Certificate|View Cert/i.test(listFn), 'no print or view certificate control on the list');
assert.ok(listFn.includes('>Start</button>'), 'assigned cards still start');
assert.ok(listFn.includes('>Locked</span>'), 'unassigned cards stay locked');

const successStart = html.indexOf('id="isSuccessScreen"');
const successEnd = html.indexOf('<footer>', successStart);
assert.ok(successStart > 0 && successEnd > successStart, 'success screen');
const success = html.slice(successStart, successEnd);
assert.ok(!success.includes('printCurrentISCert'), 'success screen does not print');
assert.ok(!/Print Certificate|View Cert/i.test(success), 'success screen has no certificate button');
assert.ok(success.includes('Back to Home'), 'success screen still returns home');

const ribbon = extractFn(html, 'function certRibbonHtml()');
assert.ok(ribbon.includes('Personal Care / Home Making'), 'residual cert copy stays on the aide track');
assert.ok(!/Skilled Nursing|Therapy/i.test(ribbon), 'residual cert copy is not skilled nursing or therapy');

const el = {innerHTML:''};
const sandbox = {
  document:{getElementById(){return el;}},
  INSERVICES:[
    {id:3, shortTitle:'Hand Hygiene', title:'Infection Control & Hand Hygiene'},
    {id:4, shortTitle:'Falls', title:'Fall Prevention'},
    {id:5, shortTitle:'Nutrition', title:'Nutrition Basics'}
  ],
  getAssignedIS:async function(){return 4;},
  getISData:function(){return {'completed_3':'September 2, 2026'};}
};
vm.createContext(sandbox);
vm.runInContext(extractFn(html, 'function escapeHtml(str)') + '\n' + extractFn(html, 'function formatCertDate(val)') + '\n' + listFn, sandbox);

(async function(){
  await vm.runInContext('renderISList()', sandbox);
  const cards = el.innerHTML.split('<div class="card"').slice(1);
  assert.strictEqual(cards.length, 3, 'one card per topic');
  assert.ok(cards[0].includes('>Completed</span>'), 'done card badge');
  assert.ok(cards[0].includes('Completed: September 2, 2026'), 'done card date');
  assert.ok(!/Print Certificate|View Cert|printCompletedISCert|printCurrentISCert/i.test(cards[0]), 'done card has no certificate action');
  assert.ok(cards[1].includes('>Start</button>'), 'due card still starts');
  assert.ok(cards[1].includes('DUE THIS MONTH'), 'due card still flags the month');
  assert.ok(!cards[1].includes('>Completed</span>'), 'due card is not completed');
  assert.ok(cards[2].includes('>Locked</span>'), 'other card stays locked');
  assert.ok(!/Print Certificate|View Cert/i.test(el.innerHTML), 'list has no certificate action');
  console.log('caregiver-inservice-nocert-test: ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
