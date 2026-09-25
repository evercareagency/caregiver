#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

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

assert.ok(html.includes('v=cgauth1'), 'cgauth probe marker');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-cgauth1">'), 'cgauth build meta');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-cgauth1 v=cgauth1 —'), 'cgauth build comment');
assert.ok(html.includes('#resetModal input[type="text"],#resetModal input[type="email"],#resetModal input[type="password"]{min-height:48px;font-size:1rem;}'), 'forgot fields stay a phone tap target');
assert.ok(!html.includes('/auth/v1/signup'), 'caregiver tip does not sign aides up in Auth');
assert.ok(!html.includes('reset_aide_temp_password'), 'office temp-password rpc stays in Admin');
assert.strictEqual((html.match(/\/auth\/v1\/token\?grant_type=password/g) || []).length, 2, 'password grant stays login plus setup');

const loginFn = extractFn(html, 'async function doLogin()');
const signupFn = extractFn(html, 'async function doSignup()');
const verifyFn = extractFn(html, 'async function verifyReset()');
const resetFn = extractFn(html, 'async function doResetPassword()');
const setupFn = extractFn(html, 'async function submitAideSetup()');
const authSetup = extractFn(html, 'async function completeAideSetupSupabase(currentPassword,newPassword,email)');
const recoverFn = extractFn(html, 'async function sendAideRecoveryEmail(email)');
const recoverSubmit = extractFn(html, 'async function submitRecoveryPassword()');
assert.ok(loginFn && signupFn && verifyFn && resetFn && setupFn && authSetup && recoverFn && recoverSubmit);

assert.ok(loginFn.indexOf('await loginAideWithSupabase(user,pass)') < loginFn.indexOf("action:'login'"), 'default login is Auth before Sheets');
assert.ok(loginFn.slice(0, loginFn.indexOf("action:'login'")).includes('return;'), 'Auth login returns before Sheets');
assert.ok(loginFn.includes("if(evercareSbEnabled()){document.getElementById('loginErr').style.display='block';}"), 'cut login errors do not read a local password');

const signupCut = signupFn.slice(0, signupFn.indexOf('SHEETS_URL'));
assert.ok(signupCut.includes('evercareSbEnabled()') && signupCut.includes('return;'), 'cut signup returns before Sheets');
assert.ok(!signupCut.includes('password:pass'), 'cut signup does not store a local password');

assert.ok(verifyFn.includes('sendAideRecoveryEmail(resolved)'), 'forgot recovers to the resolved Auth email');
assert.ok(verifyFn.includes('releaseStuckSheetsRollback()'), 'forgot clears a stuck sheets rollback');
assert.ok(!verifyFn.includes('verify_reset') && !verifyFn.includes('SHEETS_URL'), 'forgot does not call Sheets verify_reset');
assert.ok(recoverFn.includes('/auth/v1/recover') && !recoverFn.includes('SHEETS_URL'), 'forgot email is Auth recover');
assert.ok(recoverSubmit.includes("method:'PUT'") && recoverSubmit.includes('/auth/v1/user') && !recoverSubmit.includes('SHEETS_URL'), 'recovery save is Auth updateUser');

const resetCut = resetFn.slice(0, resetFn.indexOf("action:'reset_password'"));
assert.ok(resetCut.includes('evercareSbEnabled()') && resetCut.includes('return;'), 'cut reset_password returns before Sheets');

const setupGate = setupFn.indexOf('if(evercareSbEnabled()){');
const setupSheets = setupFn.indexOf("postAideAction('complete_aide_setup','set_password'");
assert.ok(setupGate > 0 && setupGate < setupSheets, 'must-change Auth branch precedes Sheets');
const setupBetween = setupFn.slice(setupGate, setupSheets);
assert.ok(setupBetween.includes('completeAideSetupSupabase(currentPassword,newPassword,email)'), 'cut must-change updates Auth');
assert.ok(setupBetween.includes('return;'), 'cut must-change returns before Sheets');
assert.ok(!setupBetween.includes('sbAccessToken'), 'a missing JWT must not skip Auth and hit Sheets');
assert.ok(authSetup.includes("method:'PUT'") && authSetup.includes('/auth/v1/user'), 'setup password is updateUser');
assert.ok(authSetup.includes('must_change_password:false'), 'setup clears the aide flag');
assert.ok(!authSetup.includes('SHEETS_URL') && !authSetup.includes('set_password'), 'Auth setup does not write Sheets');

const urlConst = (html.match(/const SUPABASE_URL='([^']+)'/) || [])[1];
const keyConst = (html.match(/const SUPABASE_ANON_KEY='([^']+)'/) || [])[1];
const sheetsUrl = (html.match(/const SHEETS_URL='([^']+)'/) || [])[1];
const aideId = '22222222-2222-2222-2222-222222222222';
const userId = '11111111-1111-1111-1111-111111111111';

