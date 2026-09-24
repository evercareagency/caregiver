#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

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

assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-aide-portal">'), 'portal meta');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-aide-portal v=portal1 —'), 'portal comment');
assert.ok(html.includes('v=portal1'), 'portal probe');
assert.ok(html.includes('v=cgpdfv1') && html.includes('v=ishydr1') && html.includes('v=bakuuid1') && html.includes('v=cgpdf1'), 'pdf and backup markers stay');
assert.ok(html.includes('v=home1') && html.includes('v=nocert1') && html.includes('v=sbseal1') && html.includes('v=offline1'), 'home, cert, seal, offline markers stay');

assert.ok(html.includes('<title>ECA Aide Portal</title>'), 'document title');
assert.ok(html.includes('const PORTAL_NAME=\'ECA Aide Portal\''), 'portal name constant');
assert.ok(html.includes('const PORTAL_SHORT_NAME=\'ECA Aide Portal\''), 'pwa short name');
assert.ok(html.includes('name:PORTAL_NAME'), 'manifest uses portal name');
assert.ok(html.includes('short_name:PORTAL_SHORT_NAME'), 'manifest uses short name');
assert.ok(html.includes('content="ECA Aide Portal"'), 'apple title');
assert.ok(html.includes('>ECA Aide Portal</h2>'), 'home header');
assert.ok(html.includes('class="auth-title">ECA Aide Portal</div>'), 'login title');

const nav = html.slice(html.indexOf('id="bottomNav"'), html.indexOf('id="deleteDraftModal"'));
assert.ok(nav.includes('>Home</span>'), 'home tab');
assert.ok(nav.includes('>Timesheet</span>'), 'timesheet tab');
assert.ok(nav.includes('>Inservices</span>'), 'inservices tab');
assert.ok(nav.includes('>More</span>'), 'more tab');
assert.ok(!/data-nav="clients"/i.test(nav), 'clients are not a nav tab');
assert.ok(nav.includes('data-nav="home"') && nav.includes('data-nav="timesheet"') && nav.includes('data-nav="inservices"') && nav.includes('data-nav="more"'), 'four nav targets');

assert.ok(html.includes('id="deleteDraftModal"'), 'delete draft dialog');
assert.ok(html.includes('onclick="confirmDeleteDraft()"'), 'delete confirms');
const home = extractFn(html, 'function renderTSHome()');
assert.ok(home.includes('askDeleteDraft(this)'), 'draft cards ask before delete');
assert.ok(home.includes('isUnfinishedDraft(ts)'), 'delete is offered on drafts');
assert.ok(!home.includes('removeDraftTimesheet'), 'rendering a card does not delete it');
assert.ok(home.includes("submitted?'':' onclick"), 'submitted cards stay non-interactive');
assert.ok(!home.includes('View PDF') && !home.includes('viewPdf'), 'home cards still have no View PDF');
const ask = extractFn(html, 'function askDeleteDraft(btn)');
assert.ok(ask.includes('openModal(\'deleteDraftModal\')'), 'ask opens the dialog');
assert.ok(ask.includes('isUnfinishedDraft'), 'sent-back and submitted are not drafts');
const drop = extractFn(html, 'function removeDraftTimesheet(id)');
assert.ok(drop.includes('isUnfinishedDraft'), 'remove refuses a non-draft');
assert.ok(drop.includes('tombstoneDraftBackup'), 'a deleted office id does not restore');

assert.ok(html.includes("askConfirmSig('sp_hdr_client')") && html.includes("askRedoSig('sp_hdr_client')"), 'header client confirm and redo');
assert.ok(html.includes("askConfirmSig('sp_hdr_aide')") && html.includes("askRedoSig('sp_hdr_aide')"), 'header aide confirm and redo');
assert.ok(html.includes("askConfirmSig('sp_aide_${i}')") && html.includes("askConfirmSig('sp_client_${i}')"), 'day aide and client confirm');
assert.ok(html.includes("askRedoSig('sp_aide_${i}')") && html.includes("askRedoSig('sp_client_${i}')"), 'day aide and client redo');
const askSig = extractFn(html, 'function askConfirmSig(id)');
const askRedo = extractFn(html, 'function askRedoSig(id)');
assert.ok(askSig.includes('openModal(\'sigDialogModal\')'), 'confirm asks first');
assert.ok(askRedo.includes('openModal(\'sigDialogModal\')'), 'redo asks first');
const commit = extractFn(html, 'function commitSigDialog()');
assert.ok(commit.includes('sig-locked') && commit.includes('clearSig(id)'), 'confirm locks and redo clears');

