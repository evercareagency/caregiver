#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

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

const banned = ['OFFICE' + '_CODE', 'ECA' + '2026'];

function walk(dir, out){
  fs.readdirSync(dir, {withFileTypes:true}).forEach(function(ent){
    if(ent.name === '.git' || ent.name === 'node_modules')return;
    const full = path.join(dir, ent.name);
    if(ent.isDirectory())walk(full, out);
    else out.push(full);
  });
  return out;
}

walk(root, []).forEach(function(file){
  const buf = fs.readFileSync(file);
  if(buf.includes(0))return;
  const text = buf.toString('utf8');
  banned.forEach(function(needle){
    assert.strictEqual(text.indexOf(needle), -1, path.relative(root, file) + ' still has ' + needle);
  });
});

const signupFn = extractFn(html, 'async function doSignup()');
assert.ok(!signupFn.includes('fetch('), 'doSignup source has no fetch');
assert.ok(!signupFn.includes('localStorage') && !signupFn.includes('store.'), 'doSignup source does not write storage');

const calls = [];
const writes = [];
const nodes = {
  signupErr: {textContent: '', style: {display: 'none'}},
  loginErr: {textContent: '', style: {display: 'none'}}
};
const box = {
  document: {getElementById: function(id){return nodes[id] || null;}},
  fetch: function(){
    calls.push('fetch');
    return Promise.reject(new Error('network'));
  },
  localStorage: {setItem: function(k){writes.push(k);}},
  store: {get: function(){return {};}, set: function(k){writes.push(k);}}
};
vm.createContext(box);
vm.runInContext(signupFn + '\nthis.doSignup=doSignup;', box);
box.doSignup().then(function(){
assert.strictEqual(calls.length, 0, 'doSignup makes no fetch');
assert.strictEqual(writes.length, 0, 'doSignup writes no local user');
assert.strictEqual(nodes.signupErr.textContent, 'Accounts are created by the office. Contact your manager.');
assert.strictEqual(nodes.signupErr.style.display, 'block');

const modal = html.slice(html.indexOf('<div class="modal-bg" id="resetModal">'), html.indexOf('<!-- INSERVICE HOME -->'));
assert.ok(modal.includes('id="resetModal"') && modal.includes('id="reset_email"'), 'reset modal keeps the email field');
assert.ok(!modal.includes('id="reset_' + 'user"'), 'reset modal has no username input');
assert.ok(!/<label>\s*Username\s*<\/label>/i.test(modal), 'reset modal has no username label');
assert.ok(!/autocomplete="username"/i.test(modal), 'reset modal has no username autocomplete');
assert.ok(modal.includes('Enter the email on your account.'), 'reset blurb stays');

const verifyFn = extractFn(html, 'async function verifyReset()');
assert.ok(verifyFn.includes('If that email is on file, a reset link is on its way. Questions? Call the office at (216) 377-5991.'), 'reset copy stays');
assert.ok(verifyFn.includes('/auth/v1/recover') === false && extractFn(html, 'async function sendAideRecoveryEmail(email)').includes('/auth/v1/recover'), 'reset still posts the email to recover');
assert.ok(!verifyFn.includes('reset_' + 'user'), 'reset does not validate a username');

const loginErr = extractFn(html, 'function showLoginErr(kind)');
assert.ok(loginErr.includes('15 minutes'), 'lockout copy contains 15 minutes');
assert.ok(html.includes('Too many attempts — please wait 15 minutes and try again'), 'lockout sentence stays in the same tone');

assert.ok(html.includes('SEC1_CG2'), 'SEC1_CG2 marker');
assert.ok(html.includes('data-sec1-cg2="SEC1_CG2"'), 'SEC1_CG2 data marker');
assert.ok(html.includes('?v=sec1-cg2'), 'cache tag ?v=sec1-cg2');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-10-08-sec1-cg2">'), 'sec1-cg2 meta');
assert.ok(html.includes('SEC1_UI_H2') && html.includes('aide_login_email'), 'sec1-ui h2 login stays');
assert.ok(!html.includes('resolve_' + 'username_email'), 'old username email lookup stays gone');
assert.ok(!html.includes("start_url:'?v=sec1-cg2'") && !html.includes('start_url%22:%22?v=sec1-cg2'), 'Home Screen URL is not a sticky ?v=sec1-cg2');
assert.ok(html.includes('const CG_SESSION_MS=8*60*60*1000;'), 'session window stays 8 hours');
assert.ok(html.includes('integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H"'), 'html2canvas SRI stays');
assert.ok(html.includes('integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk"'), 'jspdf SRI stays');

console.log('caregiver-sec1-cg2 checks ok');
}).catch(function(err){
  console.error(err);
  process.exit(1);
});