const src = [
  'const SHEETS_URL=' + JSON.stringify(sheetsUrl) + ';',
  'const SUPABASE_URL=' + JSON.stringify(urlConst) + ';',
  'const SUPABASE_ANON_KEY=' + JSON.stringify(keyConst) + ';',
  extractFn(html, 'function evercareSbEnabled()'),
  extractFn(html, 'function sbAnonHeaders()'),
  extractFn(html, 'function sbUserHeaders(token)'),
  extractFn(html, 'function sbPersistAuth(session)'),
  extractFn(html, 'async function sbRead(res)'),
  extractFn(html, 'function sbErrMsg(pack,fallback)'),
  extractFn(html, 'function sbJwtSub(token)'),
  extractFn(html, 'function sbExpiresMs(auth)'),
  extractFn(html, 'function sbWorkingEmail(submitted,authEmail,aideEmail)'),
  extractFn(html, 'function aideTruth(v)'),
  extractFn(html, 'function aceLooksLikeUnknownAction(text)'),
  extractFn(html, 'function aceActionError(data,err,action)'),
  extractFn(html, 'function aideSetupSuccess(data)'),
  extractFn(html, 'async function postAideAction(primary,alias,payload)'),
  extractFn(html, 'async function completeAideSetupSupabase(currentPassword,newPassword,email)'),
  extractFn(html, 'function paintCaregiverOpenLink(id)'),
  extractFn(html, 'function passwordSavedHoldKey()'),
  extractFn(html, 'function passwordSavedHold()'),
  extractFn(html, 'function markPasswordSavedHold(which)'),
  extractFn(html, 'function clearPasswordSavedHold()'),
  extractFn(html, 'function activatePortalScreen(id)'),
  extractFn(html, 'function dropRecoveredPortalSession()'),
  extractFn(html, 'function showAideSetupSaved()'),
  extractFn(html, 'async function submitAideSetup()')
].join('\n');

function storage(initial){
  const mem = Object.assign({}, initial || {});
  return {
    getItem: function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
    setItem: function(k, v){mem[k] = String(v);},
    removeItem: function(k){delete mem[k];}
  };
}

function harness(opts){
  const calls = [];
  const sheets = [];
  const toasts = [];
  const homes = [];
  const nodes = {
    setup_curpass: {value: opts.currentPassword || 'temp-pw'},
    setup_newpass: {value: opts.newPassword || 'lasting-pw'},
    setup_confirm: {value: opts.confirmPassword || 'lasting-pw'},
    setup_email: {value: opts.email || 'aide.one@example.com'},
    aideSetupErr: {textContent: '', style: {display: 'none'}},
    aideSetupBtn: {textContent: 'Save & Continue →', disabled: false},
    aideSetupForm: {style: {display: ''}},
    aideSetupDone: {style: {display: 'none'}},
    aideSetupDoneTitle: {textContent: 'Password saved'},
    aideSetupScreen: {classList: {add: function(){}, remove: function(){}}},
    aideSetupOpenCaregiver: {textContent: 'Open Caregiver', href: './', removeAttribute: function(){}}
  };
  const box = {
    SHEETS_URL: sheetsUrl,
    SUPABASE_URL: urlConst,
    SUPABASE_ANON_KEY: keyConst,
    location: {search: opts.search || ''},
    localStorage: storage(opts.storage),
    sessionStorage: storage(),
    window: {_cgFreshLogin: true, _aideSetupCurrentPassword: 'temp-pw'},
    currentUser: opts.currentUser,
    document: {
      getElementById: function(id){return nodes[id] || null;},
      querySelectorAll: function(){return [];}
    },
    fetch: function(url, init){
      const rec = {url: String(url), init: init || {}};
      calls.push(rec);
      const u = rec.url;
      let res = {ok: false, status: 500, raw: '{}'};
      if(u.indexOf('grant_type=password') >= 0){
        res = {ok: true, status: 200, raw: JSON.stringify({
          access_token: 'fresh-token',
          refresh_token: 'fresh-refresh',
          expires_in: 3600,
          user: {id: userId, email: 'aide.one@example.com'}
        })};
      }else if(u.indexOf('/auth/v1/user') >= 0){
        res = {ok: true, status: 200, raw: JSON.stringify({email: 'aide.one@example.com'})};
      }else if(u.indexOf('/rest/v1/aides') >= 0){
        res = {ok: true, status: 200, raw: JSON.stringify([{
          id: aideId,
          email: 'aide.one@example.com',
          must_change_password: false
        }])};
      }else if(u.indexOf('/rest/v1/profiles') >= 0){
        res = {ok: true, status: 204, raw: ''};
      }
      return Promise.resolve({
        ok: res.ok,
        status: res.status,
        text: function(){return Promise.resolve(res.raw);}
      });
    },
    apiPost: async function(payload){
      sheets.push(payload);
      if(opts.sheetsUnknown && payload.action === 'complete_aide_setup'){
        return {success: false, error: 'Unknown action: complete_aide_setup'};
      }
      return {success: true, mustChangePassword: false};
    },
    showTempMsg: function(msg){toasts.push(msg);},
    afterLogin: function(arg){homes.push(arg);},
    clearAideSetupGate: function(){
      box.currentUser.mustChangePassword = false;
      box.currentUser.needsEmail = false;
    },
    persistAideSetupFlags: function(){},
    JSON: JSON,
    Date: Date,
    Number: Number,
    String: String,
    Error: Error,
    Array: Array,
    Object: Object,
    encodeURIComponent: encodeURIComponent
  };
  vm.createContext(box);
  vm.runInContext(src, box);
  return {box: box, calls: calls, sheets: sheets, toasts: toasts, homes: homes, nodes: nodes};
}

