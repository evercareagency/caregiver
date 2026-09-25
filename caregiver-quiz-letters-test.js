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

assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cgquizlet1 v=cgquizlet1 —'), 'quiz letter marker');
assert.ok(html.includes('v=cgquizlet1'), 'quiz letter probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgquizlet1">'), 'quiz letter meta');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-loginkb1">'), 'loginkb1 meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-loginkb1 v=loginkb1 —'), 'loginkb1 marker stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cgisbadge1 v=cgisbadge1 —'), 'inservice badge marker stays');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgisbadge1">'), 'inservice badge meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cghome1 v=cghome1 —'), 'cghome marker stays');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cghome1">'), 'cghome meta stays');
assert.ok(html.includes('v=cgauth1') && html.includes('v=bcast1b') && html.includes('v=nocert1') && html.includes('v=offline1'), 'prior markers stay');

const letterFn = extractFn(html, 'function cgQuizChoiceLetter(i)');
const textFn = extractFn(html, 'function cgQuizChoiceText(opt)');
const renderFn = extractFn(html, 'function renderQuestion()');
const answerFn = extractFn(html, 'function answerQ(idx)');
const escapeFn = extractFn(html, 'function escapeHtml(str)');
const submitFn = extractFn(html, 'async function submitInservice()');

assert.ok(renderFn.includes('cgQuizChoiceLetter(i)'), 'each choice uses the index letter');
assert.ok(renderFn.includes('answerQ(\'+i+\')'), 'click still passes the numeric index');
assert.ok(!renderFn.includes('String.fromCharCode'), 'letter mapping lives in the helper');
assert.ok(answerFn.includes('isAnswers.push(idx)'), 'answers stay numeric indexes');
assert.ok(submitFn.includes('answers:isAnswers.slice()'), 'submit still posts the index list');
assert.ok(html.includes('options:["power outage","medical emergency","hurricane","fire"]'), 'emergency choice text stays bare');

const els = {};
function grab(id){
  if(!els[id])els[id] = {id:id, textContent:'', innerHTML:'', style:{}};
  return els[id];
}
const sandbox = {
  document:{getElementById:grab},
  currentIS:null,
  currentQIdx:0,
  isAnswers:[],
  isSigInit:true,
  shown:'',
  showScreen:function(id){sandbox.shown = id;},
  initSig:function(){}
};
vm.createContext(sandbox);
vm.runInContext(letterFn + '\n' + textFn + '\n' + escapeFn + '\n' + renderFn + '\n' + answerFn, sandbox);

const letters = vm.runInContext('[0,1,2,3,4,5].map(cgQuizChoiceLetter).join("")', sandbox);
assert.strictEqual(letters, 'ABCDEF', '0→A through 5→F');
assert.strictEqual(vm.runInContext('cgQuizChoiceText("B. medical emergency")', sandbox), 'medical emergency', 'stored letter is not part of the body');
assert.strictEqual(vm.runInContext('cgQuizChoiceText("medical emergency")', sandbox), 'medical emergency', 'bare choice text stays');
assert.strictEqual(vm.runInContext('cgQuizChoiceText("all of the above")', sandbox), 'all of the above', 'words are not treated as a letter prefix');

sandbox.currentIS = {
  shortTitle:'Emergency Preparedness',
  questions:[{
    q:'Which of the following is an example of a natural disaster?',
    options:['power outage','B. medical emergency','hurricane','fire']
  }]
};
sandbox.currentQIdx = 0;
vm.runInContext('renderQuestion()', sandbox);
const emergency = els.isOptions.innerHTML;
assert.strictEqual((emergency.match(/class="is-quiz-choice"/g) || []).length, 4, 'four choices, four letters');
assert.ok(emergency.includes('data-choice-letter="A"') && emergency.includes('onclick="answerQ(0)"'), 'first choice is A and index 0');
assert.ok(emergency.includes('<strong style="color:var(--teal)">B.</strong> medical emergency'), 'B. medical emergency');
assert.ok(!emergency.includes('B.</strong> B.'), 'stored B. is not repeated');
assert.ok(emergency.includes('data-choice-letter="D"') && emergency.includes('onclick="answerQ(3)"'), 'fourth choice is D and index 3');

sandbox.currentIS = {
  shortTitle:'Six',
  questions:[{
    q:'Pick one',
    options:['one','two','three','four','five','<six>']
  }]
};
sandbox.currentQIdx = 0;
vm.runInContext('renderQuestion()', sandbox);
const six = els.isOptions.innerHTML;
['A','B','C','D','E','F'].forEach(function(letter, i){
  assert.ok(six.includes('data-choice-letter="'+letter+'"'), 'letter '+letter);
  assert.ok(six.includes('onclick="answerQ('+i+')"'), 'index '+i);
  assert.ok(six.includes('<strong style="color:var(--teal)">'+letter+'.</strong>'), 'visible '+letter);
});
assert.strictEqual((six.match(/class="is-quiz-choice"/g) || []).length, 6, 'six choices');
assert.ok(six.includes('&lt;six&gt;'), 'choice text is escaped so the letter stays');
assert.ok(!six.includes('<six>'), 'raw markup is not injected into the choice');

sandbox.currentIS = {
  shortTitle:'True False',
  questions:[
    {q:'One', options:['True','False']},
    {q:'Two', options:['Yes','No']}
  ]
};
sandbox.currentQIdx = 0;
sandbox.isAnswers = [];
sandbox.shown = '';
vm.runInContext('renderQuestion()', sandbox);
assert.ok(els.isOptions.innerHTML.includes('<strong style="color:var(--teal)">A.</strong> True'), 'A. True');
assert.ok(els.isOptions.innerHTML.includes('<strong style="color:var(--teal)">B.</strong> False'), 'B. False');
vm.runInContext('answerQ(1)', sandbox);
assert.deepStrictEqual(sandbox.isAnswers, [1], 'first answer is the numeric index');
assert.strictEqual(sandbox.currentQIdx, 1, 'quiz advances');
assert.ok(els.isOptions.innerHTML.includes('<strong style="color:var(--teal)">A.</strong> Yes'), 'next question still letters from A');
vm.runInContext('answerQ(0)', sandbox);
assert.deepStrictEqual(sandbox.isAnswers, [1, 0], 'submit list is indexes');
assert.strictEqual(sandbox.shown, 'isSigScreen', 'last answer still opens the signature step');

console.log('caregiver-quiz-letters-test: ok');
