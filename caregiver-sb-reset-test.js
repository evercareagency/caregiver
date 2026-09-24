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

assert.ok(html.includes('v=sbreset1'), 'reset marker');
assert.ok(!/service_role/i.test(html), 'service_role must not be embedded');

const verifyFn = extractFn(html, 'async function verifyReset()');
const resetFn = extractFn(html, 'async function doResetPassword()');
const signupFn = extractFn(html, 'async function doSignup()');
const setFn = extractFn(html, 'async function resetAidePasswordSupabase(username,email,newPassword)');
const verifyAideFn = extractFn(html, 'async function verifyAideResetSupabase(username,email)');
assert.ok(verifyFn && resetFn && signupFn && setFn && verifyAideFn);

const verifySb = verifyFn.slice(0, verifyFn.indexOf('SHEETS_URL'));
assert.ok(verifySb.includes('evercareSbEnabled()') && verifySb.includes('return'), 'cut verify returns before Sheets');
assert.ok(verifyFn.includes("action:'verify_reset'"), 'sheets rollback still verifies on Sheets');

const resetSb = resetFn.slice(0, resetFn.indexOf("action:'reset_password'"));
assert.ok(resetSb.includes('await resetAidePasswordSupabase(user,email,newpwd)'), 'cut set waits on the Auth helper');
assert.ok(resetSb.indexOf('await resetAidePasswordSupabase') < resetSb.indexOf('Password reset!'), 'success follows the Auth update');
assert.ok(resetSb.includes('return'), 'cut set does not fall through to Sheets');
assert.ok(!resetSb.includes('SHEETS_URL') && !resetSb.includes("action:'reset_password'"), 'cut set does not write Sheets');
assert.ok(resetFn.includes("action:'reset_password'"), 'sheets rollback still resets on Sheets');
assert.ok(!setFn.includes('reset_aide_temp_password'), 'self-service does not call the office temp-password rpc');
assert.ok(!setFn.includes('SHEETS_URL') && !setFn.includes('grant_type=password'), 'set password is the anon rpc, not a password grant');
assert.ok(setFn.includes('/rest/v1/rpc/reset_aide_own_password'), 'set password posts the self-service rpc');
assert.ok(setFn.includes("p_org_slug:'evercare'"), 'org slug matches login');

const signupSb = signupFn.slice(0, signupFn.indexOf('SHEETS_URL'));
assert.ok(signupSb.includes('evercareSbEnabled()') && signupSb.includes('return'), 'cut signup returns before Sheets');
assert.ok(signupSb.includes('Accounts are created by the office. Contact your manager.'), 'cut signup tells the aide to contact the office');
assert.ok(!signupSb.includes('startCgSession'), 'cut signup does not create a session');
assert.ok(signupFn.includes("action:'signup'"), 'sheets rollback still signs up on Sheets');
assert.ok(!signupFn.includes('/rpc/admin_create_aide'), 'caregiver signup does not call the office create rpc');

function storage(initial){
  const mem = Object.assign({}, initial || {});
  return {
    getItem: function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
    setItem: function(k, v){mem[k] = String(v);},
    removeItem: function(k){delete mem[k];}
  };
}

function field(value, display){
  return {value: value == null ? '' : String(value), textContent: '', style: {display: display || ''}};
}

function harness(opts){
  const calls = [];
  const toasts = [];
  const closed = [];
  const alerts = [];
  const nodes = {
    reset_user: field(opts.user),
    reset_email: field(opts.email),
    reset_newpwd: field(opts.password),
    reset_new_pass: field('', 'none'),
    reset_verify_btn: field('', 'flex'),
    resetErr: field('', 'none'),
    s_name: field(opts.name),
    s_user: field(opts.user),
    s_email: field(opts.email),
    s_pass: field(opts.password),
    s_code: field(opts.code),
    signupErr: field('', 'none'),
    signupBtn: {textContent: 'Create Account →', disabled: false, style: {}}
  };
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
    location: {search: opts.search || ''},
    localStorage: storage(opts.storage),
    document: {getElementById: function(id){return nodes[id] || null;}},
    alert: function(msg){alerts.push(msg);},
    closeModal: function(id){closed.push(id);},
    showTempMsg: function(msg){toasts.push(msg);},
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
        else if(u.indexOf('reset_aide_own_password') >= 0)res = opts.reset || {ok: false, status: 404, raw: JSON.stringify({code: 'PGRST202', message: 'Could not find the function public.reset_aide_own_password'})};
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
    extractFn(html, 'async function sbRead(res)'),
    extractFn(html, 'function sbErrMsg(pack,fallback)'),
    extractFn(html, 'async function resolveAideAuthEmail(username)'),
    extractFn(html, 'function aideEmailsMatch(resolved,entered)'),
    extractFn(html, 'async function verifyAideResetSupabase(username,email)'),
    extractFn(html, 'function resetRpcError(pack)'),
    extractFn(html, 'async function resetAidePasswordSupabase(username,email,newPassword)'),
    verifyFn,
    resetFn,
    signupFn
  ].join('\n');
  vm.createContext(box);
  vm.runInContext(src, box);
  return {calls: calls, box: box, nodes: nodes, toasts: toasts, closed: closed, alerts: alerts};
}