(async function(){
  const lasting = harness({
    currentUser: {
      username: 'aide.one',
      email: 'aide.one@example.com',
      mustChangePassword: true,
      needsEmail: false,
      sbAccessToken: 'old-token',
      sbRefreshToken: 'old-refresh',
      sbUserId: userId,
      sbAideId: aideId,
      sbEmail: 'aide.one@example.com'
    }
  });
  await vm.runInContext('submitAideSetup()', lasting.box);
  const put = lasting.calls.filter(function(c){return c.url.indexOf('/auth/v1/user') >= 0;})[0];
  assert.ok(put && put.init.method === 'PUT', 'must-change writes the new password to Auth');
  assert.deepStrictEqual(JSON.parse(put.init.body), {password: 'lasting-pw', email: 'aide.one@example.com'});
  const patch = lasting.calls.filter(function(c){return c.init.method === 'PATCH' && c.url.indexOf('/rest/v1/aides') >= 0;})[0];
  assert.strictEqual(JSON.parse(patch.init.body).must_change_password, false);
  assert.deepStrictEqual(lasting.sheets, [], 'token setup does not post Sheets');
  assert.ok(!lasting.calls.some(function(c){return c.url === sheetsUrl;}));
  assert.deepStrictEqual(lasting.toasts, ['Account setup complete.']);
  assert.deepStrictEqual(lasting.homes, [], 'setup success does not enter home');
  assert.strictEqual(lasting.box.currentUser, null, 'setup success drops the local session');
  assert.strictEqual(lasting.box.localStorage.getItem('evercare_sb_session'), null);
  assert.strictEqual(lasting.box.sessionStorage.getItem('evercare_sb_session'), null);
  assert.strictEqual(lasting.box.sessionStorage.getItem('cghome1b_pw_saved'), 'setup');
  assert.strictEqual(lasting.nodes.aideSetupForm.style.display, 'none');
  assert.strictEqual(lasting.nodes.aideSetupDone.style.display, 'block');
  assert.strictEqual(lasting.nodes.aideSetupDoneTitle.textContent, 'Password saved');
  assert.strictEqual(lasting.nodes.aideSetupOpenCaregiver.textContent, 'Open Caregiver');

  const missing = harness({
    currentUser: {
      username: 'aide.one',
      email: 'aide.one@example.com',
      mustChangePassword: true,
      needsEmail: true
    }
  });
  await vm.runInContext('submitAideSetup()', missing.box);
  assert.deepStrictEqual(missing.sheets, [], 'missing JWT does not post set_password');
  assert.strictEqual(missing.calls.length, 0, 'missing JWT does not call Auth or Sheets');
  assert.strictEqual(missing.nodes.aideSetupErr.textContent, 'Sign in again to finish setup.');
  assert.deepStrictEqual(missing.homes, [], 'failed setup does not enter the portal');

  const sheetsMode = harness({
    search: '?sheets=1',
    sheetsUnknown: true,
    currentUser: {
      username: 'aide.one',
      email: 'aide.one@example.com',
      mustChangePassword: true,
      needsEmail: true
    }
  });
  await vm.runInContext('submitAideSetup()', sheetsMode.box);
  assert.deepStrictEqual(sheetsMode.sheets.map(function(p){return p.action;}), ['complete_aide_setup', 'set_password']);
  assert.strictEqual(sheetsMode.sheets[1].newPassword, 'lasting-pw');
  assert.strictEqual(sheetsMode.calls.length, 0, 'sheets rollback does not call Auth');
  assert.deepStrictEqual(sheetsMode.toasts, ['Account setup complete.']);

  console.log('caregiver-cgauth-test: ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
