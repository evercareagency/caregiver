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

assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cguser1 v=cguser1 —'), 'cguser1 build comment');
assert.ok(html.includes('v=cguser1'), 'cguser1 probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cguser1">'), 'cguser1 build meta');
assert.ok(html.includes('v=cghome1b') && html.includes('<meta name="caregiver-build" content="2026-09-25-cghome1b">'), 'cghome1b marker stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cghome1b v=cghome1b —'), 'cghome1b comment stays');
assert.ok(html.includes('v=cgisbadge1') && html.includes('<meta name="caregiver-build" content="2026-09-25-cgisbadge1">'), 'badge marker stays');
assert.ok(html.includes('v=cghome1') && html.includes('v=cgauth1') && html.includes('v=bcast1b'), 'prior markers stay');
assert.ok(html.includes('v=coveraide2') && html.includes('v=loginkb1') && html.includes('v=cgquizlet1'), 'later markers stay');
assert.ok(html.includes('v=pwreset1') && html.includes('v=offline1') && html.includes('v=sbseal1'), 'reset and seal markers stay');
assert.ok(html.includes('Password saved') && html.includes('>Open Caregiver</a>'), 'cghome1b success copy stays');
assert.ok(!html.includes('setTimeout(openCaregiverLogin'), 'save does not schedule a jump into the portal');

const loginField = html.slice(html.indexOf('id="l_user"'), html.indexOf('id="loginBtn"'));
assert.ok(loginField.includes('id="l_user"') && loginField.includes('autocomplete="username"'), 'sign-in username stays a username field');
assert.ok(loginField.includes('id="l_pass"') && loginField.includes('autocomplete="off"'), 'sign-in password is not a stored autofill');
assert.ok(!loginField.includes('value='), 'sign-in fields are not hardcoded');

assert.ok(html.indexOf('id="signupForm"') < 0, 'sign-up form is not on the login screen');
assert.ok(html.indexOf('id="tabSignup"') < 0 && html.indexOf('>Sign Up<') < 0, 'sign-up tab is not an entry point');
assert.ok(html.indexOf('id="s_code"') < 0, 'office code input is gone');
assert.ok(!html.includes('Create Account'), 'create account control is gone');

const rememberFn = extractFn(html, 'function rememberSignInUsername(user)');
const readFn = extractFn(html, 'function readRememberedUsername()');
const paintFn = extractFn(html, 'function paintSignInForm()');
const blankFn = extractFn(html, 'function blankSignInPassword()');
const logoutFn = extractFn(html, 'function caregiverLogout()');
const loginFn = extractFn(html, 'async function doLogin()');
const signupFn = extractFn(html, 'async function doSignup()');
const forgotFn = extractFn(html, 'function showResetModal()');
const bootFn = extractFn(html, 'function bootCaregiverPortal()');
const dropFn = extractFn(html, 'function dropRecoveredPortalSession()');
const recoverSubmit = extractFn(html, 'async function submitRecoveryPassword()');

assert.ok(rememberFn.includes("const CG_LAST_USERNAME_KEY='cg_last_username'") === false);
assert.ok(html.includes("const CG_LAST_USERNAME_KEY='cg_last_username'"), 'username key follows the cg_ store pattern');
assert.ok(!rememberFn.includes('pass') && !rememberFn.includes('password') && !rememberFn.includes('l_pass'), 'remember writes the username only');
assert.ok(paintFn.includes('blankSignInPassword()') && paintFn.includes("getElementById('l_user')"), 'sign-in paint fills username');
assert.ok(!paintFn.includes('s_user') && !paintFn.includes('reset_user'), 'paint does not touch sign-up or forgot');
assert.ok(blankFn.includes("getElementById('l_pass')") && blankFn.includes("pass.value=''"), 'password is cleared');
assert.ok(logoutFn.includes("store.del('cg_session')"), 'logout still clears the session');
assert.ok(!logoutFn.includes("store.del('cg_last_username'") && !logoutFn.includes('cg_last_username'), 'logout does not delete the remembered username');
assert.ok(logoutFn.indexOf('rememberSignInUsername(') < logoutFn.indexOf("store.del('cg_session')"), 'logout keeps the username before the session is removed');
assert.ok(logoutFn.includes("showScreen('authScreen')"), 'logout still returns to sign in');
assert.ok(!html.includes('function switchTab('), 'the signup tab switch is gone');
assert.strictEqual((loginFn.match(/rememberSignInUsername\(user\)/g) || []).length, 1, 'sign-in stores the username once');
assert.ok(!loginFn.includes('rememberSignInUsername(pass)') && !loginFn.includes('rememberSignInUsername(password)'), 'sign-in does not store the password');
assert.ok(!signupFn.includes('rememberSignInUsername'), 'sign-up does not write the remembered username');
assert.ok(forgotFn.includes("getElementById('reset_email')"), 'forgot password still clears the email');
assert.ok(!forgotFn.includes('reset_user'), 'forgot password has no username field');
assert.ok(!forgotFn.includes('remember') && !forgotFn.includes('cg_last_username'), 'forgot password is unchanged');
assert.ok(bootFn.includes('paintSignInForm()'), 'cold open of Sign In paints the remembered username');
assert.ok(!bootFn.includes('doLogin'), 'cold open does not sign in from the remembered username');
assert.ok(bootFn.includes('afterLogin()'), 'a restored session still opens home');
assert.ok(!bootFn.includes('cg_last_username'), 'cold open does not treat the username as a session');
assert.ok(dropFn.includes('cg_session') && !dropFn.includes('cg_last_username'), 'Open Caregiver drops the session and keeps the username');
assert.ok(!dropFn.includes('doLogin') && !dropFn.includes('startCgSession'), 'Open Caregiver does not sign in');
assert.ok(recoverSubmit.includes('showRecoveryPasswordSaved'), 'recover save still stays on Password saved');
assert.ok(!recoverSubmit.includes('doLogin') && !recoverSubmit.includes("showScreen('authScreen')"), 'recover save does not auto-login');

