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

const urlConst = (html.match(/const SUPABASE_URL='([^']+)'/) || [])[1];
const keyConst = (html.match(/const SUPABASE_ANON_KEY='([^']+)'/) || [])[1];
const aidesSelect = 'id,username,full_name,email,must_change_password,is_active,org_id,profile_id';

function b64url(obj){
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

const src = [
  extractFn(html, 'function sbAnonHeaders()'),
  extractFn(html, 'function sbUserHeaders(token)'),
  extractFn(html, 'function sbPersistAuth(session)'),
  extractFn(html, 'function sbClearAuth()'),
  extractFn(html, 'async function sbRead(res)'),
  extractFn(html, 'function sbErrMsg(pack,fallback)'),
  extractFn(html, 'function sbJwtSub(token)'),
  extractFn(html, 'function sbExpiresMs(auth)'),
  extractFn(html, 'function aideEmailNeedsSetup(email)'),
  extractFn(html, 'function sbWorkingEmail(submitted,authEmail,aideEmail)'),
  extractFn(html, 'async function loginAideWithSupabase(username,password)'),
  extractFn(html, 'function aideTruth(v)'),
  'function persistCgSession(sess){ currentUser=sess; globalThis.__saved=sess; return sess; }',
  extractFn(html, 'function clearAideSetupGate()'),
  extractFn(html, 'async function completeAideSetupSupabase(currentPassword,newPassword,email)')
].join('\n');
assert.ok(src.includes('async function loginAideWithSupabase'), 'login helper extracted');
assert.ok(src.includes('async function completeAideSetupSupabase'), 'setup helper extracted');

function storage(){
  const mem = {};
  return {
    getItem: function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;},
    setItem: function(k, v){mem[k] = String(v);},
    removeItem: function(k){delete mem[k];},
    dump: function(){return mem;}
  };
}

function run(opts){
  const calls = [];
  const box = {
    SUPABASE_URL: urlConst,
    SUPABASE_ANON_KEY: keyConst,
    window: {},
    sessionStorage: storage(),
    localStorage: storage(),
    atob: atob,
    JSON: JSON,
    Date: Date,
    Number: Number,
    String: String,
    Error: Error,
    Array: Array,
    Object: Object,
    encodeURIComponent: encodeURIComponent,
    currentUser: opts.currentUser || null,
    fetch: function(url, init){
      calls.push({url: String(url), init: init});
      const u = String(url);
      if(opts.failOn && opts.failOn.test(u))return Promise.reject(new Error('offline'));
      let res = {ok:false, status:500, raw:'{}'};
      if(u.indexOf('/rest/v1/rpc/resolve_username_email') >= 0)res = opts.rpc || {ok:true, status:200, raw:'null'};
      else if(u.indexOf('grant_type=password') >= 0)res = opts.auth || {ok:false, status:400, raw:JSON.stringify({error_description:'Invalid login credentials'})};
      else if(u.indexOf('/rest/v1/aides') >= 0)res = opts.aide || {ok:true, status:200, raw:'[]'};
      else if(u.indexOf('/auth/v1/user') >= 0)res = opts.user || {ok:true, status:200, raw:JSON.stringify({email:'aide.one@example.com'})};
      else if(u.indexOf('/rest/v1/profiles') >= 0)res = opts.profile || {ok:true, status:200, raw:'[]'};
      return Promise.resolve({
        ok: res.ok,
        status: res.status,
        text: function(){return Promise.resolve(res.raw);}
      });
    }
  };
  vm.createContext(box);
  vm.runInContext(src, box);
  return {calls: calls, box: box};
}

const aideId = '22222222-2222-2222-2222-222222222222';
const userId = '11111111-1111-1111-1111-111111111111';
function tokenFor(sub){
  return 'hdr.' + b64url({sub: sub}) + '.sig';
}
function aideRow(extra){
  return Object.assign({
    id: aideId,
    username: 'Aide.One',
    full_name: 'Aide One',
    email: 'aide.one@example.com',
    must_change_password: false,
    is_active: true,
    org_id: '33333333-3333-3333-3333-333333333333',
    profile_id: userId
  }, extra || {});
}
function authOk(extra){
  return {
    ok: true,
    status: 200,
    raw: JSON.stringify(Object.assign({
      access_token: 'jwt-test-token',
      refresh_token: 'refresh-test',
      expires_in: 3600,
      token_type: 'bearer',
      user: {id: userId, email: 'aide.one@example.com'}
    }, extra || {}))
  };
}

