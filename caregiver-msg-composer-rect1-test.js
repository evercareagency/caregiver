#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, 'caregiver-push-sw.js'), 'utf8');

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-10-08-sec1-ui">', 'newer tip meta is first');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-msg-composer-rect1">') > 0, 'msg-composer-rect1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pwa-install-copy1">') > 0, 'pwa-install-copy1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-care-msg-send1">') > 0, 'care-msg-send1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pages-cache-fresh1">') > 0, 'pages-cache-fresh1 meta stays');
assert.ok(html.includes('<meta name="caregiver-shell" content="2026-09-29-pages-cache-fresh1">'), 'shell id stays pages-cache-fresh1');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-29-msg-composer-rect1 v=msg-composer-rect1'), 'rect1 comment');
const tip = html.slice(html.indexOf('<!-- caregiver-build: 2026-09-29-msg-composer-rect1'), html.indexOf('<!-- caregiver-build: 2026-09-29-pwa-install-copy1'));
assert.ok(tip.includes('MERGE HOLD') && tip.includes('Do not claim LIVE') && tip.includes('Do not squash-merge'), 'merge hold');
assert.ok(tip.includes('Quiet Mo'), 'quiet mo');
assert.ok(tip.includes('Ace NO CALLABLE'), 'ace is not callable for this tip');
assert.ok(tip.includes('Probe soft FAIL-only'), 'probe scope');
assert.ok(!/CONTRACT-v1 is LIVE/.test(tip), 'this tip does not claim live');
assert.ok(html.includes('data-msg-composer-rect1="v=msg-composer-rect1"'), 'screen marker');
assert.ok(html.includes('data-pwa-install="v=pwa-install-copy1"'), 'ios install modal marker stays');
assert.ok(html.includes('<strong>Share</strong>') && html.includes('<strong>View More</strong>') && html.includes('<strong>Add to Home Screen</strong>') && html.includes('<strong>Add</strong>'), 'ios install steps stay');
assert.ok(html.includes('data-msg-send="v=care-msg-send1"'), 'send marker stays');
assert.ok(html.includes('data-cache="?v=care-msg-send1"'), 'send cache marker stays');
assert.ok(sw.includes('v=pages-cache-fresh1') && sw.includes('skipWaiting') && sw.includes('#messages'), 'push worker stays');
assert.ok(!sw.includes('msg-composer-rect1'), 'push worker is not rewritten for this tip');