assert.ok(html.includes('const CG_SESSION_MS=8*60*60*1000;'), 'ttl constant stays 8 hours');
assert.ok(html.includes('const CG_SESSION_CHECK_MS=60*1000;'), 'foreground check interval is documented');
assert.ok(html.includes('setInterval(enforceCgSessionTimeout, CG_SESSION_CHECK_MS)'), 'open app checks the ttl');
const logout = extractFn(html, 'function caregiverLogout()');
assert.ok(logout.includes("store.del('cg_session')") && logout.includes("showScreen('authScreen')"), 'timeout still clears and returns to login');

const save = extractFn(html, 'function saveDayData(i,dayObj)');
assert.ok(!save.includes('showCaregiverHome') && !save.includes('backToTSHome'), 'Save Day stays on the timesheet');
const fin = extractFn(html, 'async function doFinalSubmit()');
assert.ok(fin.includes('showCaregiverHome()'), 'full-week submit still returns home');
assert.ok(!/Print Certificate|View Cert/i.test(extractFn(html, 'async function renderISList()')), 'aide cert strip stays absent');
assert.ok(html.includes("throw new Error('Pick a client first.')"), 'backup still blocks without a client');

assert.ok(html.includes('const PORTAL_MARK_HANDS='), 'hands+heart mark');
assert.ok(html.includes('fill="#2a7f7f"') && html.includes('PORTAL_MARK_HANDS'), 'hands mark is teal');
assert.ok(html.includes('const PORTAL_MARK_CLIPBOARD='), 'clipboard mark');
assert.ok(html.includes('fill="#1a2744"'), 'clipboard mark is navy');
assert.ok(html.includes('data:image/jpeg;base64,'), 'login photo stays');
assert.ok(html.includes('brand/eca-hands-heart.svg'), 'hands file is the later edit point');
assert.ok(!extractFn(html, 'function setupEverCarePWA()').includes('auth-logo'), 'pwa icon is not the login photo');

const hands = fs.readFileSync(path.join(__dirname, 'brand/eca-hands-heart.svg'), 'utf8');
const clip = fs.readFileSync(path.join(__dirname, 'brand/eca-clipboard.svg'), 'utf8');
assert.ok(hands.includes('#2a7f7f'), 'hands file is teal');
assert.ok(clip.includes('#1a2744'), 'clipboard file is navy');

console.log('caregiver-portal-shell static checks ok');