(async function(){
  const blank = run({});
  await assert.rejects(function(){return vm.runInContext('loginAideWithSupabase("  ","x")', blank.box);});
  assert.strictEqual(blank.calls.length, 0, 'blank username does not call supabase');

  const noEmail = run({rpc:{ok:true, status:200, raw:'null'}});
  await assert.rejects(function(){return vm.runInContext('loginAideWithSupabase("Missing","pw")', noEmail.box);});
  assert.strictEqual(noEmail.calls.length, 1, 'null email skips the password grant');

  const wrapped = run({rpc:{ok:true, status:200, raw:JSON.stringify({email:'aide.one@example.com'})}});
  await assert.rejects(function(){return vm.runInContext('loginAideWithSupabase("aide.one","pw")', wrapped.box);});
  assert.strictEqual(wrapped.calls.length, 1, 'object rpc body is not an email');

  const badPw = run({
    rpc:{ok:true, status:200, raw:JSON.stringify('aide.one@example.com')},
    auth:{ok:false, status:400, raw:JSON.stringify({error_description:'Invalid login credentials'})}
  });
  await assert.rejects(function(){return vm.runInContext('loginAideWithSupabase(" aide.one ","nope")', badPw.box);});
  assert.strictEqual(badPw.calls.length, 2);
  assert.deepStrictEqual(JSON.parse(badPw.calls[0].init.body), {p_username:'aide.one', p_org_slug:'evercare'});
  assert.ok(!badPw.calls.some(function(c){return c.url.indexOf('/rest/v1/aides') >= 0;}));

  const noRow = run({
    rpc:{ok:true, status:200, raw:JSON.stringify('aide.one@example.com')},
    auth: authOk(),
    aide:{ok:true, status:200, raw:'[]'}
  });
  await assert.rejects(function(){return vm.runInContext('loginAideWithSupabase("aide.one","secret")', noRow.box);});
  assert.strictEqual(noRow.box.window.__sbSession, undefined, 'a missing row does not keep a session');

  const jwtOnly = run({
    rpc:{ok:true, status:200, raw:JSON.stringify('aide.one@example.com')},
    auth:{ok:true, status:200, raw:JSON.stringify({access_token:tokenFor(userId), refresh_token:'r', expires_at:1_800_000_000_000})},
    aide:{ok:true, status:200, raw:JSON.stringify([aideRow({email:'  ', must_change_password:'yes'})])}
  });
  const gated = await vm.runInContext('loginAideWithSupabase("aide.one","secret")', jwtOnly.box);
  assert.strictEqual(gated.sbUserId, userId, 'user id falls back to the jwt sub');
  assert.strictEqual(gated.needsEmail, true, 'blank email still gates setup');
  assert.strictEqual(gated.mustChangePassword, 'yes', 'raw must_change_password is returned for the session gate');
  assert.strictEqual(gated.username, 'aide.one');
  assert.strictEqual(gated.name, 'Aide One');
  const aideCall = jwtOnly.calls.filter(function(c){return c.url.indexOf('/rest/v1/aides') >= 0;})[0];
  assert.ok(aideCall.url.indexOf('profile_id=eq.' + userId) >= 0);
  assert.ok(aideCall.url.indexOf('is_active=eq.true') >= 0);
  assert.ok(decodeURIComponent(aideCall.url).indexOf(aidesSelect) >= 0);
  assert.strictEqual(aideCall.init.headers.Authorization, 'Bearer ' + tokenFor(userId));
  assert.strictEqual(jwtOnly.box.window.__sbSession.access_token, tokenFor(userId));
  assert.ok(jwtOnly.box.sessionStorage.dump().evercare_sb_session.includes(tokenFor(userId)));

  const open = run({
    rpc:{ok:true, status:200, raw:JSON.stringify('aide.one@example.com')},
    auth: authOk(),
    aide:{ok:true, status:200, raw:JSON.stringify([aideRow()])}
  });
  const ready = await vm.runInContext('loginAideWithSupabase("aide.one","secret")', open.box);
  assert.strictEqual(ready.needsEmail, false);
  assert.strictEqual(ready.mustChangePassword, false);
  assert.strictEqual(ready.sbEmail, 'aide.one@example.com');
  assert.ok(ready.sbExpiresAt > Date.now(), 'expires_in becomes a timestamp');

  const setupBox = run({
    currentUser:{
      username:'aide.one',
      name:'Aide One',
      email:'',
      mustChangePassword:true,
      needsEmail:true,
      sbAccessToken:'old-token',
      sbRefreshToken:'old-refresh',
      sbUserId:userId,
      sbAideId:aideId,
      sbEmail:'aide.one@example.com'
    },
    auth: authOk({access_token:'fresh-token'}),
    user:{ok:true, status:200, raw:JSON.stringify({email:'aide.one@example.com'})},
    aide:{ok:true, status:200, raw:JSON.stringify([aideRow({must_change_password:false, email:'aide.one@example.com'})])}
  });
  await vm.runInContext('completeAideSetupSupabase("temp-pw","new-pw","real.aide@example.com")', setupBox.box);
  const put = setupBox.calls.filter(function(c){return c.url.indexOf('/auth/v1/user') >= 0;})[0];
  const patch = setupBox.calls.filter(function(c){return c.init.method === 'PATCH' && c.url.indexOf('/rest/v1/aides') >= 0;})[0];
  assert.deepStrictEqual(JSON.parse(put.init.body), {password:'new-pw'}, 'a different email is not sent to Auth while autoconfirm is off');
  assert.strictEqual(JSON.parse(patch.init.body).must_change_password, false);
  assert.strictEqual(JSON.parse(patch.init.body).email, 'aide.one@example.com', 'login email stays the Auth address');
  assert.ok(patch.url.indexOf('id=eq.' + aideId) >= 0);
  assert.strictEqual(patch.init.headers.Authorization, 'Bearer fresh-token');
  assert.strictEqual(setupBox.box.currentUser.mustChangePassword, false);
  assert.strictEqual(setupBox.box.currentUser.needsEmail, false);
  assert.strictEqual(setupBox.box.currentUser.sbAccessToken, 'fresh-token');

  const same = run({
    currentUser:{
      username:'aide.one',
      email:'aide.one@example.com',
      sbAccessToken:'old-token',
      sbUserId:userId,
      sbAideId:aideId,
      sbEmail:'aide.one@example.com'
    },
    auth: authOk(),
    user:{ok:true, status:200, raw:JSON.stringify({email:'aide.one@example.com'})},
    aide:{ok:true, status:200, raw:JSON.stringify([aideRow({must_change_password:false})])}
  });
  await vm.runInContext('completeAideSetupSupabase("temp-pw","new-pw","Aide.One@example.com")', same.box);
  const samePut = same.calls.filter(function(c){return c.url.indexOf('/auth/v1/user') >= 0;})[0];
  assert.deepStrictEqual(JSON.parse(samePut.init.body), {password:'new-pw', email:'Aide.One@example.com'});

  const wrong = run({
    currentUser:{username:'aide.one', sbAccessToken:'t', sbEmail:'aide.one@example.com', sbUserId:userId},
    auth:{ok:false, status:400, raw:JSON.stringify({error_description:'Invalid login credentials'})}
  });
  await assert.rejects(
    function(){return vm.runInContext('completeAideSetupSupabase("nope","new-pw","aide.one@example.com")', wrong.box);},
    /Current password is incorrect/
  );
  assert.ok(!wrong.calls.some(function(c){return c.url.indexOf('/auth/v1/user') >= 0;}));

  console.log('caregiver-sb-auth static checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
