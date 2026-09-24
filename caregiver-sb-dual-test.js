#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const anonFile = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplYWxrcHR3Z2lmbmtia3VhdnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMDExMTAsImV4cCI6MjEwNTc3NzExMH0.b-3Pdb_oVR3L6JM0yd_aQcqtQH8exGV7OPwdtx0b3Xg';

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

assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-sb-auth-login">'), 'caregiver-build meta');
assert.ok(html.includes("const SUPABASE_URL='https://zealkptwgifnkbkuavvp.supabase.co';"), 'supabase url');
assert.ok(!html.includes('lvaglmztnlnsrhlluayz'), 'abandoned project ref must not appear');
assert.ok(!/service_role/i.test(html), 'service_role must not be embedded');
assert.ok(!html.includes('roles.evercare.local'), 'admin role-email mapping must not be used');
assert.ok(html.includes(anonFile), 'anon key must be the attached legacy jwt');
assert.strictEqual(anonFile.length, 208);

const urlConst = (html.match(/const SUPABASE_URL='([^']+)'/) || [])[1];
const keyConst = (html.match(/const SUPABASE_ANON_KEY='([^']+)'/) || [])[1];
assert.strictEqual(keyConst, anonFile);
const payload = JSON.parse(Buffer.from(keyConst.split('.')[1], 'base64').toString());
assert.strictEqual(payload.role, 'anon');
assert.strictEqual(payload.ref, 'zealkptwgifnkbkuavvp');

const warm = extractFn(html, 'function warmUpSheets()');
assert.ok(warm && !/supabase/i.test(warm), 'warm path must not touch supabase');
const afterLogin = extractFn(html, 'function afterLogin(opts)');
assert.ok(afterLogin && !/supabase/i.test(afterLogin) && !afterLogin.includes('softSbDualVerify'), 'home path must not call supabase');
const schedule = extractFn(html, 'function scheduleHomeBackgroundLoads()');
assert.ok(schedule && !/supabase/i.test(schedule), 'background lists must not touch supabase');
const setup = extractFn(html, 'async function submitAideSetup()');
assert.ok(setup && !setup.includes('softSbDualVerify'), 'aide setup must not dual-verify');