async function runBrowser(){
  if(process.env.SKIP_BROWSER==='1')return;
  let puppeteer;
  try{puppeteer=require('puppeteer-core');}
  catch(e){puppeteer=require('/tmp/cgtest/node_modules/puppeteer-core');}
  const http = require('http');
  const root = __dirname;
  const server = http.createServer(function(req, res){
    const url = (req.url||'/').split('?')[0];
    const file = path.join(root, url==='/'?'index.html':url.replace(/^\//,''));
    if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
    fs.readFile(file, function(err, buf){
      if(err){res.writeHead(404);res.end('missing');return;}
      const ext = path.extname(file);
      const type = ext==='.svg'?'image/svg+xml':ext==='.js'?'text/javascript':'text/html';
      res.writeHead(200, {'Content-Type':type,'Cache-Control':'no-store'});
      res.end(buf);
    });
  });
  await new Promise(function(resolve){server.listen(0, '127.0.0.1', resolve);});
  const port = server.address().port;
  const browser = await puppeteer.launch({
    executablePath:process.env.CHROME_PATH||'/usr/local/bin/google-chrome',
    headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']
  });
  try{
    const page = await browser.newPage();
    await page.setViewport({width:390,height:844,deviceScaleFactor:2});
    page.on('dialog', function(d){d.accept();});
    await page.goto('http://127.0.0.1:'+port+'/index.html?sheets=1', {waitUntil:'domcontentloaded', timeout:20000});
    const title = await page.title();
    assert.strictEqual(title, 'ECA Aide Portal');
    const login = await page.$eval('.auth-title', function(el){return el.textContent;});
    assert.strictEqual(login, 'ECA Aide Portal');
    const navHidden = await page.$eval('#bottomNav', function(el){return el.hidden;});
    assert.strictEqual(navHidden, true, 'login hides the bottom nav');
    const icon = await page.$eval('#portalFavicon', function(el){return el.getAttribute('href')||'';});
    assert.ok(icon.indexOf('image/svg')>=0, 'favicon is the svg mark');

    await page.evaluate(function(){
      localStorage.setItem('cg_session', JSON.stringify({
        username:'portal.aide',
        name:'Portal Aide',
        loginAt:Date.now()-60*60*1000,
        mustChangePassword:false,
        needsEmail:false
      }));
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_portal.aide','1');
    });
    await page.reload({waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForFunction(function(){
      return document.getElementById('caregiverScreen').classList.contains('active');
    }, {timeout:8000});
    const tabs = await page.$$eval('#bottomNav button', function(btns){
      return btns.map(function(b){return b.textContent.replace(/[^A-Za-z]/g,'');});
    });
    assert.deepStrictEqual(tabs, ['Home','Timesheet','Inservices','More']);
    const homeOn = await page.$eval('#bottomNav button[data-nav="home"]', function(el){return el.classList.contains('active');});
    assert.strictEqual(homeOn, true);
    assert.strictEqual(await page.$eval('#hdr_name', function(el){return el.textContent;}), 'Portal Aide');

    await page.click('#bottomNav button[data-nav="timesheet"]');
    await page.waitForFunction(function(){
      const form=document.getElementById('cgFormView');
      return form && form.style.display==='block';
    }, {timeout:5000});
    const sigLabels = await page.$$eval('#cgFormView .sig-act', function(btns){
      return btns.map(function(b){return b.textContent.trim();});
    });
    assert.ok(sigLabels.indexOf('Confirm')>=0 && sigLabels.indexOf('Redo')>=0, 'timesheet signatures confirm and redo');
    const tsOn = await page.$eval('#bottomNav button[data-nav="timesheet"]', function(el){return el.classList.contains('active');});
    assert.strictEqual(tsOn, true);

    await page.click('#bottomNav button[data-nav="home"]');
    await page.waitForFunction(function(){
      return document.getElementById('cgHomeView').style.display!=='none';
    }, {timeout:5000});
    const del = await page.$('.draft-del');
    assert.ok(del, 'home shows delete on the draft');
    await del.click();
    await page.waitForFunction(function(){
      return document.getElementById('deleteDraftModal').classList.contains('show');
    }, {timeout:3000});
    const stillThere = await page.$('.draft-del');
    assert.ok(stillThere, 'opening the dialog does not delete yet');
    await page.click('#deleteDraftModal .mbtn-danger');
    await page.waitForFunction(function(){
      return !document.querySelector('.draft-del');
    }, {timeout:3000});

    await page.click('#bottomNav button[data-nav="inservices"]');
    await page.waitForFunction(function(){
      return document.getElementById('inserviceScreen').classList.contains('active');
    }, {timeout:5000});
    await page.click('#bottomNav button[data-nav="more"]');
    await page.waitForFunction(function(){
      return document.getElementById('moreScreen').classList.contains('active');
    }, {timeout:5000});
    const moreText = await page.$eval('#moreScreen', function(el){return el.innerText;});
    assert.ok(moreText.indexOf('8 hours')>=0, 'more documents the 8 hour stay');
    assert.ok(moreText.indexOf('Log out')>=0, 'more can log out');

    await page.evaluate(function(){
      const raw=localStorage.getItem('cg_session');
      const sess=JSON.parse(raw);
      sess.loginAt=Date.now()-9*60*60*1000;
      sess.expiresAt=sess.loginAt+8*60*60*1000;
      localStorage.setItem('cg_session', JSON.stringify(sess));
      if(window.currentUser){
        window.currentUser.loginAt=sess.loginAt;
        window.currentUser.expiresAt=sess.expiresAt;
      }
      enforceCgSessionTimeout();
    });
    await page.waitForFunction(function(){
      return document.getElementById('authScreen').classList.contains('active');
    }, {timeout:3000});
    const cleared = await page.evaluate(function(){return localStorage.getItem('cg_session');});
    assert.strictEqual(cleared, null, 'expired session is cleared');
    const navAfter = await page.$eval('#bottomNav', function(el){return el.hidden;});
    assert.strictEqual(navAfter, true, 'signed-out portal hides the nav');
  }finally{
    await browser.close();
    server.close();
  }
  console.log('caregiver-portal-shell browser checks ok');
}

runBrowser().catch(function(err){
  console.error(err);
  process.exit(1);
});