assert.ok(html.includes('.aidechat-sendrow{display:flex;gap:8px;align-items:flex-end;}'), 'send row flex is unchanged');
const typeRule = (html.match(/#aideChatInput\{[^}]+\}/) || [''])[0];
const sendRule = (html.match(/#aideChatSend\{[^}]+\}/) || [''])[0];
assert.ok(typeRule.includes('border-radius:11px'), 'type radius is 11px');
assert.ok(typeRule.includes('min-height:44px'), 'type min-height is 44px');
assert.ok(!/999/.test(typeRule), 'type rule is not a stadium');
assert.ok(sendRule.includes('border-radius:11px'), 'send radius is 11px');
assert.ok(sendRule.includes('min-height:44px'), 'send min-height matches');
assert.ok(sendRule.includes('width:auto'), 'send is not a fixed circle');
assert.ok(!/999/.test(sendRule), 'send rule is not a circle');
assert.ok(html.includes('function aideChatFlushEdge('), 'flush correction stays');
assert.ok(html.includes('function aideChatVisualBottom('), 'visual viewport bottom helper stays');
assert.ok(html.includes('aideChatFlushEdge(screen, compose||screen, aideChatVisualBottom(vv))'), 'keyboard pin flushes the composer');
assert.ok(html.includes('body.aidechat-kb #messagesScreen.active{bottom:0;}'), 'keyboard path still fills the bottom');
assert.ok(html.includes('body.aidechat-kb #bottomNav{display:none !important;}'), 'dock still hides only for the keyboard');

function loadPuppeteer(){
  try{return require('puppeteer-core');}
  catch(e){
    try{return require('/tmp/aidechat/node_modules/puppeteer-core');}
    catch(e2){return null;}
  }
}

function radiusPx(value){
  const n = parseFloat(String(value||'').split(' ')[0]);
  return isFinite(n) ? n : -1;
}

async function runBrowser(){
  if(process.env.SKIP_BROWSER==='1')return;
  const puppeteer = loadPuppeteer();
  if(!puppeteer){
    console.log('caregiver-msg-composer-rect1 browser skipped (no puppeteer-core)');
    return;
  }
  const http = require('http');
  const shotDir = process.env.AIDECHAT_SHOTS || '/opt/cursor/artifacts/msg-composer-rect1';
  fs.mkdirSync(shotDir, {recursive:true});
  const root = __dirname;
  const server = http.createServer(function(req, res){
    const url = (req.url||'/').split('?')[0];
    const file = path.join(root, url==='/'?'index.html':url.replace(/^\//,''));
    if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
    fs.readFile(file, function(err, buf){
      if(err){res.writeHead(404);res.end('missing');return;}
      res.writeHead(200, {'Content-Type':'text/html','Cache-Control':'no-store'});
      res.end(buf);
    });
  });
  await new Promise(function(resolve){server.listen(0, '127.0.0.1', resolve);});
  const port = server.address().port;
  const browser = await puppeteer.launch({
    executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
    headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']
  });
  try{
    const page = await browser.newPage();
    await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    page.on('dialog', function(d){d.accept();});
    const cors = {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Headers':'*',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
      'Content-Type':'application/json'
    };
    const thread = [
      {id:'o1', body:'Hi Sara — can you cover Ada tomorrow AM?', sender:'office', created_at:'2026-09-29T13:12:00Z'},
      {id:'a1', body:'Checking my schedule — one sec.', sender:'aide', created_at:'2026-09-29T13:14:00Z'}
    ];
    await page.setRequestInterception(true);
    page.on('request', function(req){
      const url = req.url();
      if(!/supabase\.co/.test(url)){req.continue().catch(function(){});return;}
      if(req.method()==='OPTIONS'){
        req.respond({status:204, headers:cors, body:''}).catch(function(){});
        return;
      }
      if(/aide_get_or_create_office_thread/.test(url)){
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true, data:{id:'t1'}})}).catch(function(){});
        return;
      }
      if(/aide_list_office_messages/.test(url)){
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true, data:thread.slice()})}).catch(function(){});
        return;
      }
      if(/aide_mark_office_messages_read/.test(url)){
        req.respond({status:200, headers:cors, body:JSON.stringify({success:true})}).catch(function(){});
        return;
      }
      req.respond({status:200, headers:cors, body:'[]'}).catch(function(){});
    });
    await page.goto('http://127.0.0.1:'+port+'/index.html', {waitUntil:'domcontentloaded', timeout:20000});
    await page.evaluate(function(){
      localStorage.setItem('cg_session', JSON.stringify({
        username:'sara.aide',
        name:'Sara Aide',
        loginAt:Date.now()-60*60*1000,
        mustChangePassword:false,
        needsEmail:false,
        sbAccessToken:'test-jwt'
      }));
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_sara.aide','1');
    });
    await page.reload({waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForFunction(function(){
      const btn = document.querySelector('#bottomNav button[data-nav="messages"]');
      const screen = document.getElementById('caregiverScreen');
      return !!(btn && screen && screen.classList.contains('active'));
    }, {timeout:8000});
    await page.click('#bottomNav button[data-nav="messages"]');
    await page.waitForSelector('#aideChatThread .aidechat-row', {timeout:8000});
    await page.$eval('#aideChatInput', function(el){el.value='Yes — I can cover Ada AM.';});

    const shape = await page.evaluate(function(){
      function r(el){return el.getBoundingClientRect();}
      const input = document.getElementById('aideChatInput');
      const send = document.getElementById('aideChatSend');
      const nav = document.getElementById('bottomNav');
      const compose = document.getElementById('aideChatCompose');
      const ic = getComputedStyle(input);
      const sc = getComputedStyle(send);
      const ir = r(input);
      const sr = r(send);
      return {
        typeRadius:ic.borderRadius,
        sendRadius:sc.borderRadius,
        typeH:Math.round(ir.height),
        sendH:Math.round(sr.height),
        sendW:Math.round(sr.width),
        typeMin:ic.minHeight,
        sendMin:sc.minHeight,
        sendText:send.textContent,
        gapSend:Math.round(r(nav).top - sr.bottom),
        gapCompose:Math.round(r(nav).top - r(compose).bottom),
        font:ic.fontFamily
      };
    });
    assert.ok(radiusPx(shape.typeRadius) >= 10 && radiusPx(shape.typeRadius) <= 12, 'type radius 10–12, got '+shape.typeRadius);
    assert.ok(radiusPx(shape.sendRadius) >= 10 && radiusPx(shape.sendRadius) <= 12, 'send radius 10–12, got '+shape.sendRadius);
    assert.ok(shape.typeH >= 44, 'type height at least 44, got '+shape.typeH);
    assert.ok(shape.sendH >= 44, 'send height at least 44, got '+shape.sendH);
    assert.ok(Math.abs(shape.sendH - shape.typeH) <= 2, 'send matches type height');
    assert.ok(shape.sendW >= shape.sendH + 16, 'send is a wide rectangle, not a circle ('+shape.sendW+'x'+shape.sendH+')');
    assert.strictEqual(shape.sendText.trim(), 'Send');
    assert.ok(Math.abs(shape.gapCompose) <= 1, 'composer flush above the dock, gap '+shape.gapCompose);
    assert.ok(shape.gapSend <= 2, 'send flush above the dock, gap '+shape.gapSend);
    assert.ok(/DM Sans/i.test(shape.font), 'type uses DM Sans');
    await page.screenshot({path:path.join(shotDir, 'office-rect-dock.png')});

    await page.click('#aideChatInput');
    await page.waitForFunction(function(){
      return document.body.classList.contains('aidechat-kb');
    }, {timeout:2000});
    const kb = await page.evaluate(function(){
      const compose = document.getElementById('aideChatCompose');
      const screen = document.getElementById('messagesScreen');
      const nav = document.getElementById('bottomNav');
      const cr = compose.getBoundingClientRect();
      const sr = screen.getBoundingClientRect();
      const target = aideChatVisualBottom(window.visualViewport);
      return {
        navDisplay:getComputedStyle(nav).display,
        gap:Math.round(cr.bottom - target),
        screenGap:Math.round(sr.bottom - target),
        innerH:window.innerHeight
      };
    });
    assert.strictEqual(kb.navDisplay, 'none', 'keyboard hides the dock');
    assert.ok(Math.abs(kb.gap) <= 1, 'composer flush to the visual viewport, gap '+kb.gap);
    assert.ok(Math.abs(kb.screenGap) <= 2, 'screen meets the visual bottom');
    await page.screenshot({path:path.join(shotDir, 'office-rect-keyboard.png')});

    const forced = await page.evaluate(function(){
      const screen = document.getElementById('messagesScreen');
      const compose = document.getElementById('aideChatCompose');
      const target = aideChatVisualBottom(window.visualViewport);
      screen.style.height = Math.max(160, window.innerHeight - 180) + 'px';
      screen.style.maxHeight = screen.style.height;
      const before = Math.round(target - compose.getBoundingClientRect().bottom);
      aideChatFlushEdge(screen, compose, target);
      const after = Math.round(compose.getBoundingClientRect().bottom - target);
      document.body.classList.remove('aidechat-kb');
      const input = document.getElementById('aideChatInput');
      if(input && input.blur)input.blur();
      aideChatKbApply();
      return {before:before, after:after};
    });
    assert.ok(forced.before >= 100, 'a short screen leaves a white gap ('+forced.before+')');
    assert.ok(Math.abs(forced.after) <= 1, 'flush removes that gap ('+forced.after+')');
    await page.waitForFunction(function(){
      return !document.body.classList.contains('aidechat-kb') && getComputedStyle(document.getElementById('bottomNav')).display !== 'none';
    }, {timeout:2000});
    const restored = await page.evaluate(function(){
      const nav = document.getElementById('bottomNav');
      const compose = document.getElementById('aideChatCompose');
      return Math.round(nav.getBoundingClientRect().top - compose.getBoundingClientRect().bottom);
    });
    assert.ok(Math.abs(restored) <= 2, 'dock returns flush after the keyboard, gap '+restored);

    console.log('caregiver-msg-composer-rect1 browser ok');
  }finally{
    await browser.close();
    server.close();
  }
}

runBrowser().catch(function(err){
  console.error(err);
  process.exit(1);
});
