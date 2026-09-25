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

assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgsiglock1">'), 'cgsiglock1 meta');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cgsiglock1 v=cgsiglock1 —'), 'cgsiglock1 comment');
assert.ok(html.includes('v=cgsiglock1'), 'cgsiglock1 probe');
assert.ok(html.includes('canvas.sigpad.sig-locked{cursor:default;box-shadow:inset 0 0 0 2px var(--success);pointer-events:none;touch-action:auto;}'), 'locked canvas ignores pointer and scroll');
assert.ok(html.includes('.sig-act-confirm[hidden]{display:none;}'), 'hidden confirm stays hidden');

const commit = extractFn(html, 'function commitSigDialog()');
assert.ok(commit.includes('sig-locked') && commit.includes('clearSig(id)'), 'confirm locks and redo clears');
assert.ok(commit.includes('storeSigLock(id,true)') && commit.includes('paintSigLock(id,true)'), 'confirm stores and paints the lock');
assert.ok(commit.includes("setSigHint(id,true)"), 'confirm keeps the signed hint');

const save = extractFn(html, 'function saveDayData(i,dayObj)');
assert.ok(save.includes('aideSigLocked=true') && save.includes('clientSigLocked=true'), 'Save Day stores both locks');
assert.ok(save.includes("paintSigLock('sp_aide_'+i,true)") && save.includes("paintSigLock('sp_client_'+i,true)"), 'Save Day paints both locks');

const init = extractFn(html, 'function initSig(id)');
assert.ok(init.indexOf('if(sigPadBlocksDraw(c))return;e.preventDefault();') >= 0, 'locked touchstart does not cancel scroll');
assert.ok(init.includes("if(sigPadBlocksDraw(c)||!sigPads[id]||!sigPads[id].drawing)return;e.preventDefault();"), 'locked touchmove does not cancel scroll or draw');

const apply = extractFn(html, 'function applySigDataUrl(id,src)');
assert.ok(apply.includes('readSigLocked(id)') && apply.includes('paintSigLock(id,true)'), 'hydrate locks a saved signature');
const refresh = extractFn(html, 'function refreshSigFromStore(id)');
assert.ok(refresh.includes('readSigLocked(id)') && refresh.includes('paintSigLock(id,true)'), 'refresh keeps a locked signature');
const restore = extractFn(html, 'function restoreHdrSigs(ts)');
assert.ok(restore.includes('applySigDataUrl(id,src)'), 'header hydrate goes through applySigDataUrl');
assert.ok(extractFn(html, 'function loadSavedWeek()').includes('applySigDataUrl('), 'reopen week hydrates day signatures');
assert.ok(extractFn(html, 'function clearSig(id)').includes('paintSigLock(id,false)'), 'clear unlocks the pad');
assert.ok(extractFn(html, 'function clearHeaderSigPads()').includes('paintSigLock(id,false)'), 'switching weeks unlocks header UI');
assert.ok(extractFn(html, 'function setSigHint(id,signed)').includes("hint.textContent='Signed ✓'"), 'locked hint stays Signed');
assert.ok(!extractFn(html, 'function setSigHint(id,signed)').includes('Confirmed ✓'), 'hint does not switch off Signed');

console.log('caregiver-sig-lock static checks ok');

