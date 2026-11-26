#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/preview/aide-visit-day.sql'), 'utf8');

function sliceBetween(src, startMark, endMark){
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, startMark);
  return src.slice(start, end);
}

const home = sliceBetween(html, 'id="cgHomeView"', 'id="cgFormView"');
const clock = sliceBetween(html, 'id="visitClockScreen"', 'id="visitDayScreen"');
const day = sliceBetween(html, 'id="visitDayScreen"', '<!-- EXEMPT WEEK');
const visitJs = html.slice(html.lastIndexOf('var VISIT_OFFICE_DISPLAY'), html.lastIndexOf('</script>'));
const form = sliceBetween(html, 'id="cgFormView"', 'id="cgSuccessView"');

assert.ok(home.includes('id="visitHomeCard"'), 'home visit card');
assert.ok(home.includes('id="visitClockInBtn"'), 'clock in button');
assert.ok(home.includes('For all call-offs, call the office'), 'call-off line');
assert.ok(home.includes('tel:+12163775991') && home.includes('(216) 377-5991'), 'configured office number');
assert.ok(!home.includes('id="callOffHomeBtn"') && !home.includes('>Call off</button>'), 'no call-off control on home');
assert.ok(home.includes('id="visitLiveName"') && home.includes('id="visitLiveTimer"'), 'in-progress name and timer');
assert.ok(home.includes('class="visit-card"'), 'navy visit card');
assert.ok(visitJs.includes('booked until'), 'booked until label');
assert.ok(home.includes('id="visitLiveNote"'), 'care note');
assert.ok(home.includes('>Done for the day<'), 'done for the day');
assert.ok(home.includes('class="vbig-clock"'), 'big clock in');

assert.ok(clock.includes('from your login'), 'aide name is locked');
assert.ok(clock.includes('set by office'), 'service is locked');
assert.ok(!/type="time"/.test(clock), 'clock in has no time input');
assert.ok(clock.includes('For all call-offs, call the office'), 'call-off line under clock in');
assert.ok(html.includes('id="visitInScreen"'), 'clocked-in confirm screen');

assert.ok(day.includes('>Tick all<') && visitJs.includes('Untick all'), 'tick all and untick all');
assert.ok(day.includes('Then the caregiver signs') && day.includes('Then the client signs'), 'signature step cards');
assert.ok(day.includes('Anything to report today?'), 'report question');
assert.ok(day.includes('Hand the phone to the client or a family member to sign.'), 'hand-off copy');
assert.ok(day.includes('Clock Out appears after both the caregiver and the client have signed.'), 'lock hint');
assert.ok(visitJs.includes('>Clock Out<'), 'clock out label');
assert.ok(day.includes('data-locked="1"'), 'client pad starts locked');
assert.ok(day.includes('>Clear<'), 'pads have clear');
assert.ok(!/unable to sign/i.test(day), 'no unable-to-sign option');
assert.ok(!/type="time"/.test(day), 'day flow has no time input');
assert.ok(!/>Type</.test(day) && !/Type to sign/i.test(day), 'no type option');
assert.ok(visitJs.includes('visitpreview=1'), 'preview flag is documented in the page');
assert.ok(!/flagged/i.test(day + clock + home) && !/sent to the office/i.test(day + clock), 'aides do not see flagged or sent-to-the-office copy here');

assert.ok(form.includes('type="time" id="d${i}_in"') || html.includes('type="time" id="d${i}_in"'), 'timesheet time inputs stay');
assert.ok(html.includes('ts-pdf-sheet') && html.includes('5510 Pearl Rd Ste 200'), 'pdf sheet and address stay');
assert.ok(!visitJs.includes("getElementById('cg_notes')") && !visitJs.includes('saveUserWeekData') && !visitJs.includes('sbStampTimesheetSigs'), 'visit save does not touch the timesheet or pdf');
assert.ok(visitJs.includes('maps/search/?api=1&query='), 'address opens a maps search');
assert.ok(visitJs.includes('p_office_note') && !visitJs.includes('clock_in_at:') && !visitJs.includes('p_clock'), 'clock out does not send a clock time');
assert.ok(!/sent to the office/i.test(html), 'page no longer tells an aide something was sent to the office');
assert.ok(!html.includes('only flagged days'), 'correction copy does not say flagged');

assert.ok(sql.includes('NOT APPLIED'), 'sql is marked not applied');
assert.ok(!/\b(alter table|update|insert into|delete from)\s+public\.timesheets\b/i.test(sql), 'sql does not write the timesheet table');
assert.ok(sql.includes('clock_timestamp()'), 'database sets the clock');
assert.ok(sql.includes('aide_today_shift') && sql.includes('client_visit_tasks') && sql.includes('care_note'), 'shift, tasks, and care note are named');
assert.ok(sql.includes('schedule_slot_patterns'), 'booked-until reads the schedule when that table exists');
assert.ok(/revoke all on function public\.aide_clock_in/i.test(sql), 'clock in is not granted to public');
assert.ok(sql.includes('enable row level security') && sql.includes('force row level security'), 'visit tables force rls');