const soft = extractFn(html, 'function softSbDualVerify(username,password)');
assert.ok(soft, 'softSbDualVerify missing');
assert.ok(/if\(!evercareSbEnabled\(\)\)return/.test(soft), 'flag off returns before the network');
assert.ok(soft.indexOf('if(!evercareSbEnabled())return') < soft.indexOf('fetch('), 'guard precedes fetch');
assert.ok(soft.includes("SUPABASE_URL+'/rest/v1/rpc/resolve_username_email'"), 'rpc endpoint');
assert.ok(soft.includes("SUPABASE_URL+'/auth/v1/token?grant_type=password'"), 'token endpoint');
assert.ok(/apikey:SUPABASE_ANON_KEY/.test(soft), 'apikey header');
assert.ok(/Authorization:'Bearer '\+SUPABASE_ANON_KEY/.test(soft), 'bearer anon');
assert.ok(/'Content-Type':'application\/json'/.test(soft), 'json content type');
assert.ok(/JSON\.stringify\(\{p_username:user,p_org_slug:'evercare'\}\)/.test(soft), 'rpc body');
assert.ok(/JSON\.stringify\(\{email:email,password:password\}\)/.test(soft), 'email and password body');
assert.ok(/window\.__sbDual=\{ok:true,email:email,rpcEmail:email\}/.test(soft), 'probe ok');
assert.ok(/window\.__sbDual=\{ok:false,error:/.test(soft), 'probe error');
assert.ok(/rpcEmail:null/.test(soft), 'null rpc email is recorded');
assert.ok(!/access_token/.test(soft.replace('authData.access_token', '')), 'probe must not store the access token');
assert.strictEqual((html.match(/\/auth\/v1\/token\?grant_type=password/g) || []).length, 3, 'soft probe, real login, and setup recheck');
assert.strictEqual((html.match(/resolve_username_email/g) || []).length, 3, 'rpc name stays on the probe comment plus probe and real login');
assert.ok(soft.indexOf('/rest/v1/rpc/resolve_username_email') < soft.indexOf('/auth/v1/token?grant_type=password'), 'rpc runs before auth');

const login = extractFn(html, 'async function doLogin()');
assert.ok(login.includes("action:'login'"), 'sheets login stays');
assert.ok(login.indexOf('await loginAideWithSupabase(user,pass)') < login.indexOf("action:'login'"), 'flag-on auth runs instead of sheets login');
const sheetsBranch = login.slice(login.indexOf("action:'login'"));
const softAt = sheetsBranch.indexOf('softSbDualVerify(user,pass)');
const sessionAt = sheetsBranch.indexOf('startCgSession(');
const homeAt = sheetsBranch.indexOf('afterLogin({freshLogin:true})');
assert.ok(softAt >= 0 && sessionAt > softAt && homeAt > sessionAt, 'flag off still soft-verifies after sheets success and then opens home');
assert.ok(sheetsBranch.includes('data.mustChangePassword') && sheetsBranch.includes('data.needsEmail'), 'sheets login still captures setup flags');
assert.ok(!/await\s+softSbDualVerify/.test(login), 'soft verify must not be awaited');
assert.strictEqual((login.match(/softSbDualVerify/g) || []).length, 1, 'only the sheets success path dual-verifies');
assert.ok(!login.includes('data.email,pass') && !login.includes('softSbDualVerify(data'), 'do not map sheets email or admin roles');

function runSoft(opts){
  const calls = [];
  const mem = Object.assign({}, opts.storage || {});
  const box = {
    SUPABASE_URL: urlConst,
    SUPABASE_ANON_KEY: keyConst,
    location: {search: opts.search || ''},
    localStorage: {
      getItem: function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;}
    },
    window: {},
    fetch: function(url, init){
      calls.push({url: url, init: init});
      const isRpc = String(url).indexOf('/rest/v1/rpc/resolve_username_email') >= 0;
      if(isRpc && opts.rpcReject)return Promise.reject(opts.rpcReject);
      if(!isRpc && opts.authReject)return Promise.reject(opts.authReject);
      if(opts.reject)return Promise.reject(opts.reject);
      const res = isRpc
        ? (opts.rpc || {ok:true, status:200, raw:'null'})
        : (opts.auth || {ok:false, status:400, raw: JSON.stringify({error:'invalid_grant', error_description:'Invalid login credentials'})});
      return Promise.resolve({
        ok: res.ok,
        status: res.status,
        text: function(){return Promise.resolve(res.raw);}
      });
    },
    JSON: JSON,
    String: String,
    Promise: Promise
  };
  vm.createContext(box);
  vm.runInContext([
    extractFn(html, 'function evercareSbEnabled()'),
    soft
  ].join('\n'), box);
  let threw = null;
  try{
    vm.runInContext('softSbDualVerify(' + JSON.stringify(opts.username) + ',' + JSON.stringify(opts.password) + ')', box);
  }catch(e){threw = e;}
  return {calls: calls, win: box.window, threw: threw, dual: function(){return box.window.__sbDual;}};
}

const off = runSoft({username:'Aide.One', password:'pw'});
assert.strictEqual(off.calls.length, 0, 'flag off makes zero supabase calls');
assert.strictEqual(off.dual(), undefined);
assert.strictEqual(off.threw, null);

const queryOn = runSoft({username:' Aide.One ', password:'aide-pw', search:'?sb=1'});
assert.strictEqual(queryOn.calls.length, 1, 'rpc only until it resolves');
assert.strictEqual(queryOn.calls[0].url, urlConst + '/rest/v1/rpc/resolve_username_email');
assert.strictEqual(queryOn.calls[0].init.method, 'POST');
assert.strictEqual(queryOn.calls[0].init.headers.apikey, keyConst);
assert.strictEqual(queryOn.calls[0].init.headers.Authorization, 'Bearer ' + keyConst);
assert.strictEqual(queryOn.calls[0].init.headers['Content-Type'], 'application/json');
assert.deepStrictEqual(JSON.parse(queryOn.calls[0].init.body), {p_username:'aide.one', p_org_slug:'evercare'});
assert.ok(!JSON.parse(queryOn.calls[0].init.body).password, 'rpc body has no password');

