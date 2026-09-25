#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const anonKey = (html.match(/const SUPABASE_ANON_KEY='([^']+)'/) || [])[1];
assert.ok(anonKey, 'anon key');

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

assert.ok(html.includes('v=sbseal1'), 'sealed marker');
assert.ok(html.includes('v=pwreset1'), 'password reset ux marker');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-pw-reset-ux">'), 'password reset ux meta');
assert.ok(html.includes('id="recoveryDone"') && html.includes('>Password saved</h2>'), 'success heading stays on the reset page');
assert.ok(html.includes('id="recoveryOpenPortal"') && html.includes('>Open Caregiver</a>'), 'caregiver button is on the reset page');
assert.ok(html.includes('id="aideSetupOpenCaregiver"') && html.includes('>Open Caregiver</a>'), 'finish-account success uses the same CTA');
assert.ok(!html.includes('target="_blank"'), 'success CTA stays in this tab');
assert.ok(html.includes('v=cghome1'), 'cghome marker');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cghome1">'), 'cghome meta');
assert.ok(html.includes('v=cghome1b'), 'cghome1b marker');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cghome1b">'), 'cghome1b meta');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cghome1b v=cghome1b —'), 'cghome1b comment');
assert.ok(!html.includes('setTimeout(openCaregiverLogin'), 'save does not schedule a jump into the portal');
assert.ok(html.includes("const live='https://evercareagency.github.io/caregiver/'"), 'login fallback is LIVE Pages');
assert.ok(html.includes('If you use the app icon on your phone, open it from there after this'), 'browser soft copy');
assert.ok(html.includes('onclick="openCaregiverLogin();return false;"'), 'portal button opens the login url');
assert.ok(!/service_role/i.test(html), 'service_role must not be embedded');
assert.ok(!html.includes('reset_aide_own_password'), 'in-modal Auth password rpc is not the cut path');
assert.ok(!html.includes('reset_aide_temp_password'), 'office temp-password rpc is not called');
assert.ok(!html.includes('/auth/v1/signup'), 'caregiver tip does not sign aides up in Auth');
assert.strictEqual((html.match(/\/auth\/v1\/token\?grant_type=password/g) || []).length, 2, 'password grant stays login plus setup');

const verifyFn = extractFn(html, 'async function verifyReset()');
const resetFn = extractFn(html, 'async function doResetPassword()');
const signupFn = extractFn(html, 'async function doSignup()');
const recoverFn = extractFn(html, 'async function sendAideRecoveryEmail(email)');
const submitFn = extractFn(html, 'async function submitRecoveryPassword()');
const setupFn = extractFn(html, 'async function completeAideSetupSupabase(currentPassword,newPassword,email)');
assert.ok(verifyFn && resetFn && signupFn && recoverFn && submitFn && setupFn);
assert.ok(setupFn.includes("method:'PUT'") && setupFn.includes('/auth/v1/user'), 'logged-in setup still updates Auth');
assert.ok(submitFn.includes("method:'PUT'") && submitFn.includes('/auth/v1/user'), 'recovery landing updates Auth');
assert.ok(submitFn.includes('clearAideMustChangeAfterRecovery'), 'recovery landing clears the aide flag');
assert.ok(submitFn.includes('showRecoveryPasswordSaved'), 'recovery landing shows the saved state');
assert.ok(!submitFn.includes("showScreen('authScreen')"), 'recovery landing does not skip the saved state');
assert.ok(!submitFn.includes('Password updated. Please log in.'), 'recovery landing does not use a disappearing toast');
assert.ok(extractFn(html, 'async function clearAideMustChangeAfterRecovery(token)').includes('must_change_password:false'));
assert.ok(recoverFn.includes('/auth/v1/recover'), 'forgot password sends a recovery email');
assert.ok(!recoverFn.includes('reset_password') && !submitFn.includes('SHEETS_URL'), 'recovery path does not write Sheets');

assert.ok(verifyFn.includes('sendAideRecoveryEmail(resolved)'), 'forgot emails the resolved Auth address');
assert.ok(verifyFn.includes('releaseStuckSheetsRollback()'), 'forgot clears a stuck sheets rollback before recover');
assert.ok(!verifyFn.includes('reset_new_pass'), 'forgot does not open an in-modal password');
assert.ok(!verifyFn.includes('Password reset! Please log in.'), 'forgot does not claim the password changed');
assert.ok(!verifyFn.includes("action:'verify_reset'") && !verifyFn.includes('SHEETS_URL'), 'forgot does not call Sheets verify_reset');
assert.ok(!verifyFn.includes('aideEmailsMatch'), 'a retyped email no longer blocks recover');