console.log('caregiver-visit-day1 static checks ok');

async function runBrowser(){
  if(process.env.SKIP_BROWSER==='1')return;
  let puppeteer;
  try{puppeteer=require('puppeteer-core');}
  catch(e){
    try{puppeteer=require('/tmp/visit-preview/node_modules/puppeteer-core');}
    catch(e2){
      console.log('caregiver-visit-day1 browser skipped (no puppeteer-core)');
      return;
    }
  }
  const http = require('http');
  const server = http.createServer(function(req, res){
    const url = decodeURIComponent((req.url||'/').split('?')[0]);
    const rel = url==='/'?'index.html':url.replace(/^\//,'');
    const file = path.join(root, rel);
    if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
    fs.readFile(file, function(err, buf){
      if(err){res.writeHead(404);res.end('missing');return;}
      const ext = path.extname(file);
      const type = ext==='.ttf'?'font/ttf':ext==='.svg'?'image/svg+xml':ext==='.js'?'text/javascript':'text/html; charset=utf-8';
      res.writeHead(200, {'Content-Type':type,'Cache-Control':'no-store'});
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
  const outDir = '/opt/cursor/artifacts/visit-mock';
  fs.mkdirSync(outDir, {recursive:true});
  const base = 'http://127.0.0.1:'+port+'/index.html?visitpreview=1';
  try{
    const page = await browser.newPage();
    await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    page.on('dialog', function(d){d.accept();});
    async function shot(screen, file, prep){
      await page.goto(base+'&screen='+screen, {waitUntil:'domcontentloaded', timeout:20000});
      await page.waitForFunction(function(){return document.body.classList.contains('visit-preview');}, {timeout:8000});
      if(prep)await prep();
      await page.screenshot({path:path.join(outDir, file)});
    }
    await shot('home', '02-home.png', async function(){
      const text = await page.$eval('#cgHomeView', function(el){return el.innerText;});
      assert.ok(text.indexOf('Clock In')>=0, 'idle clock in');
      assert.ok(text.indexOf('For all call-offs, call the office')>=0);
      assert.ok(text.indexOf('(216) 377-5991')>=0);
      assert.ok(!/PREVIEW, FAKE/i.test(text), 'no mock banner');
      assert.strictEqual(await page.$('#mockToggle'), null, 'no mock controls');
    });
    await shot('clock', '04-clock-in-calloff-note.png', async function(){
      await page.waitForFunction(function(){return document.getElementById('visitClockScreen').classList.contains('active');});
      const text = await page.$eval('#visitClockScreen', function(el){return el.innerText;});
      assert.ok(text.indexOf('from your login')>=0);
      assert.strictEqual(await page.$('#visitClockScreen input[type="time"]'), null);
    });
    await shot('clocked', '06-clocked-in-confirm.png', async function(){
      await page.waitForFunction(function(){return document.getElementById('visitInScreen').classList.contains('active');});
    });
    await shot('in', '07-home-visit-in-progress.png', async function(){
      const text = await page.$eval('#visitLive', function(el){return el.innerText;});
      assert.ok(text.indexOf('Test Client E')>=0);
      assert.ok(text.indexOf('booked until 1:00 PM')>=0);
      assert.ok(text.indexOf('Uses walker')>=0);
      const href = await page.$eval('#visitLiveAddrWrap a', function(a){return a.getAttribute('href')||'';});
      assert.ok(href.indexOf('https://www.google.com/maps/search/?api=1&query=')===0);
      const timer = await page.$eval('#visitLiveTimer', function(el){return el.textContent;});
      assert.ok(/^\d\d:\d\d:\d\d$/.test(timer), timer);
    });
    await shot('tasks', '08-eod-tasks.png', async function(){
      await page.waitForFunction(function(){return document.getElementById('visitDayScreen').classList.contains('active');});
      assert.strictEqual(await page.$eval('#visitTickAll', function(el){return el.textContent.trim();}), 'Tick all');
    });
    await shot('tasksall', '08-eod-tasks-tick-all.png', async function(){
      await page.waitForFunction(function(){return document.querySelector('#visitTaskList .eod-task.on');});
      assert.strictEqual(await page.$eval('#visitTickAll', function(el){return el.textContent.trim();}), 'Untick all');
    });
    await shot('report', '08a-eod-report.png', async function(){
      await page.waitForFunction(function(){return document.getElementById('visitReportScreen').classList.contains('active');});
      assert.strictEqual(await page.$eval('#visitReportGo', function(el){return el.disabled;}), true);
    });
    await shot('sign', '08aa-eod-signatures-empty.png', async function(){
      await page.waitForFunction(function(){return document.getElementById('visitSigScreen').classList.contains('active');});
      const hint = await page.$eval('#visitLockHint', function(el){return el.textContent;});
      assert.strictEqual(hint, 'Clock Out appears after both the caregiver and the client have signed.');
      assert.strictEqual(await page.$('#visitClockOutBtn'), null, 'clock out hidden until both sign');
      assert.strictEqual(await page.$eval('#visitClientPad', function(el){return el.dataset.locked;}), '1');
    });
    async function clearDock(sel){
      await page.evaluate(function(s){
        var box=document.querySelector(s);
        var dock=document.getElementById('bottomNav').getBoundingClientRect().height;
        var extra=box.getBoundingClientRect().bottom-(window.innerHeight-dock-8);
        window.scrollBy(0, Math.max(extra, 0)+120);
      }, sel);
    }
    await shot('locked', '08e-eod-clockout-locked.png', async function(){
      await page.waitForFunction(function(){
        const b=document.getElementById('visitClockOutBtn');
        return b && b.disabled;
      });
      const hint = await page.$eval('#visitTaskHint', function(el){return el.textContent;});
      assert.ok(hint.indexOf('at least one task')>=0);
      await clearDock('#visitClockOutBox');
    });
    await shot('ready', '08c-eod-clockout-ready.png', async function(){
      await page.waitForFunction(function(){
        const b=document.getElementById('visitClockOutBtn');
        return b && !b.disabled;
      });
      await clearDock('#visitClockOutBox');
    });

    page.on('pageerror', function(err){console.log('PAGE', err.message);});
    await page.goto(base+'&screen=home', {waitUntil:'domcontentloaded', timeout:20000});
    async function tap(sel){
      const ok=await page.evaluate(function(s){
        var el=document.querySelector(s);
        if(!el)return false;
        el.click();
        return true;
      }, sel);
      assert.ok(ok, 'missing '+sel);
    }
    await tap('#visitClockInBtn');
    await page.waitForFunction(function(){return document.getElementById('visitClockScreen').classList.contains('active');});
    await tap('#visitClockInGo');
    await page.waitForFunction(function(){return document.getElementById('visitInScreen').classList.contains('active');});
    await tap('#visitInScreen .btn-teal');
    await page.waitForFunction(function(){
      const live=document.getElementById('visitLive');
      return document.getElementById('caregiverScreen').classList.contains('active') && live && !live.hidden;
    });
    await tap('#visitDoneBtn');
    await page.waitForFunction(function(){return document.getElementById('visitDayScreen').classList.contains('active');});
    await tap('#visitTaskList .eod-task');
    await tap('#visitToReport');
    await page.waitForFunction(function(){return document.getElementById('visitReportScreen').classList.contains('active');});
    for(let i=0;i<3;i++){
      await page.evaluate(function(){
        var next=[].slice.call(document.querySelectorAll('#visitReportQs .yn-btn.no')).filter(function(b){return !b.classList.contains('on');})[0];
        if(next)next.click();
      });
    }
    await page.waitForFunction(function(){return document.getElementById('visitReportGo') && !document.getElementById('visitReportGo').disabled;});
    await page.click('#visitReportGo');
    await page.waitForFunction(function(){
      const c=document.getElementById('visitAidePad');
      return document.getElementById('visitSigScreen').classList.contains('active') && c && c.width>10;
    });
    await page.evaluate(function(){
      function ink(id){
        const c=document.getElementById(id);
        const ctx=c.getContext('2d');
        ctx.strokeStyle='#1a2744';ctx.lineWidth=4;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(16,60);ctx.lineTo(250,70);ctx.stroke();
      }
      ink('visitAidePad');
      visitCaptureInk('aide');
      visitSyncLocks();
      ink('visitClientPad');
      visitCaptureInk('client');
      visitSyncLocks();
    });
    await page.waitForFunction(function(){
      const b=document.getElementById('visitClockOutBtn');
      return b && !b.disabled;
    });
    const before = await page.evaluate(function(){return localStorage.getItem('evercare_visit_day1_preview.aide');});
    assert.strictEqual(before, null, 'preview does not save the visit');
    await tap('#visitClockOutBtn');
    await page.waitForFunction(function(){
      const live=document.getElementById('visitLive');
      return document.getElementById('cgHomeView') && document.getElementById('cgHomeView').style.display!=='none' && live && live.hidden;
    });
    const notes = await page.$eval('#cg_notes', function(el){return el.value;});
    assert.strictEqual(notes, '', 'timesheet comments stay empty');
    assert.strictEqual(await page.evaluate(function(){return localStorage.getItem('evercare_visit_day1_preview.aide');}), null);
    console.log('caregiver-visit-day1 browser checks ok');
    console.log('preview URL http://127.0.0.1:'+port+'/index.html?visitpreview=1');
  }finally{
    await browser.close();
    server.close();
  }
}

runBrowser().catch(function(err){
  console.error(err);
  process.exit(1);
});