const stored = runSoft({username:'nurse', password:'n', storage:{evercare_sb:'1'}});
assert.strictEqual(stored.calls.length, 1);
assert.deepStrictEqual(JSON.parse(stored.calls[0].init.body), {p_username:'nurse', p_org_slug:'evercare'});

const bothOffish = runSoft({username:'Admin', password:'x', search:'?sb=0', storage:{evercare_sb:'0'}});
assert.strictEqual(bothOffish.calls.length, 0, 'sb=0 and evercare_sb=0 stay off');

const blank = runSoft({username:'  ', password:'x', search:'?v=1&sb=1'});
assert.strictEqual(blank.calls.length, 0, 'blank username does not call supabase');
assert.strictEqual(blank.dual().ok, false);
assert.ok(blank.dual().error);

function settle(){
  return new Promise(function(resolve){setTimeout(resolve, 40);});
}

settle().then(function(){
  const email = 'aide.one@example.com';
  const ok = runSoft({
    username:'aide.one',
    password:'secret',
    search:'?sb=1&x=2',
    rpc:{ok:true, status:200, raw: JSON.stringify(email)},
    auth:{ok:true, status:200, raw: JSON.stringify({access_token:'secret-token', user:{id:'1'}})}
  });
  const badAuth = runSoft({
    username:'aide.one',
    password:'nope',
    storage:{evercare_sb:'1'},
    rpc:{ok:true, status:200, raw: JSON.stringify(email)},
    auth:{ok:false, status:400, raw: JSON.stringify({error:'invalid_grant', error_description:'Invalid login credentials'})}
  });
  const noEmail = runSoft({
    username:'missing',
    password:'x',
    search:'?sb=1',
    rpc:{ok:true, status:200, raw:'null'}
  });
  const wrapped = runSoft({
    username:'aide.one',
    password:'x',
    search:'?sb=1',
    rpc:{ok:true, status:200, raw: JSON.stringify({email: email})}
  });
  const rpcDown = runSoft({
    username:'aide.one',
    password:'x',
    search:'?sb=1',
    rpc:{ok:false, status:500, raw:'<html>nope</html>'}
  });
  const rpcBoom = runSoft({username:'aide.one', password:'x', search:'?sb=1', rpcReject: new Error('offline')});
  const authBoom = runSoft({
    username:'aide.one',
    password:'x',
    search:'?sb=1',
    rpc:{ok:true, status:200, raw: JSON.stringify(email)},
    authReject: new Error('auth down')
  });
  return settle().then(function(){
    return {ok: ok, badAuth: badAuth, noEmail: noEmail, wrapped: wrapped, rpcDown: rpcDown, rpcBoom: rpcBoom, authBoom: authBoom, email: email};
  });
}).then(function(r){
  assert.strictEqual(r.ok.calls.length, 2, 'email string continues to password grant');
  assert.strictEqual(r.ok.calls[1].url, urlConst + '/auth/v1/token?grant_type=password');
  assert.strictEqual(r.ok.calls[1].init.method, 'POST');
  assert.strictEqual(r.ok.calls[1].init.headers.apikey, keyConst);
  assert.strictEqual(r.ok.calls[1].init.headers.Authorization, 'Bearer ' + keyConst);
  assert.deepStrictEqual(JSON.parse(r.ok.calls[1].init.body), {email: r.email, password:'secret'});
  assert.strictEqual(r.ok.dual().ok, true);
  assert.strictEqual(r.ok.dual().email, r.email);
  assert.strictEqual(r.ok.dual().rpcEmail, r.email);
  assert.strictEqual(r.ok.dual().error, undefined);
  assert.ok(!JSON.stringify(r.ok.dual()).includes('secret-token'), 'access token stays out of the probe');
  assert.strictEqual(r.ok.threw, null);

  assert.strictEqual(r.badAuth.dual().ok, false);
  assert.strictEqual(r.badAuth.dual().email, r.email);
  assert.strictEqual(r.badAuth.dual().rpcEmail, r.email);
  assert.strictEqual(r.badAuth.dual().error, 'Invalid login credentials');
  assert.strictEqual(r.badAuth.threw, null, 'invalid grant must not throw');

  assert.strictEqual(r.noEmail.calls.length, 1, 'null email skips auth');
  assert.strictEqual(r.noEmail.dual().ok, false);
  assert.strictEqual(r.noEmail.dual().rpcEmail, null);
  assert.strictEqual(r.noEmail.dual().error, 'no email');
  assert.strictEqual(r.noEmail.threw, null);

  assert.strictEqual(r.wrapped.calls.length, 1, 'object wrapper is not an email');
  assert.strictEqual(r.wrapped.dual().ok, false);
  assert.strictEqual(r.wrapped.dual().error, 'unexpected rpc body');

  assert.strictEqual(r.rpcDown.calls.length, 1);
  assert.strictEqual(r.rpcDown.dual().ok, false);
  assert.strictEqual(r.rpcDown.dual().error, 'HTTP 500');
  assert.strictEqual(r.rpcDown.threw, null);

  assert.strictEqual(r.rpcBoom.dual().ok, false);
  assert.strictEqual(r.rpcBoom.dual().error, 'offline');
  assert.strictEqual(r.rpcBoom.threw, null, 'rpc failure must not throw');

  assert.strictEqual(r.authBoom.calls.length, 2);
  assert.strictEqual(r.authBoom.dual().ok, false);
  assert.strictEqual(r.authBoom.dual().error, 'auth down');
  assert.strictEqual(r.authBoom.dual().email, r.email);
  assert.strictEqual(r.authBoom.dual().rpcEmail, r.email);
  assert.strictEqual(r.authBoom.threw, null, 'auth failure must not throw');
  console.log('caregiver-sb-dual static checks ok');
  return runBrowser();
}).catch(function(err){
  console.error(err);
  process.exit(1);
});