const resetSb = resetFn.slice(0, resetFn.indexOf("action:'reset_password'"));
assert.ok(resetSb.includes('return'), 'cut set-password does not fall through to Sheets');
assert.ok(!resetSb.includes('Password reset! Please log in.'), 'cut set-password does not claim a Sheets reset');
assert.ok(resetFn.includes("action:'reset_password'"), 'sheets rollback still resets on Sheets');

const signupSb = signupFn.slice(0, signupFn.indexOf('SHEETS_URL'));
assert.ok(signupSb.includes('evercareSbEnabled()') && signupSb.includes('return'), 'cut signup returns before Sheets');
assert.ok(signupSb.includes('Accounts are created by the office. Contact your manager.'), 'cut signup tells the aide to contact the office');
assert.ok(!signupSb.includes('startCgSession'), 'cut signup does not create a session');
assert.ok(signupFn.includes("action:'signup'"), 'sheets rollback still signs up on Sheets');

function storage(initial){
  const mem = Object.assign({}, initial || {});
  return {
    getItem: function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
    setItem: function(k, v){mem[k] = String(v);},
    removeItem: function(k){delete mem[k];}
  };
}

function field(value, display){
  return {value: value == null ? '' : String(value), textContent: '', disabled: false, style: {display: display || ''}};
}