const storeSrc = html.slice(html.indexOf('const store={'), html.indexOf('// Last successful Sign In username only.'));
const src = [
  storeSrc,
  "const CG_LAST_USERNAME_KEY='cg_last_username';",
  rememberFn,
  readFn,
  blankFn,
  paintFn,
  logoutFn
].join('\n');

function memoryStorage(){
  const data = Object.create(null);
  return {
    getItem(k){return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;},
    setItem(k, v){data[k] = String(v);},
    removeItem(k){delete data[k];},
    key(i){return Object.keys(data)[i] || null;},
    get length(){return Object.keys(data).length;},
    dump(){return Object.assign({}, data);}
  };
}

function run(setup){
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const els = {
    l_user:{value:''},
    l_pass:{value:'typed-secret'},
    s_user:{value:''},
    reset_user:{value:'left-alone'},
    loginForm:{style:{}},
    signupForm:{style:{}},
    tabLogin:{classList:{toggle(){}}},
    tabSignup:{classList:{toggle(){}}}
  };
  const screens = [];
  const context = {
    localStorage,
    sessionStorage,
    document:{
      getElementById(id){return els[id] || null;},
      querySelectorAll(){return [];}
    },
    currentUser:null,
    correctionMode:false,
    correctionData:null,
    sbClearAuth(){},
    clearNoticeAck(){},
    clearSandataAck(){},
    setPendingLoginLocation(){},
    showScreen(id){
      screens.push(id);
      if(id === 'authScreen')context.paintSignInForm();
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(src + '\nthis.paintSignInForm=paintSignInForm;this.rememberSignInUsername=rememberSignInUsername;this.readRememberedUsername=readRememberedUsername;this.caregiverLogout=caregiverLogout;this.store=store;', context);
  if(setup)setup(context, els, localStorage);
  return {context, els, localStorage, sessionStorage, screens};
}

{
  const {context, els, localStorage} = run();
  context.rememberSignInUsername('Aide.Maya');
  context.rememberSignInUsername('');
  assert.strictEqual(context.readRememberedUsername(), 'aide.maya');
  assert.strictEqual(JSON.parse(localStorage.getItem('cg_last_username')), 'aide.maya');
  assert.ok(!JSON.stringify(localStorage.dump()).includes('typed-secret'), 'storage has no password');
  els.l_pass.value = 'typed-secret';
  els.s_user.value = '';
  context.paintSignInForm();
  assert.strictEqual(els.l_user.value, 'aide.maya', 'sign-in username is prefilled');
  assert.strictEqual(els.l_pass.value, '', 'password stays empty');
  assert.strictEqual(els.s_user.value, '', 'sign-up username stays empty');
  assert.strictEqual(els.reset_user.value, 'left-alone', 'forgot username is not rewritten');
}

{
  const {context, els, localStorage, screens} = run((ctx, fields, storage)=>{
    storage.setItem('cg_session', JSON.stringify({username:'aide.maya', name:'Maya', loginAt:Date.now()}));
    storage.setItem('cg_last_username', JSON.stringify('older'));
    ctx.currentUser = {username:'Aide.Maya', name:'Maya'};
    fields.l_pass.value = 'typed-secret';
    fields.s_user.value = 'signup-name';
  });
  context.caregiverLogout();
  assert.deepStrictEqual(screens, ['authScreen']);
  assert.strictEqual(localStorage.getItem('cg_session'), null, 'session is cleared');
  assert.strictEqual(JSON.parse(localStorage.getItem('cg_last_username')), 'aide.maya', 'logout keeps the username');
  assert.strictEqual(els.l_user.value, 'aide.maya');
  assert.strictEqual(els.l_pass.value, '');
  assert.strictEqual(els.s_user.value, 'signup-name', 'logout does not prefill sign up');
  assert.ok(!JSON.stringify(localStorage.dump()).toLowerCase().includes('typed-secret'));
  assert.strictEqual(context.currentUser, null);
}

{
  const {context, els, localStorage} = run((ctx, fields, storage)=>{
    storage.setItem('cg_session', JSON.stringify({username:'night.aide', name:'Night'}));
    ctx.currentUser = null;
    fields.l_user.value = '';
    fields.l_pass.value = 'temp-pass';
  });
  context.caregiverLogout();
  assert.strictEqual(localStorage.getItem('cg_session'), null);
  assert.strictEqual(JSON.parse(localStorage.getItem('cg_last_username')), 'night.aide', 'expired session still leaves the username');
  assert.strictEqual(els.l_user.value, 'night.aide');
  assert.strictEqual(els.l_pass.value, '');
}

{
  const {context, els} = run((ctx)=>{
    ctx.rememberSignInUsername('kept.user');
  });
  els.l_user.value = '';
  els.l_pass.value = 'nope';
  els.s_user.value = '';
  context.paintSignInForm();
  assert.strictEqual(els.s_user.value, '', 'sign-up is not on this screen');
  assert.strictEqual(els.l_user.value, 'kept.user');
  assert.strictEqual(els.l_pass.value, '', 'painting sign-in clears the password');
}

console.log('cguser1 remember username checks ok');