async function runBrowser(){
  if(process.env.SKIP_BROWSER==='1')return;
  let puppeteer;
  try{puppeteer=require('puppeteer-core');}
  catch(e){puppeteer=require('/tmp/cgtest/node_modules/puppeteer-core');}
  const browser=await puppeteer.launch({
    executablePath:process.env.CHROME_PATH||'/usr/local/bin/google-chrome',
    headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']
  });
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});
  let sheetsLogin={success:true,name:'Test Aide',mustChangePassword:false,needsEmail:false,email:'sheets@example.com'};
  let rpcMode='null';
  let authMode='bad';
  let aideMode='ok';
  let holdSb=null;
  const sbCalls=[];
  const sheetsActions=[];
  await page.setRequestInterception(true);
  page.on('request',function(req){
    const u=req.url();
    if(/fonts\.googleapis|fonts\.gstatic|gstatic\.com/.test(u)){req.abort();return;}
    if(/script\.google\.com/.test(u)){
      let body={};
      try{body=JSON.parse(req.postData()||'{}');}catch(e){}
      const action=body.action||(req.method()==='GET'?'GET':'');
      sheetsActions.push(action);
      const payload=action==='login'?sheetsLogin:{success:true,ok:true,data:[]};
      req.respond({
        status:200,
        contentType:'application/json',
        headers:{'Access-Control-Allow-Origin':'*'},
        body:JSON.stringify(payload)
      });
      return;
    }
    if(/zealkptwgifnkbkuavvp\.supabase\.co/.test(u)){
      const cors={
        'Access-Control-Allow-Origin':'*',
        'Access-Control-Allow-Headers':'apikey,authorization,content-type,prefer',
        'Access-Control-Allow-Methods':'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'
      };
      if(req.method()==='OPTIONS'){
        req.respond({status:200,headers:cors,body:''});
        return;
      }
      const headers=req.headers();
      sbCalls.push({url:u,method:req.method(),body:req.postData()||'',apikey:headers.apikey||'',authorization:headers.authorization||''});
      const respond=function(){
        if(/resolve_username_email/.test(u)){
          if(rpcMode==='boom'){
            req.respond({status:500,contentType:'text/html',headers:cors,body:'<html>nope</html>'});
          }else if(rpcMode==='email'){
            req.respond({status:200,contentType:'application/json',headers:cors,body:JSON.stringify('aide.one@example.com')});
          }else{
            req.respond({status:200,contentType:'application/json',headers:cors,body:'null'});
          }
          return;
        }
        if(/grant_type=password/.test(u)){
          if(authMode==='ok'){
            req.respond({
              status:200,
              contentType:'application/json',
              headers:cors,
              body:JSON.stringify({
                access_token:'jwt-test-token',
                refresh_token:'refresh-test',
                expires_in:3600,
                token_type:'bearer',
                user:{id:'11111111-1111-1111-1111-111111111111',email:'aide.one@example.com'}
              })
            });
          }else{
            req.respond({
              status:400,
              contentType:'application/json',
              headers:cors,
              body:JSON.stringify({error:'invalid_grant',error_description:'Invalid login credentials'})
            });
          }
          return;
        }
        if(/\/auth\/v1\/user/.test(u)){
          let posted={};
          try{posted=JSON.parse(req.postData()||'{}');}catch(e){}
          req.respond({
            status:200,
            contentType:'application/json',
            headers:cors,
            body:JSON.stringify({id:'11111111-1111-1111-1111-111111111111',email:posted.email||'aide.one@example.com'})
          });
          return;
        }
        if(/\/rest\/v1\/aides/.test(u)){
          if(req.method()==='PATCH'){
            let posted={};
            try{posted=JSON.parse(req.postData()||'{}');}catch(e){}
            req.respond({
              status:200,
              contentType:'application/json',
              headers:cors,
              body:JSON.stringify([Object.assign({
                id:'22222222-2222-2222-2222-222222222222',
                username:'aide.one',
                full_name:'Test Aide',
                email:'aide.one@example.com',
                must_change_password:false,
                is_active:true,
                profile_id:'11111111-1111-1111-1111-111111111111'
              },posted)])
            });
            return;
          }
          let row=null;
          if(aideMode==='ok'){
            row={
              id:'22222222-2222-2222-2222-222222222222',
              username:'aide.one',
              full_name:'Test Aide',
              email:'aide.one@example.com',
              must_change_password:false,
              is_active:true,
              org_id:'33333333-3333-3333-3333-333333333333',
              profile_id:'11111111-1111-1111-1111-111111111111'
            };
          }else if(aideMode==='must'){
            row={
              id:'22222222-2222-2222-2222-222222222222',
              username:'aide.one',
              full_name:'New Aide',
              email:'',
              must_change_password:true,
              is_active:true,
              org_id:'33333333-3333-3333-3333-333333333333',
              profile_id:'11111111-1111-1111-1111-111111111111'
            };
          }else if(aideMode==='noemail'){
            row={
              id:'22222222-2222-2222-2222-222222222222',
              username:'aide.one',
              full_name:'No Email',
              email:null,
              must_change_password:false,
              is_active:true,
              org_id:'33333333-3333-3333-3333-333333333333',
              profile_id:'11111111-1111-1111-1111-111111111111'
            };
          }
          req.respond({
            status:200,
            contentType:'application/json',
            headers:cors,
            body:row?JSON.stringify([row]):'[]'
          });
          return;
        }
        if(/\/rest\/v1\/profiles/.test(u)){
          req.respond({status:200,contentType:'application/json',headers:cors,body:'[]'});
          return;
        }
        req.abort();
      };
      const gate=holdSb;
      if(gate)gate.then(respond);
      else respond();
      return;
    }
    req.continue();
  });

  const base=(process.env.CG_URL||'http://127.0.0.1:8765/index.html').replace(/\?.*$/,'');

  async function openFresh(href){
    sbCalls.length=0;
    sheetsActions.length=0;
    await page.goto(href,{waitUntil:'domcontentloaded',timeout:20000});
    await page.evaluate(function(){
      localStorage.removeItem('cg_session');
      sessionStorage.removeItem('cg_session');
      localStorage.removeItem('evercare_sb');
    });
    sbCalls.length=0;
    sheetsActions.length=0;
    await page.reload({waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForSelector('#l_user',{timeout:5000});
  }

  async function signIn(){
    await page.$eval('#l_user',function(el){el.value='Aide.One';});
    await page.$eval('#l_pass',function(el){el.value='secret';});
    await page.click('#loginBtn');
  }

  sheetsLogin={success:true,name:'Test Aide',mustChangePassword:false,needsEmail:false,email:'sheets@example.com'};
  rpcMode='email';
  holdSb=null;
  await openFresh(base);
  assert.strictEqual(sbCalls.length,0,'opening the app with the flag off makes no supabase call');
  assert.ok(sheetsActions.indexOf('ping')>=0,'warm /exec ping still runs');
  await signIn();
  await page.waitForFunction(function(){return document.getElementById('caregiverScreen').classList.contains('active');},{timeout:5000});
  await new Promise(function(r){setTimeout(r,350);});
  assert.strictEqual(sbCalls.length,0,'flag off stays at zero supabase calls after a successful sheets login');
  assert.ok(sheetsActions.indexOf('login')>=0,'sheets login still runs');

  rpcMode='email';
  authMode='ok';
  aideMode='ok';
  let releaseSb=null;
  holdSb=new Promise(function(resolve){releaseSb=resolve;});
  await openFresh(base+'?sb=1');
  assert.strictEqual(sbCalls.length,0,'?sb=1 does not call supabase before sign-in');
  assert.ok(sheetsActions.indexOf('ping')>=0,'warm /exec ping still runs with the flag on');
  await signIn();
  await new Promise(function(r){setTimeout(r,250);});
  const held=await page.evaluate(function(){
    return {
      auth:document.getElementById('authScreen').classList.contains('active'),
      home:document.getElementById('caregiverScreen').classList.contains('active')
    };
  });
  assert.strictEqual(held.auth,true,'home waits for supabase auth');
  assert.strictEqual(held.home,false,'flag on does not enter on the sheets login');
  assert.ok(sbCalls.some(function(c){return c.url.indexOf('resolve_username_email')>=0;}),'rpc starts immediately');
  assert.ok(!sbCalls.some(function(c){return c.url.indexOf('grant_type=password')>=0;}),'auth has not run while the rpc is held');
  assert.ok(sheetsActions.indexOf('login')<0,'flag on skips /exec login');
  releaseSb();
  holdSb=null;
  await page.waitForFunction(function(){return document.getElementById('caregiverScreen').classList.contains('active');},{timeout:5000});
  const rpc=sbCalls.filter(function(c){return c.url.indexOf('resolve_username_email')>=0;})[0];
  const auth=sbCalls.filter(function(c){return c.url.indexOf('grant_type=password')>=0;})[0];
  const aideCall=sbCalls.filter(function(c){return c.url.indexOf('/rest/v1/aides')>=0;})[0];
  assert.ok(rpc&&auth&&aideCall,'email from rpc continues to the password grant and the aides row');
  assert.strictEqual(rpc.method,'POST');
  assert.strictEqual(rpc.apikey,anonFile);
  assert.strictEqual(rpc.authorization,'Bearer '+anonFile);
  assert.deepStrictEqual(JSON.parse(rpc.body),{p_username:'aide.one',p_org_slug:'evercare'});
  assert.deepStrictEqual(JSON.parse(auth.body),{email:'aide.one@example.com',password:'secret'});
  assert.strictEqual(auth.apikey,anonFile);
  assert.strictEqual(aideCall.method,'GET');
  assert.ok(aideCall.url.indexOf('profile_id=eq.11111111-1111-1111-1111-111111111111')>=0,'aides select is the signed-in user');
  assert.ok(aideCall.url.indexOf('is_active=eq.true')>=0,'inactive aides are excluded');
  assert.ok(aideCall.url.indexOf('must_change_password')>=0,'setup flag is loaded with the row');
  assert.strictEqual(aideCall.authorization,'Bearer jwt-test-token');
  assert.ok(!/secret/.test(aideCall.url+aideCall.body),'aides request does not carry the password');
  const sess=await page.evaluate(function(){return JSON.parse(localStorage.getItem('cg_session')||'null');});
  assert.strictEqual(sess.sbAccessToken,'jwt-test-token');
  assert.strictEqual(sess.username,'aide.one');
  assert.strictEqual(sess.name,'Test Aide');
  assert.strictEqual(sess.mustChangePassword,false);
  assert.strictEqual(sess.needsEmail,false);
  assert.ok(!JSON.stringify(sess).includes('secret'),'session does not keep the password');
  const live=await page.evaluate(function(){return window.__sbSession&&window.__sbSession.access_token;});
  assert.strictEqual(live,'jwt-test-token');

  rpcMode='null';
  authMode='ok';
  aideMode='ok';
  holdSb=null;
  await openFresh(base+'?v=1&sb=1');
  await signIn();
  await page.waitForFunction(function(){return document.getElementById('loginErr').style.display==='block';},{timeout:5000});
  const noEmail=await page.evaluate(function(){
    return {
      auth:document.getElementById('authScreen').classList.contains('active'),
      home:document.getElementById('caregiverScreen').classList.contains('active')
    };
  });
  assert.strictEqual(noEmail.auth,true);
  assert.strictEqual(noEmail.home,false);
  assert.ok(!sbCalls.some(function(c){return c.url.indexOf('grant_type=password')>=0;}),'null rpc email skips auth');
  assert.ok(sheetsActions.indexOf('login')<0,'null email does not fall through to sheets');

  rpcMode='boom';
  await openFresh(base+'?sb=1');
  await signIn();
  await page.waitForFunction(function(){return document.getElementById('loginErr').style.display==='block';},{timeout:5000});
  const rpcDown=await page.evaluate(function(){
    return document.getElementById('caregiverScreen').classList.contains('active');
  });
  assert.strictEqual(rpcDown,false);
  assert.ok(!sbCalls.some(function(c){return c.url.indexOf('grant_type=password')>=0;}),'rpc failure skips auth');

  rpcMode='email';
  authMode='bad';
  await openFresh(base+'?sb=1');
  await signIn();
  await page.waitForFunction(function(){return document.getElementById('loginErr').style.display==='block';},{timeout:5000});
  const badPw=await page.evaluate(function(){
    return {
      auth:document.getElementById('authScreen').classList.contains('active'),
      home:document.getElementById('caregiverScreen').classList.contains('active'),
      token:localStorage.getItem('cg_session')
    };
  });
  assert.strictEqual(badPw.auth,true);
  assert.strictEqual(badPw.home,false);
  assert.strictEqual(badPw.token,null);
  assert.ok(sbCalls.some(function(c){return c.url.indexOf('grant_type=password')>=0;}));
  assert.ok(!sbCalls.some(function(c){return c.url.indexOf('/rest/v1/aides')>=0;}),'bad password does not load aides');

  await page.goto(base,{waitUntil:'domcontentloaded',timeout:20000});
  await page.evaluate(function(){
    localStorage.setItem('evercare_sb','1');
    localStorage.removeItem('cg_session');
    sessionStorage.removeItem('cg_session');
    localStorage.removeItem('evercare_sb_session');
    sessionStorage.removeItem('evercare_sb_session');
  });
  rpcMode='email';
  authMode='ok';
  aideMode='ok';
  sbCalls.length=0;
  sheetsActions.length=0;
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForSelector('#l_user',{timeout:5000});
  assert.strictEqual(sbCalls.length,0,'stored flag does not call supabase before sign-in');
  await page.$eval('#l_user',function(el){el.value='keep';});
  await page.$eval('#l_pass',function(el){el.value='pw';});
  await page.click('#loginBtn');
  await page.waitForFunction(function(){return document.getElementById('caregiverScreen').classList.contains('active');},{timeout:5000});
  assert.deepStrictEqual(JSON.parse(sbCalls[0].body),{p_username:'keep',p_org_slug:'evercare'});
  assert.ok(sheetsActions.indexOf('login')<0,'stored flag skips /exec login');

  rpcMode='email';
  authMode='ok';
  aideMode='empty';
  await openFresh(base+'?sb=1');
  await signIn();
  await page.waitForFunction(function(){return document.getElementById('loginErr').style.display==='block';},{timeout:5000});
  const noRow=await page.evaluate(function(){return document.getElementById('caregiverScreen').classList.contains('active');});
  assert.strictEqual(noRow,false,'a missing aides row does not enter the app');

  rpcMode='email';
  authMode='ok';
  aideMode='must';
  holdSb=null;
  await openFresh(base+'?sb=1');
  await signIn();
  await page.waitForFunction(function(){
    return document.getElementById('aideSetupScreen').classList.contains('active')&&!document.getElementById('caregiverScreen').classList.contains('active');
  },{timeout:5000});
  const gated=await page.evaluate(function(){
    const s=JSON.parse(localStorage.getItem('cg_session')||'null');
    return {must:s.mustChangePassword,needs:s.needsEmail,token:s.sbAccessToken};
  });
  assert.strictEqual(gated.must,true);
  assert.strictEqual(gated.needs,true);
  assert.strictEqual(gated.token,'jwt-test-token');
  await page.$eval('#setup_newpass',function(el){el.value='secret-new';});
  await page.$eval('#setup_confirm',function(el){el.value='secret-new';});
  await page.$eval('#setup_email',function(el){el.value='real.aide@example.com';});
  sbCalls.length=0;
  await page.click('#aideSetupBtn');
  await page.waitForFunction(function(){
    return document.getElementById('caregiverScreen').classList.contains('active')&&!document.getElementById('aideSetupScreen').classList.contains('active');
  },{timeout:5000});
  const setupCalls=sbCalls.map(function(c){return c.method+' '+c.url;});
  assert.ok(setupCalls.some(function(u){return u.indexOf('grant_type=password')>=0;}),'setup rechecks the current password');
  const userPut=sbCalls.filter(function(c){return c.method==='PUT'&&c.url.indexOf('/auth/v1/user')>=0;})[0];
  const aidePatch=sbCalls.filter(function(c){return c.method==='PATCH'&&c.url.indexOf('/rest/v1/aides')>=0;})[0];
  assert.ok(userPut,'setup updates the auth user');
  assert.deepStrictEqual(JSON.parse(userPut.body),{password:'secret-new'});
  assert.ok(aidePatch,'setup clears the aide flag');
  assert.strictEqual(JSON.parse(aidePatch.body).must_change_password,false);
  assert.ok(sheetsActions.indexOf('complete_aide_setup')<0,'flag on setup does not post to sheets');

  rpcMode='email';
  authMode='ok';
  aideMode='noemail';
  await openFresh(base+'?sb=1');
  await signIn();
  await page.waitForFunction(function(){
    return document.getElementById('aideSetupScreen').classList.contains('active')&&!document.getElementById('caregiverScreen').classList.contains('active');
  },{timeout:5000});
  const emptyEmail=await page.evaluate(function(){
    const s=JSON.parse(localStorage.getItem('cg_session')||'null');
    return {must:s.mustChangePassword,needs:s.needsEmail};
  });
  assert.strictEqual(emptyEmail.must,false);
  assert.strictEqual(emptyEmail.needs,true);

  await browser.close();
  console.log('caregiver-sb-dual browser checks ok');
}