function rpcEmail(email){
  return {ok: true, status: 200, raw: JSON.stringify(email)};
}

(async function(){
  const match = harness({
    user: ' Mossier ',
    email: 'Mo.Aide@Example.com',
    rpc: rpcEmail('mo.aide@example.com')
  });
  await match.box.verifyReset();
  assert.strictEqual(match.nodes.reset_new_pass.style.display, 'block', 'matching email opens the new-password step');
  assert.strictEqual(match.nodes.reset_verify_btn.style.display, 'none');
  assert.strictEqual(match.nodes.resetErr.style.display, 'none');
  assert.strictEqual(match.calls.length, 1);
  assert.ok(match.calls[0].url.indexOf('/rest/v1/rpc/resolve_username_email') >= 0);
  assert.deepStrictEqual(JSON.parse(match.calls[0].init.body), {p_username: 'mossier', p_org_slug: 'evercare'});
  assert.ok(!match.calls.some(function(c){return c.url.indexOf('/exec') >= 0 || c.body && c.body.action === 'verify_reset';}));

  const mismatch = harness({
    user: 'mossier',
    email: 'other@example.com',
    rpc: rpcEmail('mo.aide@example.com')
  });
  await mismatch.box.verifyReset();
  assert.strictEqual(mismatch.nodes.reset_new_pass.style.display, 'none');
  assert.strictEqual(mismatch.nodes.resetErr.textContent, 'Username and email do not match.');
  assert.ok(!mismatch.calls.some(function(c){return String(c.url).indexOf('reset_aide') >= 0;}));

  const unknown = harness({user: 'mossier', email: 'mo.aide@example.com', rpc: {ok: true, status: 200, raw: 'null'}});
  await unknown.box.verifyReset();
  assert.strictEqual(unknown.nodes.resetErr.textContent, 'Username and email do not match.');

  const sheetsVerify = harness({
    search: '?sheets=1',
    user: 'mossier',
    email: 'mo.aide@example.com',
    sheetsHttp: {ok: true, status: 200, raw: JSON.stringify({success: true})}
  });
  await sheetsVerify.box.verifyReset();
  assert.strictEqual(sheetsVerify.calls.length, 1);
  assert.strictEqual(sheetsVerify.calls[0].url, 'https://sheets.example/exec');
  assert.deepStrictEqual(JSON.parse(sheetsVerify.calls[0].init.body), {action: 'verify_reset', username: 'mossier', email: 'mo.aide@example.com'});
  assert.strictEqual(sheetsVerify.nodes.reset_new_pass.style.display, 'block');

  const missingRpc = harness({
    user: 'mossier',
    email: 'Mo.Aide@Example.com',
    password: 'new-secret',
    rpc: rpcEmail('mo.aide@example.com')
  });
  await missingRpc.box.doResetPassword();
  assert.deepStrictEqual(missingRpc.toasts, [], 'a missing Auth rpc must not claim success');
  assert.deepStrictEqual(missingRpc.closed, []);
  assert.strictEqual(missingRpc.nodes.resetErr.textContent, 'Could not update the sign-in password. Contact the office.');
  const resetCall = missingRpc.calls.filter(function(c){return String(c.url).indexOf('reset_aide_own_password') >= 0;})[0];
  assert.ok(resetCall, 'set password still attempts the anon rpc');
  assert.deepStrictEqual(JSON.parse(resetCall.init.body), {
    p_username: 'mossier',
    p_email: 'mo.aide@example.com',
    p_new_password: 'new-secret',
    p_org_slug: 'evercare'
  });
  assert.strictEqual(resetCall.init.headers.apikey, anonKey);
  assert.strictEqual(resetCall.init.headers.Authorization, 'Bearer ' + anonKey);
  assert.ok(!missingRpc.calls.some(function(c){return c.body && c.body.action === 'reset_password';}), 'failure does not write Sheets');
  assert.ok(!missingRpc.calls.some(function(c){return String(c.url).indexOf('reset_aide_temp_password') >= 0;}));

  const saved = harness({
    user: 'mossier',
    email: 'mo.aide@example.com',
    password: 'new-secret',
    rpc: rpcEmail('mo.aide@example.com'),
    reset: {ok: true, status: 200, raw: JSON.stringify({ok: true})}
  });
  await saved.box.doResetPassword();
  assert.deepStrictEqual(saved.toasts, ['✅ Password reset! Please log in.']);
  assert.deepStrictEqual(saved.closed, ['resetModal']);
  assert.ok(saved.calls.some(function(c){return String(c.url).indexOf('/rest/v1/rpc/reset_aide_own_password') >= 0;}));
  assert.ok(!saved.calls.some(function(c){return c.body && c.body.action === 'reset_password';}));

  const rejected = harness({
    user: 'mossier',
    email: 'mo.aide@example.com',
    password: 'new-secret',
    rpc: rpcEmail('mo.aide@example.com'),
    reset: {ok: true, status: 200, raw: JSON.stringify({ok: false, error: 'Username and email do not match.'})}
  });
  await rejected.box.doResetPassword();
  assert.deepStrictEqual(rejected.toasts, []);
  assert.strictEqual(rejected.nodes.resetErr.textContent, 'Username and email do not match.');

  const wrongPair = harness({
    user: 'mossier',
    email: 'other@example.com',
    password: 'new-secret',
    rpc: rpcEmail('mo.aide@example.com'),
    reset: {ok: true, status: 200, raw: JSON.stringify({ok: true})}
  });
  await wrongPair.box.doResetPassword();
  assert.deepStrictEqual(wrongPair.toasts, []);
  assert.strictEqual(wrongPair.nodes.resetErr.textContent, 'Username and email do not match.');
  assert.ok(!wrongPair.calls.some(function(c){return String(c.url).indexOf('reset_aide_own_password') >= 0;}), 'mismatch never posts the password rpc');

  const sheetsReset = harness({
    search: '?sheets=1',
    user: 'mossier',
    email: 'mo.aide@example.com',
    password: 'sheets-secret'
  });
  await sheetsReset.box.doResetPassword();
  assert.strictEqual(JSON.stringify(sheetsReset.calls[0].body), JSON.stringify({action: 'reset_password', username: 'mossier', password: 'sheets-secret'}));
  assert.deepStrictEqual(sheetsReset.toasts, ['✅ Password reset! Please log in.']);
  assert.ok(!sheetsReset.calls.some(function(c){return String(c.url).indexOf('supabase') >= 0;}));

  const storedSheets = harness({
    storage: {evercare_sheets: '1'},
    user: 'mossier',
    password: 'sheets-secret',
    sheetsThrow: true
  });
  await storedSheets.box.doResetPassword();
  assert.deepStrictEqual(storedSheets.toasts, ['✅ Password reset! Please log in.'], 'rollback keeps the existing Sheets success toast');
  assert.ok(!storedSheets.calls.some(function(c){return String(c.url).indexOf('supabase') >= 0;}));

  const emptyPwd = harness({user: 'mossier', email: 'a@b.co', password: ''});
  await emptyPwd.box.doResetPassword();
  assert.deepStrictEqual(emptyPwd.alerts, ['Enter new password.']);
  assert.strictEqual(emptyPwd.calls.length, 0);

  const signupCut = harness({
    name: 'Mo Aide',
    user: 'mossier',
    email: 'mo.aide@example.com',
    password: 'secret',
    code: 'ECA2026'
  });
  await signupCut.box.doSignup();
  assert.strictEqual(signupCut.nodes.signupErr.textContent, 'Accounts are created by the office. Contact your manager.');
  assert.strictEqual(signupCut.nodes.signupErr.style.display, 'block');
  assert.strictEqual(signupCut.calls.length, 0, 'cut signup does not post Sheets or Auth');
  assert.strictEqual(signupCut.nodes.signupBtn.disabled, false);

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
  assert.ok(signupSheets.calls.some(function(c){return c.url === 'session';}), 'sheets signup still opens a session');

  const signupBadCode = harness({
    search: '?sheets=1',
    name: 'Mo Aide',
    user: 'mossier',
    email: 'mo.aide@example.com',
    password: 'secret',
    code: 'nope'
  });
  await signupBadCode.box.doSignup();
  assert.strictEqual(signupBadCode.nodes.signupErr.textContent, 'Invalid office code. Contact your manager.');
  assert.strictEqual(signupBadCode.calls.length, 0);

  console.log('caregiver-sb-reset checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