function b64url(obj){
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function harness(opts){
  const calls = [];
  const toasts = [];
  const closed = [];
  const alerts = [];
  const screens = [];
  const replaced = [];
  const nav = [];
  const timers = [];
  let timerSeq = 0;
  const loc = {
    search: opts.search || '',
    hash: opts.hash || '',
    origin: opts.origin || 'https://caregiver.example',
    pathname: opts.pathname || '/index.html',
    assign: function(url){nav.push({op: 'assign', url: String(url)});},
    reload: function(){nav.push({op: 'reload'});}
  };
  const nodes = {
    reset_user: field(opts.user),
    reset_email: field(opts.email),
    reset_newpwd: field(opts.password),
    reset_new_pass: field('', 'none'),
    reset_verify_btn: field('', 'flex'),
    resetVerifyBtn: field('', ''),
    resetErr: field('', 'none'),
    reset_blurb: field(''),
    s_name: field(opts.name),
    s_user: field(opts.user),
    s_email: field(opts.email),
    s_pass: field(opts.password),
    s_code: field(opts.code),
    signupErr: field('', 'none'),
    signupBtn: {textContent: 'Create Account →', disabled: false, style: {}},
    recovery_pass: field(opts.recoveryPass),
    recovery_confirm: field(opts.recoveryConfirm),
    recoveryErr: field('', 'none'),
    recoveryBtn: {textContent: 'Save password', disabled: false, style: {}},
    recoveryScreen: {classList: {add: function(){}, remove: function(){}}},
    recoveryForm: {style: {display: ''}},
    recoveryDone: {style: {display: 'none'}},
    recoveryDoneTitle: {textContent: 'Password saved'},
    recoveryDoneHint: {textContent: 'If you use the app icon on your phone, open it from there after this', style: {}},
    recoveryOpenPortal: {textContent: 'Open Caregiver', href: './'}
  };
  nodes.resetVerifyBtn.textContent = 'Send reset link →';
  const box = {
    SUPABASE_URL: 'https://zealkptwgifnkbkuavvp.supabase.co',
    SUPABASE_ANON_KEY: anonKey,
    SHEETS_URL: 'https://sheets.example/exec',
    OFFICE_CODE: 'ECA2026',
    JSON: JSON,
    Date: Date,
    String: String,
    Error: Error,
    Object: Object,
    Number: Number,
    URLSearchParams: URLSearchParams,
    encodeURIComponent: encodeURIComponent,
    atob: atob,
    location: loc,
    history: {replaceState: function(_a, _b, next){
      replaced.push(next);
      loc.hash = '';
      loc.search = next.indexOf('?') >= 0 ? next.slice(next.indexOf('?')) : '';
    }},
    localStorage: storage(opts.storage),
    sessionStorage: storage(opts.sessionStorage),
    window: opts.window || {},
    document: {
      getElementById: function(id){return nodes[id] || null;},
      querySelectorAll: function(){return [];}
    },
    alert: function(msg){alerts.push(msg);},
    setTimeout: function(fn, ms){
      timerSeq += 1;
      timers.push({id: timerSeq, fn: fn, ms: ms, cleared: false});
      return timerSeq;
    },
    clearTimeout: function(id){
      timers.forEach(function(t){if(t.id === id)t.cleared = true;});
    },
    closeModal: function(id){closed.push(id);},
    showTempMsg: function(msg){toasts.push(msg);},
    showScreen: function(id){screens.push(id);},
    openModal: function(id){screens.push('open:'+id);},
    unlockBodyScroll: function(){},
    apiPost: async function(body){
      calls.push({url: 'sheets-api', body: body});
      if(opts.sheetsThrow)throw new Error('sheets down');
      return opts.sheets || {success: true};
    },
    cacheInvalidate: function(){calls.push({url: 'cache'});},
    startCgSession: function(){calls.push({url: 'session'});},
    afterLogin: function(){calls.push({url: 'after'});},
    store: {get: function(){return {};}, set: function(){calls.push({url: 'store'});}},
    fetch: function(url, init){
      calls.push({url: String(url), init: init});
      const u = String(url);
      let res = opts.fetch && opts.fetch(u, init);
      if(!res){
        if(u.indexOf('resolve_username_email') >= 0)res = opts.rpc || {ok: true, status: 200, raw: 'null'};
        else if(u.indexOf('/auth/v1/recover') >= 0)res = opts.recover || {ok: true, status: 200, raw: '{}'};
        else if(u.indexOf('/auth/v1/user') >= 0)res = opts.user || {ok: true, status: 200, raw: JSON.stringify({email: 'mo.aide@example.com'})};
        else if(u.indexOf('/rest/v1/aides') >= 0 && init.method === 'GET')res = opts.aide || {ok: true, status: 200, raw: '[]'};
        else if(u.indexOf('/rest/v1/aides') >= 0 && init.method === 'PATCH')res = opts.patch || {ok: true, status: 200, raw: '[]'};
        else res = opts.sheetsHttp || {ok: true, status: 200, raw: JSON.stringify({success: true})};
      }
      return Promise.resolve({
        ok: res.ok,
        status: res.status,
        json: function(){return Promise.resolve(JSON.parse(res.raw || 'null'));},
        text: function(){return Promise.resolve(res.raw == null ? '' : res.raw);}
      });
    }
  };
  const src = [
    extractFn(html, 'function evercareSbEnabled()'),
    extractFn(html, 'function sbAnonHeaders()'),
    extractFn(html, 'function sbUserHeaders(token)'),
    extractFn(html, 'async function sbRead(res)'),
    extractFn(html, 'function sbErrMsg(pack,fallback)'),
    extractFn(html, 'function sbJwtSub(token)'),
    extractFn(html, 'async function resolveAideAuthEmail(username)'),
    extractFn(html, 'function aideEmailsMatch(resolved,entered)'),
    extractFn(html, 'function caregiverRecoverRedirect()'),
    extractFn(html, 'async function sendAideRecoveryEmail(email)'),
    extractFn(html, 'function sbReadAuthParams(raw)'),
    extractFn(html, 'function sbTakeRecoverySession()'),
    extractFn(html, 'function clearPwResetRedirect()'),
    extractFn(html, 'function caregiverLoginUrl()'),
    extractFn(html, 'function openCaregiverLogin()'),
    extractFn(html, 'function paintCaregiverOpenLink(id)'),
    extractFn(html, 'function passwordSavedHoldKey()'),
    extractFn(html, 'function passwordSavedHold()'),
    extractFn(html, 'function markPasswordSavedHold(which)'),
    extractFn(html, 'function clearPasswordSavedHold()'),
    extractFn(html, 'function activatePortalScreen(id)'),
    extractFn(html, 'function dropRecoveredPortalSession()'),
    extractFn(html, 'function showRecoveryPasswordSaved()'),
    extractFn(html, 'function showAideSetupSaved()'),
    extractFn(html, 'function showRecoveryPasswordScreen()'),
    extractFn(html, 'function bootCaregiverPortal()'),
    extractFn(html, 'function releaseStuckSheetsRollback()'),
    extractFn(html, 'async function clearAideMustChangeAfterRecovery(token)'),
    submitFn,
    verifyFn,
    resetFn,
    signupFn
  ].join('\n');
  vm.createContext(box);
  vm.runInContext(src, box);
  return {calls: calls, box: box, nodes: nodes, toasts: toasts, closed: closed, alerts: alerts, screens: screens, replaced: replaced, nav: nav, timers: timers};
}

function rpcEmail(email){
  return {ok: true, status: 200, raw: JSON.stringify(email)};
}

(async function(){
  const sent = harness({
    user: ' Mossier ',
    email: 'Mo.Aide@Example.com',
    rpc: rpcEmail('mo.aide@example.com')
  });
  await sent.box.verifyReset();
  assert.deepStrictEqual(sent.toasts, ['Check your email for a link to set a new password.']);
  assert.deepStrictEqual(sent.closed, ['resetModal']);
  assert.strictEqual(sent.nodes.reset_new_pass.style.display, 'none', 'email link replaces the in-modal password');
  const resolveCall = sent.calls.filter(function(c){return c.url.indexOf('resolve_username_email') >= 0;})[0];
  const recoverCall = sent.calls.filter(function(c){return c.url.indexOf('/auth/v1/recover') >= 0;})[0];
  assert.ok(resolveCall && recoverCall);
  assert.deepStrictEqual(JSON.parse(resolveCall.init.body), {p_username: 'mossier', p_org_slug: 'evercare'});
  assert.strictEqual(recoverCall.init.method, 'POST');
  assert.deepStrictEqual(JSON.parse(recoverCall.init.body), {email: 'mo.aide@example.com'});
  assert.strictEqual(recoverCall.init.headers.apikey, anonKey);
  assert.strictEqual(recoverCall.init.headers.Authorization, 'Bearer ' + anonKey);
  const redirect = decodeURIComponent(recoverCall.url.split('redirect_to=')[1]);
  assert.strictEqual(redirect, 'https://caregiver.example/index.html');
  assert.ok(redirect.indexOf('localhost') < 0 && redirect.indexOf('127.0.0.1') < 0, 'preview redirect_to stays on that host');

  const sentLive = harness({
    origin: 'https://evercareagency.github.io',
    pathname: '/caregiver/',
    user: 'mossier',
    email: 'mo.aide@example.com',
    rpc: rpcEmail('mo.aide@example.com')
  });
  await sentLive.box.verifyReset();
  const liveRecover = sentLive.calls.filter(function(c){return c.url.indexOf('/auth/v1/recover') >= 0;})[0];
  const liveRedirect = decodeURIComponent(liveRecover.url.split('redirect_to=')[1]);
  assert.strictEqual(liveRedirect, 'https://evercareagency.github.io/caregiver/');
  assert.ok(liveRedirect.indexOf('localhost') < 0, 'LIVE redirect_to is Pages, not localhost');
  assert.strictEqual(sentLive.box.caregiverLoginUrl(), 'https://evercareagency.github.io/caregiver/');

  const pagesIndex = harness({origin: 'https://evercareagency.github.io', pathname: '/caregiver/index.html'});
  assert.strictEqual(pagesIndex.box.caregiverLoginUrl(), 'https://evercareagency.github.io/caregiver/index.html');
  assert.strictEqual(pagesIndex.box.caregiverRecoverRedirect(), 'https://evercareagency.github.io/caregiver/index.html');

  const localLogin = harness({origin: 'http://127.0.0.1:4173', pathname: '/index.html'});
  assert.strictEqual(localLogin.box.caregiverLoginUrl(), 'https://evercareagency.github.io/caregiver/');
  const localhostLogin = harness({origin: 'http://localhost:8080', pathname: '/'});
  assert.strictEqual(localhostLogin.box.caregiverLoginUrl(), 'https://evercareagency.github.io/caregiver/');
  assert.ok(!sent.calls.some(function(c){return c.url.indexOf('script.google.com') >= 0 || c.url === 'https://sheets.example/exec' || (c.body && c.body.action);}));
  assert.ok(!sent.toasts.some(function(t){return t.indexOf('Password reset!') >= 0;}));

  const mismatch = harness({
    user: 'mossier',
    email: 'other@example.com',
    rpc: rpcEmail('moshire21@hotmail.com')
  });
  await mismatch.box.verifyReset();
  assert.deepStrictEqual(mismatch.toasts, ['Check your email for a link to set a new password.']);
  assert.deepStrictEqual(mismatch.closed, ['resetModal']);
  assert.strictEqual(mismatch.nodes.resetErr.textContent, '');
  const mismatchRecover = mismatch.calls.filter(function(c){return c.url.indexOf('/auth/v1/recover') >= 0;})[0];
  assert.ok(mismatchRecover, 'a different typed email still recovers');
  assert.deepStrictEqual(JSON.parse(mismatchRecover.init.body), {email: 'moshire21@hotmail.com'});
  assert.ok(!mismatch.calls.some(function(c){return c.url === 'https://sheets.example/exec' || (c.body && c.body.action === 'verify_reset');}));

  const optionalEmail = harness({
    user: 'mossier',
    email: '',
    rpc: rpcEmail('moshire21@hotmail.com')
  });
  await optionalEmail.box.verifyReset();
  const optionalRecover = optionalEmail.calls.filter(function(c){return c.url.indexOf('/auth/v1/recover') >= 0;})[0];
  assert.ok(optionalRecover, 'an empty email field still recovers');
  assert.deepStrictEqual(JSON.parse(optionalRecover.init.body), {email: 'moshire21@hotmail.com'});

  const unknown = harness({user: 'mossier', email: 'moshire21@hotmail.com', rpc: {ok: true, status: 200, raw: 'null'}});
  await unknown.box.verifyReset();
  assert.strictEqual(unknown.nodes.resetErr.textContent, 'Check the username and try again.');
  assert.deepStrictEqual(unknown.toasts, []);
  assert.ok(!unknown.calls.some(function(c){return c.url.indexOf('/auth/v1/recover') >= 0;}));

  const recoverDown = harness({
    user: 'mossier',
    email: 'mo.aide@example.com',
    rpc: rpcEmail('mo.aide@example.com'),
    recover: {ok: false, status: 500, raw: JSON.stringify({message: 'mailer down'})}
  });
  await recoverDown.box.verifyReset();
  assert.deepStrictEqual(recoverDown.toasts, []);
  assert.deepStrictEqual(recoverDown.closed, []);
  assert.strictEqual(recoverDown.nodes.resetErr.textContent, 'mailer down');

  const sheetsVerify = harness({
    search: '?sheets=1&keep=1',
    storage: {evercare_sheets: '1'},
    user: 'mossier',
    email: 'moshire21@hotmail.com',
    rpc: rpcEmail('moshire21@hotmail.com')
  });
  await sheetsVerify.box.verifyReset();
  const sheetsRecover = sheetsVerify.calls.filter(function(c){return c.url.indexOf('/auth/v1/recover') >= 0;})[0];
  assert.ok(sheetsRecover, 'a stuck sheets flag still sends Auth recover');
  assert.deepStrictEqual(JSON.parse(sheetsRecover.init.body), {email: 'moshire21@hotmail.com'});
  assert.ok(!sheetsVerify.calls.some(function(c){return c.url === 'https://sheets.example/exec' || (c.body && c.body.action === 'verify_reset');}));
  assert.strictEqual(sheetsVerify.box.localStorage.getItem('evercare_sheets'), null);
  assert.ok(sheetsVerify.box.location.search.indexOf('sheets=1') < 0, 'sheets=1 is stripped before the next sign-in');
  assert.ok(sheetsVerify.box.location.search.indexOf('keep=1') >= 0, 'other query params stay');
  assert.strictEqual(sheetsVerify.nodes.reset_new_pass.style.display, 'none');

  const cutSet = harness({user: 'mossier', email: 'mo.aide@example.com', password: 'new-secret'});
  await cutSet.box.doResetPassword();
  assert.deepStrictEqual(cutSet.toasts, []);
  assert.deepStrictEqual(cutSet.closed, []);
  assert.strictEqual(cutSet.calls.length, 0);
  assert.strictEqual(cutSet.nodes.resetErr.textContent, 'Open the link in your email to set a new password.');

  const sheetsReset = harness({
    search: '?sheets=1',
    user: 'mossier',
    password: 'sheets-secret'
  });
  await sheetsReset.box.doResetPassword();
  assert.strictEqual(JSON.stringify(sheetsReset.calls[0].body), JSON.stringify({action: 'reset_password', username: 'mossier', password: 'sheets-secret'}));
  assert.deepStrictEqual(sheetsReset.toasts, ['✅ Password reset! Please log in.']);

  const storedSheets = harness({
    storage: {evercare_sheets: '1'},
    user: 'mossier',
    password: 'sheets-secret',
    sheetsThrow: true
  });
  await storedSheets.box.doResetPassword();
  assert.deepStrictEqual(storedSheets.toasts, ['✅ Password reset! Please log in.']);
  assert.ok(!storedSheets.calls.some(function(c){return String(c.url).indexOf('supabase') >= 0;}));

  const aideId = '22222222-2222-2222-2222-222222222222';
  const userId = '11111111-1111-1111-1111-111111111111';
  const token = 'hdr.' + b64url({sub: userId}) + '.sig';
  const probeSession = JSON.stringify({username:'probeqa', name:'Probe QA Test', loginAt:Date.now(), sbAccessToken:token});
  const landed = harness({
    recoveryPass: 'new-secret',
    recoveryConfirm: 'new-secret',
    storage: {
      cg_session: probeSession,
      evercare_sb_session: JSON.stringify({access_token:token, refresh_token:'r'})
    },
    window: {__sbRecovery: {access_token: token, refresh_token: 'r'}, __sbSession: {access_token: token}},
    aide: {ok: true, status: 200, raw: JSON.stringify([{id: aideId}])},
    patch: {ok: true, status: 204, raw: ''}
  });
  await landed.box.submitRecoveryPassword();
  assert.deepStrictEqual(landed.toasts, []);
  assert.deepStrictEqual(landed.screens, []);
  assert.deepStrictEqual(landed.nav, []);
  assert.strictEqual(landed.nodes.recoveryForm.style.display, 'none');
  assert.strictEqual(landed.nodes.recoveryDone.style.display, 'block');
  assert.strictEqual(landed.nodes.recoveryDoneTitle.textContent, 'Password saved');
  assert.strictEqual(landed.nodes.recoveryOpenPortal.textContent, 'Open Caregiver');
  assert.strictEqual(landed.nodes.recoveryOpenPortal.href, 'https://caregiver.example/index.html');
  assert.strictEqual(landed.nodes.recoveryDoneHint.textContent, 'If you use the app icon on your phone, open it from there after this');
  assert.strictEqual(landed.box.window.__sbRecovery, null);
  assert.strictEqual(landed.box.window.__sbSession, null);
  assert.strictEqual(landed.box.localStorage.getItem('cg_session'), null);
  assert.strictEqual(landed.box.localStorage.getItem('evercare_sb_session'), null);
  assert.strictEqual(landed.box.sessionStorage.getItem('cghome1b_pw_saved'), 'recovery');
  assert.strictEqual(landed.timers.length, 0);
  landed.box.openCaregiverLogin();
  assert.strictEqual(landed.box.sessionStorage.getItem('cghome1b_pw_saved'), null);
  assert.deepStrictEqual(landed.nav, [{op: 'reload'}]);
  const put = landed.calls.filter(function(c){return c.url.indexOf('/auth/v1/user') >= 0;})[0];
  const patch = landed.calls.filter(function(c){return c.init.method === 'PATCH';})[0];
  assert.strictEqual(put.init.method, 'PUT');
  assert.deepStrictEqual(JSON.parse(put.init.body), {password: 'new-secret'});
  assert.strictEqual(put.init.headers.Authorization, 'Bearer ' + token);
  assert.strictEqual(put.init.headers.apikey, anonKey);
  assert.ok(patch.url.indexOf('id=eq.' + aideId) >= 0);
  assert.deepStrictEqual(JSON.parse(patch.init.body), {must_change_password: false});
  assert.strictEqual(patch.init.headers.Authorization, 'Bearer ' + token);
  assert.ok(!landed.calls.some(function(c){return c.url.indexOf('/auth/v1/recover') >= 0 || (c.body && c.body.action === 'reset_password');}));

  const putFails = harness({
    recoveryPass: 'new-secret',
    recoveryConfirm: 'new-secret',
    window: {__sbRecovery: {access_token: token}},
    user: {ok: false, status: 422, raw: JSON.stringify({message: 'Password should be at least 6 characters.'})}
  });
  await putFails.box.submitRecoveryPassword();
  assert.deepStrictEqual(putFails.toasts, []);
  assert.strictEqual(putFails.nodes.recoveryErr.textContent, 'Password should be at least 6 characters.');
  assert.strictEqual(putFails.nodes.recoveryDone.style.display, 'none');
  assert.strictEqual(putFails.nodes.recoveryForm.style.display, '');
  assert.deepStrictEqual(putFails.timers, []);
  assert.ok(!putFails.calls.some(function(c){return c.init.method === 'PATCH';}));
  assert.ok(putFails.box.window.__sbRecovery);

  const patchFails = harness({
    recoveryPass: 'new-secret',
    recoveryConfirm: 'new-secret',
    window: {__sbRecovery: {access_token: token}},
    aide: {ok: true, status: 200, raw: JSON.stringify([{id: aideId}])},
    fetch: function(u, init){
      if(String(u).indexOf('/rest/v1/aides') >= 0 && init.method === 'PATCH')throw new Error('patch down');
      return null;
    }
  });
  await patchFails.box.submitRecoveryPassword();
  assert.deepStrictEqual(patchFails.toasts, [], 'Auth password stands if the flag patch fails');
  assert.strictEqual(patchFails.nodes.recoveryDone.style.display, 'block');
  assert.strictEqual(patchFails.nodes.recoveryOpenPortal.href, 'https://caregiver.example/index.html');
  assert.strictEqual(patchFails.box.window.__sbRecovery, null);

  const delayed = harness({
    search: '?from=email',
    recoveryPass: 'new-secret',
    recoveryConfirm: 'new-secret',
    window: {__sbRecovery: {access_token: token, refresh_token: 'r'}},
    aide: {ok: true, status: 200, raw: JSON.stringify([{id: aideId}])},
    patch: {ok: true, status: 204, raw: ''}
  });
  await delayed.box.submitRecoveryPassword();
  assert.strictEqual(delayed.nodes.recoveryOpenPortal.href, 'https://caregiver.example/index.html');
  assert.strictEqual(delayed.nodes.recoveryDone.style.display, 'block');
  assert.strictEqual(delayed.timers.length, 0);
  delayed.box.openCaregiverLogin();
  assert.deepStrictEqual(delayed.nav, [{op: 'assign', url: 'https://caregiver.example/index.html'}]);

  const pagesSaved = harness({
    origin: 'https://evercareagency.github.io',
    pathname: '/caregiver/',
    recoveryPass: 'new-secret',
    recoveryConfirm: 'new-secret',
    window: {__sbRecovery: {access_token: token, refresh_token: 'r'}},
    aide: {ok: true, status: 200, raw: '[]'}
  });
  await pagesSaved.box.submitRecoveryPassword();
  assert.strictEqual(pagesSaved.nodes.recoveryDoneTitle.textContent, 'Password saved');
  assert.strictEqual(pagesSaved.nodes.recoveryOpenPortal.href, 'https://evercareagency.github.io/caregiver/');
  pagesSaved.box.openCaregiverLogin();
  assert.deepStrictEqual(pagesSaved.nav, [{op: 'reload'}]);

  const localSaved = harness({
    origin: 'http://localhost:8080',
    pathname: '/index.html',
    recoveryPass: 'new-secret',
    recoveryConfirm: 'new-secret',
    window: {__sbRecovery: {access_token: token, refresh_token: 'r'}},
    aide: {ok: true, status: 200, raw: '[]'}
  });
  await localSaved.box.submitRecoveryPassword();
  assert.strictEqual(localSaved.nodes.recoveryOpenPortal.href, 'https://evercareagency.github.io/caregiver/');
  assert.strictEqual(localSaved.timers.length, 0);
  localSaved.box.openCaregiverLogin();
  assert.deepStrictEqual(localSaved.nav, [{op: 'assign', url: 'https://evercareagency.github.io/caregiver/'}]);

  const iosHome = harness({
    origin: 'https://evercareagency.github.io',
    pathname: '/caregiver/',
    search: '?sheets=1',
    recoveryPass: 'new-secret',
    recoveryConfirm: 'new-secret',
    window: {__sbRecovery: {access_token: token, refresh_token: 'r'}, navigator: {standalone: true}},
    aide: {ok: true, status: 200, raw: '[]'}
  });
  await iosHome.box.submitRecoveryPassword();
  assert.strictEqual(iosHome.nodes.recoveryOpenPortal.textContent, 'Open Caregiver');
  assert.strictEqual(iosHome.nodes.recoveryOpenPortal.href, './');
  iosHome.box.openCaregiverLogin();
  assert.deepStrictEqual(iosHome.nav, [{op: 'assign', url: './'}]);

  const iosIndex = harness({
    origin: 'https://evercareagency.github.io',
    pathname: '/caregiver/index.html',
    window: {navigator: {standalone: true}, matchMedia: function(){return {matches: true};}}
  });
  assert.strictEqual(iosIndex.box.caregiverLoginUrl(), 'index.html');
  iosIndex.box.openCaregiverLogin();
  assert.deepStrictEqual(iosIndex.nav, [{op: 'assign', url: 'index.html'}]);

  const taken = harness({hash: '#access_token=' + encodeURIComponent(token) + '&refresh_token=r&type=recovery&expires_in=3600'});
  const session = taken.box.sbTakeRecoverySession();
  assert.strictEqual(session.access_token, token);
  assert.strictEqual(session.refresh_token, 'r');
  assert.strictEqual(taken.replaced[0], '/index.html');
  assert.strictEqual(taken.box.sbTakeRecoverySession(), null);

  const signupCut = harness({
    name: 'Mo Aide',
    user: 'mossier',
    email: 'mo.aide@example.com',
    password: 'secret',
    code: 'ECA2026'
  });
  await signupCut.box.doSignup();
  assert.strictEqual(signupCut.nodes.signupErr.textContent, 'Accounts are created by the office. Contact your manager.');
  assert.strictEqual(signupCut.calls.length, 0, 'cut signup does not post Sheets or Auth');

  const signupSheets = harness({
    search: '?sheets=1',
    name: 'Mo Aide',
    user: 'Mossier',
    email: 'Mo.Aide@Example.com',
    password: 'secret',
    code: 'ECA2026',
    sheetsHttp: {ok: true, status: 200, raw: JSON.stringify({success: true})}
  });
  await signupSheets.box.doSignup();
  assert.strictEqual(signupSheets.calls[0].url, 'https://sheets.example/exec');
  assert.deepStrictEqual(JSON.parse(signupSheets.calls[0].init.body), {
    action: 'signup',
    username: 'mossier',
    password: 'secret',
    name: 'Mo Aide',
    email: 'mo.aide@example.com'
  });
  assert.ok(signupSheets.calls.some(function(c){return c.url === 'session';}));

  const bootRec = harness({hash: '#access_token=' + encodeURIComponent(token) + '&refresh_token=r&type=recovery&expires_in=3600'});
  bootRec.box.restoreCgSession = function(){bootRec.calls.push({url: 'restore'}); return true;};
  bootRec.box.afterLogin = function(){bootRec.calls.push({url: 'home'});};
  bootRec.box.currentUser = {username: 'probeqa', name: 'Probe QA Test', sbAccessToken: token};
  assert.strictEqual(bootRec.box.bootCaregiverPortal(), 'recovery');
  assert.ok(!bootRec.calls.some(function(c){return c.url === 'restore' || c.url === 'home';}), 'recovery boot does not enter home');
  assert.strictEqual(bootRec.nodes.recoveryForm.style.display, '');
  assert.strictEqual(bootRec.nodes.recoveryDone.style.display, 'none');
  assert.strictEqual(bootRec.box.window.__sbRecovery.access_token, token);

  const bootHold = harness({
    storage: {cg_session: probeSession, evercare_sb_session: JSON.stringify({access_token: token})}
  });
  bootHold.box.sessionStorage.setItem('cghome1b_pw_saved', 'recovery');
  bootHold.box.restoreCgSession = function(){bootHold.calls.push({url: 'restore'}); return true;};
  bootHold.box.afterLogin = function(){bootHold.calls.push({url: 'home'});};
  bootHold.box.currentUser = {username: 'probeqa', name: 'Probe QA Test', sbAccessToken: token};
  assert.strictEqual(bootHold.box.bootCaregiverPortal(), 'saved');
  assert.strictEqual(bootHold.nodes.recoveryDone.style.display, 'block');
  assert.strictEqual(bootHold.nodes.recoveryDoneTitle.textContent, 'Password saved');
  assert.strictEqual(bootHold.nodes.recoveryOpenPortal.textContent, 'Open Caregiver');
  assert.strictEqual(bootHold.box.localStorage.getItem('cg_session'), null);
  assert.strictEqual(bootHold.box.currentUser, null);
  assert.ok(!bootHold.calls.some(function(c){return c.url === 'restore' || c.url === 'home';}), 'saved hold does not enter home');

  const bootHome = harness({});
  bootHome.box.currentUser = {username: 'probeqa', name: 'Probe QA Test', sbAccessToken: token};
  bootHome.box.restoreCgSession = function(){return true;};
  bootHome.box.afterLogin = function(){bootHome.calls.push({url: 'home'});};
  assert.strictEqual(bootHome.box.bootCaregiverPortal(), 'home');
  assert.ok(bootHome.calls.some(function(c){return c.url === 'home';}));

  console.log('caregiver-sb-reset checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
