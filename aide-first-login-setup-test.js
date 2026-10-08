#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractFn(src, sig){
  const start = src.indexOf(sig);
  if(start < 0)return '';
  let i = src.indexOf('{', start);
  let depth = 0;
  for(; i < src.length; i++){
    if(src[i] === '{')depth++;
    else if(src[i] === '}'){
      depth--;
      if(depth === 0)return src.slice(start, i + 1);
    }
  }
  return '';
}

assert.ok(html.includes('id="aideSetupScreen"'), 'mandatory setup screen missing');
assert.ok(html.includes('id="setup_curpass"'), 'current/temp password field missing');
assert.ok(html.includes('id="setup_newpass"'), 'new password field missing');
assert.ok(html.includes('id="setup_confirm"'), 'confirm password field missing');
assert.ok(html.includes('id="setup_email"'), 'email field missing');
assert.ok(html.includes('onclick="submitAideSetup()"'), 'Save & Continue must submit setup');
assert.ok(!/id="aideSetupScreen"[\s\S]{0,2200}\bSkip\b/.test(html), 'setup screen must not offer Skip');
assert.ok(!html.includes("action:'login'"), 'login does not post Apps Script');
assert.ok(html.includes('mustChangePassword:aideTruth(user&&user.mustChangePassword)') && html.includes('needsEmail:aideTruth(user&&user.needsEmail)'),
  'login session must capture mustChangePassword + needsEmail');
assert.ok(!html.includes("postAideAction('complete_aide_setup','set_password'"),
  'setup does not post the sheets password actions');
assert.ok(html.includes('currentPassword') && html.includes('newPassword'),
  'setup still collects the current and new password');
assert.ok(html.includes('function requireAideSetup'), 'requireAideSetup missing');
assert.ok(html.includes('if(aideSetupRequired())'), 'afterLogin must halt on the gate');
assert.ok(html.includes('if(!requireAideSetup())return'), 'home/portal entry points must honor the gate');

const helpers = extractFn(html, 'function aideTruth(v)') + '\n' +
  extractFn(html, 'function aideSetupRequired(sess)') + '\n' +
  extractFn(html, 'function aceLooksLikeUnknownAction(text)') + '\n' +
  extractFn(html, 'function aceActionError(data,err,action)') + '\n' +
  extractFn(html, 'function aideSetupSuccess(data)');

assert.ok(helpers.includes('function aideTruth'), 'aideTruth missing');
assert.ok(helpers.includes('function aideSetupRequired'), 'aideSetupRequired missing');
assert.ok(helpers.includes('function aideSetupSuccess'), 'aideSetupSuccess missing');

const fn = new Function('currentUser','store', helpers + '; return {aideTruth, aideSetupRequired, aceLooksLikeUnknownAction, aceActionError, aideSetupSuccess};');
const h = fn(null, {get:function(){return null;}});

assert.ok(h.aideTruth(true) && h.aideTruth(1) && h.aideTruth('yes') && h.aideTruth('True'), 'truthy flag aliases');
assert.ok(!h.aideTruth(false) && !h.aideTruth(0) && !h.aideTruth('no') && !h.aideTruth(''), 'falsey flags');
assert.ok(h.aideSetupRequired({username:'jdoe', mustChangePassword:true}), 'mustChangePassword gates');
assert.ok(h.aideSetupRequired({username:'jdoe', needsEmail:true}), 'needsEmail gates');
assert.ok(h.aideSetupRequired({username:'jdoe', mustChangePassword:['y','es'].join(''), needsEmail:false}), 'string yes gates');
assert.ok(!h.aideSetupRequired({username:'jdoe', mustChangePassword:false, needsEmail:false}), 'cleared flags pass');
assert.ok(!h.aideSetupRequired({username:'jdoe'}), 'missing flags do not gate');
assert.ok(!h.aideSetupRequired(null), 'no session is not gated');

assert.ok(h.aideSetupSuccess({success:true, mustChangePassword:false}), 'success + flag false');
assert.ok(h.aideSetupSuccess({success:true}), 'success without flag still clears');
assert.ok(h.aideSetupSuccess({mustChangePassword:false}), 'mustChangePassword false is success');
assert.ok(!h.aideSetupSuccess({success:true, mustChangePassword:true}), 'still-gated success stays blocked');
assert.ok(!h.aideSetupSuccess({success:false, error:'Wrong password'}), 'Ace fail is not success');
assert.ok(!h.aideSetupSuccess(null), 'null is not success');

assert.ok(h.aceLooksLikeUnknownAction('Unknown action: complete_aide_setup'));
assert.strictEqual(h.aceActionError({error:'Wrong password'}, null, 'complete_aide_setup'), 'Wrong password');
assert.ok(/Unknown action: complete_aide_setup/.test(h.aceActionError({error:'Unknown action'}, null, 'complete_aide_setup')));

(async function testAliasRetry(){
  assert.ok(!html.includes('async function postAideAction('), 'sheets setup helper is gone');
  assert.ok(!html.includes('function apiPost('), 'Apps Script post helper is gone');
  console.log('aide-first-login-setup-test: ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