async function runBrowser(){
  if(process.env.SKIP_BROWSER === '1')return;
  let puppeteer;
  try{puppeteer = require('puppeteer-core');}
  catch(e){puppeteer = require('/tmp/cgtest/node_modules/puppeteer-core');}
  const http = require('http');
  const root = __dirname;
  const server = http.createServer(function(req, res){
    const url = (req.url || '/').split('?')[0];
    const file = path.join(root, url === '/' ? 'index.html' : url.replace(/^\//, ''));
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
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox','--disable-dev-shm-usage']
  });
  try{
    const page = await browser.newPage();
    await page.emulate({
      viewport: {width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2},
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    });
    page.on('dialog', function(d){d.accept();});
    await page.goto('http://127.0.0.1:' + port + '/index.html?sheets=1', {waitUntil:'domcontentloaded', timeout:20000});
    await page.evaluate(function(){
      localStorage.setItem('cg_session', JSON.stringify({
        username:'siglock.aide',
        name:'Sig Lock',
        loginAt:Date.now() - 60 * 60 * 1000,
        mustChangePassword:false,
        needsEmail:false
      }));
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_siglock.aide','1');
    });
    await page.reload({waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForFunction(function(){
      return document.getElementById('caregiverScreen').classList.contains('active');
    }, {timeout:8000});
    await page.click('#bottomNav button[data-nav="timesheet"]');
    await page.waitForFunction(function(){
      const form = document.getElementById('cgFormView');
      return form && form.style.display === 'block' && document.getElementById('sp_hdr_client');
    }, {timeout:8000});

    async function inkOf(id){
      return page.evaluate(function(padId){
        return countCanvasInkPixels(document.getElementById(padId));
      }, id);
    }
    async function drawStroke(id){
      await page.evaluate(function(padId){
        const c = document.getElementById(padId);
        c.scrollIntoView({block:'center'});
        const r = c.getBoundingClientRect();
        function ev(type, px, py){
          c.dispatchEvent(new MouseEvent(type, {bubbles:true, cancelable:true, clientX:px, clientY:py, buttons:1}));
        }
        ev('mousedown', r.left + 20, r.top + 40);
        ev('mousemove', r.left + Math.min(r.width - 16, 180), r.top + 62);
        ev('mouseup', r.left + Math.min(r.width - 16, 180), r.top + 62);
      }, id);
      const n = await inkOf(id);
      assert.ok(n >= 18, id + ' stroke should leave ink, got ' + n);
    }
    async function confirmPad(id){
      await page.evaluate(function(padId){
        document.querySelector('#hint_' + padId).nextElementSibling.querySelector('.sig-act-confirm').click();
      }, id);
      await page.waitForFunction(function(){
        return document.getElementById('sigDialogModal').classList.contains('show');
      }, {timeout:3000});
      await page.click('#sigDialogGo');
      await page.waitForFunction(function(padId){
        const pad = document.getElementById(padId);
        const btn = document.querySelector('#hint_' + padId).nextElementSibling.querySelector('.sig-act-confirm');
        return pad.classList.contains('sig-locked') && btn.hidden && document.getElementById('hint_' + padId).textContent === 'Signed ✓';
      }, {timeout:3000}, id);
    }
    async function assertLocked(id){
      const state = await page.evaluate(function(padId){
        const pad = document.getElementById(padId);
        const btn = document.querySelector('#hint_' + padId).nextElementSibling.querySelector('.sig-act-confirm');
        const redo = document.querySelector('#hint_' + padId).nextElementSibling.querySelector('.sig-act-redo');
        const cs = getComputedStyle(pad);
        const r = pad.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          locked: pad.classList.contains('sig-locked'),
          pe: cs.pointerEvents,
          ta: cs.touchAction,
          inlinePe: pad.style.pointerEvents,
          hint: document.getElementById('hint_' + padId).textContent,
          confirmHidden: btn.hidden,
          confirmDisplay: getComputedStyle(btn).display,
          redoHidden: redo.hidden,
          hitCanvas: !!(hit && (hit === pad || pad.contains(hit)))
        };
      }, id);
      assert.strictEqual(state.locked, true, id + ' class');
      assert.strictEqual(state.pe, 'none', id + ' pointer-events');
      assert.strictEqual(state.inlinePe, 'none', id + ' inline pointer-events');
      assert.strictEqual(state.hint, 'Signed ✓', id + ' hint');
      assert.strictEqual(state.confirmHidden, true, id + ' confirm hidden');
      assert.strictEqual(state.confirmDisplay, 'none', id + ' confirm display');
      assert.strictEqual(state.redoHidden, false, id + ' redo stays');
      assert.strictEqual(state.hitCanvas, false, id + ' scroll target is not the canvas');
    }

    await drawStroke('sp_hdr_client');
    await drawStroke('sp_hdr_aide');
    const before = await page.evaluate(function(){
      return {
        client: document.querySelector('#hint_sp_hdr_client').textContent,
        aide: document.querySelector('#hint_sp_hdr_aide').textContent,
        clientBtn: document.querySelector('#hint_sp_hdr_client').nextElementSibling.querySelector('.sig-act-confirm').hidden
      };
    });
    assert.strictEqual(before.client, 'Signed ✓');
    assert.strictEqual(before.aide, 'Signed ✓');
    assert.strictEqual(before.clientBtn, false, 'confirm is available before lock');

    await confirmPad('sp_hdr_client');
    await confirmPad('sp_hdr_aide');
    await assertLocked('sp_hdr_client');
    await assertLocked('sp_hdr_aide');
    const touchGuard = await page.evaluate(function(){
      const c = document.getElementById('sp_hdr_client');
      const before = countCanvasInkPixels(c);
      const r = c.getBoundingClientRect();
      if(typeof Touch !== 'function' || typeof TouchEvent !== 'function')return {skipped:true, before:before, after:before};
      function fire(type){
        const t = new Touch({identifier:1, target:c, clientX:r.left + 36, clientY:r.top + 48});
        const touches = type === 'touchend' ? [] : [t];
        c.dispatchEvent(new TouchEvent(type, {bubbles:true, cancelable:true, touches:touches, targetTouches:touches, changedTouches:[t]}));
      }
      fire('touchstart');
      fire('touchmove');
      fire('touchend');
      return {skipped:false, before:before, after:countCanvasInkPixels(c)};
    });
    assert.strictEqual(touchGuard.after, touchGuard.before, 'touch listeners do not ink a locked pad');

    const flags = await page.evaluate(function(){
      const ts = getAllTimesheets().find(function(t){return t.id === currentTS;}) || {};
      return {aide: ts.headerAideSigLocked === true, client: ts.headerClientSigLocked === true};
    });
    assert.strictEqual(flags.aide, true, 'header aide lock is stored');
    assert.strictEqual(flags.client, true, 'header client lock is stored');

    const inkBeforeScroll = await inkOf('sp_hdr_client');
    const scroll = await page.evaluate(function(){
      const pad = document.getElementById('sp_hdr_client');
      pad.scrollIntoView({block:'center'});
      const r = pad.getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2, top: window.scrollY};
    });
    const client = await page.createCDPSession();
    await client.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:scroll.x, y:scroll.y}]});
    await client.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:scroll.x, y:scroll.y - 160}]});
    await client.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
    const afterScroll = await page.evaluate(function(){
      return {ink: countCanvasInkPixels(document.getElementById('sp_hdr_client')), top: window.scrollY};
    });
    assert.strictEqual(afterScroll.ink, inkBeforeScroll, 'scroll gesture does not add ink on a locked pad');
    assert.ok(afterScroll.top !== scroll.top, 'locked pad lets the page scroll (was ' + scroll.top + ' now ' + afterScroll.top + ')');

    const box = await page.evaluate(function(){
      const c = document.getElementById('sp_hdr_aide');
      c.scrollIntoView({block:'center'});
      const r = c.getBoundingClientRect();
      return {x:r.left + 30, y:r.top + 40};
    });
    const aideInk = await inkOf('sp_hdr_aide');
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 20, {steps:8});
    await page.mouse.up();
    assert.strictEqual(await inkOf('sp_hdr_aide'), aideInk, 'pointer drag does not draw on a locked caregiver pad');

    await page.evaluate(function(){
      document.querySelector('#hint_sp_hdr_client').nextElementSibling.querySelector('.sig-act-redo').click();
    });
    await page.waitForSelector('#sigDialogModal.show', {timeout:3000});
    await page.click('#sigDialogGo');
    await page.waitForFunction(function(){
      const pad = document.getElementById('sp_hdr_client');
      const btn = document.querySelector('#hint_sp_hdr_client').nextElementSibling.querySelector('.sig-act-confirm');
      return !pad.classList.contains('sig-locked') && !btn.hidden && pad.style.pointerEvents === '';
    }, {timeout:3000});
    const redone = await page.evaluate(function(){
      const ts = getAllTimesheets().find(function(t){return t.id === currentTS;}) || {};
      return {
        ink: countCanvasInkPixels(document.getElementById('sp_hdr_client')),
        hint: document.getElementById('hint_sp_hdr_client').textContent,
        locked: ts.headerClientSigLocked
      };
    });
    assert.strictEqual(redone.ink, 0, 'redo clears strokes');
    assert.strictEqual(redone.hint, 'Tap to sign');
    assert.strictEqual(redone.locked, false, 'redo clears the stored header lock');
    await drawStroke('sp_hdr_client');
    await confirmPad('sp_hdr_client');

    await page.evaluate(function(){toggleDay(0);});
    await page.waitForFunction(function(){
      return document.getElementById('dbody_0').classList.contains('open') && document.getElementById('sp_aide_0').offsetWidth > 40;
    }, {timeout:3000});
    await drawStroke('sp_aide_0');
    await drawStroke('sp_client_0');
    await confirmPad('sp_aide_0');
    await confirmPad('sp_client_0');
    await assertLocked('sp_aide_0');
    await assertLocked('sp_client_0');
    const dayFlags = await page.evaluate(function(){
      const d = getUserWeekData()[0] || {};
      return {aide: d.aideSigLocked === true, client: d.clientSigLocked === true, aideSrc: (d.aideSig || '').indexOf('data:image') === 0};
    });
    assert.strictEqual(dayFlags.aide, true, 'day aide lock stored');
    assert.strictEqual(dayFlags.client, true, 'day client lock stored');
    assert.strictEqual(dayFlags.aideSrc, true, 'day aide ink stored');

    await page.evaluate(function(){
      buildDayBlocks();
      loadSavedWeek();
    });
    await page.waitForFunction(function(){
      const a = document.getElementById('sp_aide_0');
      const c = document.getElementById('sp_client_0');
      return a && c && a.classList.contains('sig-locked') && c.classList.contains('sig-locked')
        && countCanvasInkPixels(a) >= 18 && countCanvasInkPixels(c) >= 18
        && document.getElementById('hint_sp_aide_0').textContent === 'Signed ✓'
        && document.getElementById('hint_sp_client_0').textContent === 'Signed ✓';
    }, {timeout:4000});
    await page.evaluate(function(){toggleDay(0);});
    await page.waitForFunction(function(){
      return document.getElementById('sp_aide_0').offsetWidth > 40;
    }, {timeout:3000});
    await assertLocked('sp_aide_0');
    await assertLocked('sp_client_0');

    await page.evaluate(function(){
      const ts = getAllTimesheets().find(function(t){return t.id === currentTS;}) || {};
      clearHeaderSigPads();
      restoreHdrSigs(ts);
    });
    await page.waitForFunction(function(){
      const a = document.getElementById('sp_hdr_aide');
      const c = document.getElementById('sp_hdr_client');
      return a.classList.contains('sig-locked') && c.classList.contains('sig-locked')
        && countCanvasInkPixels(a) >= 18 && countCanvasInkPixels(c) >= 18;
    }, {timeout:4000});
    await assertLocked('sp_hdr_aide');
    await assertLocked('sp_hdr_client');

    console.log('caregiver-sig-lock phone checks ok');
  }finally{
    await browser.close();
    server.close();
  }
}

runBrowser().catch(function(err){
  console.error(err);
  process.exit(1);
});
