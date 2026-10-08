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

const visAt = html.indexOf("document.addEventListener('visibilitychange',()=>{");
assert.ok(visAt > 0, 'resume listener');
const show = html.slice(visAt, visAt + 280);
assert.ok(show.includes('enforceCgSessionTimeout()'), 'becoming visible checks the session');
const pageAt = html.lastIndexOf("window.addEventListener('pageshow'");
assert.ok(html.slice(pageAt, pageAt + 160).includes('enforceCgSessionTimeout()'), 'pageshow checks the session');
assert.ok(extractFn(html, 'function enforceCgSessionTimeout()').includes('cgRefreshAccessToken()'), 'a visible app refreshes the access token');
assert.ok(html.includes('const CG_SESSION_MS=8*60*60*1000;'), 'the portal session stays 8 hours');

function boot(opts){
  opts = opts || {};
  const calls = [];
  const list = [{id:'ts1', weekStart:'2026-10-04', clientName:'Ada'}];
  const box = {
    calls: calls,
    list: list,
    msgs: [],
    loggedOut: false,
    SUPABASE_URL: 'https://example.supabase.co',
    currentUser: {
      username: 'ada',
      name: 'Ada',
      loginAt: Date.now() - 60 * 60 * 1000,
      expiresAt: Date.now() + 7 * 60 * 60 * 1000,
      sbAccessToken: 'jwt-old',
      sbRefreshToken: 'refresh-1',
      sbExpiresAt: opts.exp,
      sbUserId: '11111111-1111-1111-1111-111111111111',
      sbEmail: 'ada@example.com'
    },
    window: {},
    console: {warn: function(){}},
    Date: Date,
    JSON: JSON,
    Number: Number,
    String: String,
    Object: Object,
    Promise: Promise,
    encodeURIComponent: encodeURIComponent,
    showTempMsg: function(msg){box.msgs.push(String(msg));},
    caregiverLogout: function(){box.loggedOut = true;},
    SUPABASE_ANON_KEY: 'anon-test',
    backfillCgSessionLoginAt: function(sess){return sess || box.currentUser;},
    store: {get: function(){return box.currentUser;}, set: function(){}},
    persistCgSession: function(sess){box.currentUser = sess; return sess;},
    sbPersistAuth: function(){},
    fetch: function(url){
      const rec = {url: String(url)};
      calls.push(rec);
      if(opts.fail === 'throw')return Promise.reject(new Error('Failed to fetch'));
      if(opts.fail === 'key'){
        return Promise.resolve({
          ok: false,
          status: 400,
          text: function(){return Promise.resolve(JSON.stringify({error_description:'No suitable key or wrong key type', message:'No suitable key or wrong key type'}));}
        });
      }
      if(opts.fail === '401'){
        return Promise.resolve({
          ok: false,
          status: 401,
          text: function(){return Promise.resolve(JSON.stringify({message:'Failed to fetch', error:'jwt expired'}));}
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function(){return Promise.resolve(JSON.stringify({access_token:'jwt-new', refresh_token:'refresh-2', expires_in:3600}));}
      });
    }
  };
  const code = [
    'const SUPABASE_URL="https://example.supabase.co";',
    extractFn(html, 'function sbAnonHeaders()'),
    extractFn(html, 'async function sbRead(res)'),
    extractFn(html, 'function sbErrMsg(pack,fallback)'),
    extractFn(html, 'function sbExpiresMs(auth)'),
    extractFn(html, 'function sbJwtSub(token)'),
    extractFn(html, 'function sheetsOffMessage(kind)'),
    extractFn(html, 'function cgWarnRaw(where, err)'),
    extractFn(html, 'function parseLoginAt(sess)'),
    extractFn(html, 'function cgSessionExpiresAt(sess)'),
    extractFn(html, 'function isCgSessionExpired(sess)'),
    extractFn(html, 'async function sbRefreshCaregiverJwt()'),
    extractFn(html, 'async function sbEnsureCaregiverJwt()'),
    extractFn(html, 'async function cgRefreshAccessToken()'),
    extractFn(html, 'function enforceCgSessionTimeout()')
  ].join('\n');
  vm.createContext(box);
  vm.runInContext(code, box);
  box.CG_SESSION_MS = 8 * 60 * 60 * 1000;
  return box;
}

(async function(){
  const soon = boot({exp: Date.now() + 60 * 1000});
  const ok = await soon.cgRefreshAccessToken();
  assert.strictEqual(ok, true, 'a token inside the lead window refreshes');
  assert.ok(soon.calls.some(function(c){return c.url.indexOf('grant_type=refresh_token') >= 0;}), 'refresh uses the refresh grant');
  assert.strictEqual(soon.currentUser.sbAccessToken, 'jwt-new');
  assert.deepStrictEqual(soon.msgs, []);
  assert.strictEqual(soon.loggedOut, false, 'a refresh does not end the 8h session');
  assert.strictEqual(soon.list[0].weekStart, '2026-10-04', 'timesheet data stays on the phone');

  const fresh = boot({exp: Date.now() + 30 * 60 * 1000});
  await fresh.cgRefreshAccessToken();
  assert.strictEqual(fresh.calls.length, 0, 'a token with time left is not refreshed yet');

  const thrown = boot({exp: Date.now() - 1000, fail: 'throw'});
  const thrownOk = await thrown.enforceCgSessionTimeout();
  await new Promise(function(r){setTimeout(r, 20);});
  assert.strictEqual(thrownOk, undefined);
  assert.strictEqual(thrown.loggedOut, false, 'a failed refresh keeps the session data');
  assert.strictEqual(thrown.list.length, 1);
  assert.ok(thrown.msgs.length >= 1, 'the aide is asked to sign in again');
  const toast = thrown.msgs.join(' ');
  assert.ok(toast.indexOf('(216) 377-5991') >= 0, toast);
  assert.ok(toast.indexOf('still on this phone') >= 0, toast);
  assert.ok(toast.indexOf('Failed to fetch') < 0, toast);
  assert.ok(toast.indexOf('No suitable key') < 0, toast);

  const key = boot({exp: Date.now() - 1000, fail: 'key'});
  await key.cgRefreshAccessToken();
  const keyToast = key.msgs.join(' ');
  assert.ok(keyToast.indexOf('(216) 377-5991') >= 0, keyToast);
  assert.ok(keyToast.indexOf('No suitable key or wrong key type') < 0, keyToast);
  assert.strictEqual(key.list[0].id, 'ts1');

  const denied = boot({exp: Date.now() - 1000, fail: '401'});
  await denied.cgRefreshAccessToken();
  const deniedToast = denied.msgs.join(' ');
  assert.ok(deniedToast.indexOf('Please sign in again') >= 0, deniedToast);
  assert.ok(deniedToast.indexOf('Failed to fetch') < 0, deniedToast);
  assert.ok(deniedToast.indexOf('jwt expired') < 0, deniedToast);
  assert.strictEqual(denied.loggedOut, false);

  console.log('caregiver-session-refresh checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
