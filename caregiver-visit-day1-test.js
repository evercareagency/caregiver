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
const day = sliceBetween(html, 'id="visitDayScreen"', 'id="callOffScreen"');
const visitJs = html.slice(html.lastIndexOf('var VISIT_OFFICE_DISPLAY'), html.lastIndexOf('</script>'));
const form = sliceBetween(html, 'id="cgFormView"', 'id="cgSuccessView"');

assert.ok(home.includes('id="visitHomeCard"'), 'home visit card');
assert.ok(home.includes('id="visitClockInBtn"'), 'clock in button');
assert.ok(home.includes('For all call-offs, call the office'), 'call-off line');
assert.ok(home.includes('tel:+12163775991') && home.includes('(216) 377-5991'), 'configured office number');
assert.ok(!home.includes('id="callOffHomeBtn"') && !home.includes('>Call off</button>'), 'no call-off control on home');
assert.ok(home.includes('id="visitLiveName"') && home.includes('id="visitLiveTimer"'), 'in-progress name and timer');
assert.ok(home.includes('Booked until'), 'booked until label');
assert.ok(home.includes('id="visitLiveNote"'), 'care note');
assert.ok(home.includes('>Done for the day<'), 'done for the day');

assert.ok(clock.includes('You cannot edit it'), 'clock time is not editable');
assert.ok(!/type="time"/.test(clock), 'clock in has no time input');
assert.ok(clock.includes('For all call-offs, call the office'), 'call-off line under clock in');

assert.ok(day.includes('>Tick all<') && day.includes('>Untick all<'), 'tick all and untick all');
assert.ok(day.includes('Anything to report today?'), 'report question');
assert.ok(day.includes('This note is not written on the timesheet.'), 'note stays off the timesheet');
assert.ok(day.includes('Hand the phone to the client or a family member to sign.'), 'hand-off copy');
assert.ok(day.includes('Clock Out appears after both the caregiver and the client have signed.'), 'lock hint');
assert.ok(day.includes('>Clock Out<'), 'clock out label');
assert.ok(day.includes('id="visitClockOutBtn" hidden'), 'clock out starts hidden');
assert.ok(day.includes('data-locked="1"'), 'client pad starts locked');
assert.ok(day.includes('>Clear<'), 'both pads have clear');
assert.ok(!/unable to sign/i.test(day), 'no unable-to-sign option');
assert.ok(!/type="time"/.test(day), 'day flow has no time input');
assert.ok(!/>Type</.test(day) && !/Type to sign/i.test(day), 'no type option');
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
    const url = (req.url||'/').split('?')[0];
    const file = path.join(root, url==='/'?'index.html':url.replace(/^\//,''));
    if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
    fs.readFile(file, function(err, buf){
      if(err){res.writeHead(404);res.end('missing');return;}
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
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
  const outDir = '/opt/cursor/artifacts/visit-day';
  fs.mkdirSync(outDir, {recursive:true});
  try{
    const page = await browser.newPage();
    await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    page.on('dialog', function(d){d.accept();});
    await page.goto('http://127.0.0.1:'+port+'/index.html?sheets=1', {waitUntil:'domcontentloaded', timeout:20000});
    await page.evaluate(function(){
      localStorage.setItem('cg_session', JSON.stringify({
        username:'preview.aide',
        name:'Preview Aide',
        loginAt:Date.now()-60*1000,
        mustChangePassword:false,
        needsEmail:false
      }));
      sessionStorage.setItem('sandata_ack_session','1');
      sessionStorage.setItem('notice_ack_preview.aide','1');
    });
    await page.reload({waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForFunction(function(){
      return document.getElementById('caregiverScreen').classList.contains('active')
        && document.getElementById('visitCalloffLine');
    }, {timeout:8000});
    const banned = await page.$eval('#cgHomeView', function(el){return el.innerText;});
    assert.ok(!/flagged/i.test(banned), 'home text does not say flagged');
    assert.ok(!/sent to the office/i.test(banned), 'home text does not say sent to the office');
    assert.ok(banned.indexOf('Call off')<0, 'home does not offer Call off');
    assert.ok(banned.indexOf('For all call-offs, call the office')>=0, 'home call-off line');
    await page.screenshot({path:path.join(outDir, '01-home-clock-in-390.png')});

    await page.click('#visitClockInBtn');
    await page.waitForFunction(function(){
      return document.getElementById('visitClockScreen').classList.contains('active');
    }, {timeout:5000});
    await page.evaluate(function(){
      myClients = [{
        id:'sample-client',
        name:'Sample Client',
        address:'100 Example St, Cleveland, OH 44129',
        careNote:'Sample care note. Likes a quiet visit.'
      }];
      visitPickId = 'sample-client';
      visitShiftByClient = {
        'sample-client': {
          clientId:'sample-client',
          endLocal:'15:00',
          address:'100 Example St, Cleveland, OH 44129',
          careNote:'Sample care note. Likes a quiet visit.',
          tasks:[
            {id:'task-a', label:'Sample task A', checked:false},
            {id:'task-b', label:'Sample task B', checked:false}
          ]
        }
      };
      visitPaintClients();
    });
    const clockText = await page.$eval('#visitClockScreen', function(el){return el.innerText;});
    assert.ok(clockText.indexOf('You cannot edit it')>=0, 'clock screen says the time cannot be edited');
    assert.ok(clockText.indexOf('For all call-offs, call the office')>=0, 'clock screen has the office line');
    assert.strictEqual(await page.$('#visitClockScreen input[type="time"]'), null, 'no time field on clock in');
    await page.screenshot({path:path.join(outDir, '02-clock-in-390.png')});

    await page.click('#visitClockInGo');
    await page.waitForFunction(function(){
      const live = document.getElementById('visitLive');
      return document.getElementById('caregiverScreen').classList.contains('active') && live && !live.hidden;
    }, {timeout:5000});
    const liveText = await page.$eval('#visitLive', function(el){return el.innerText;});
    assert.ok(liveText.indexOf('Sample Client')>=0, 'client name');
    assert.ok(liveText.indexOf('Booked until')>=0 && liveText.indexOf('3:00 PM')>=0, 'booked until end');
    assert.ok(liveText.indexOf('Sample care note')>=0, 'care note');
    const href = await page.$eval('#visitLiveAddrWrap a', function(a){return a.getAttribute('href')||'';});
    assert.ok(href.indexOf('https://www.google.com/maps/search/?api=1&query=')===0, 'maps search link');
    assert.ok(href.indexOf('100%20Example%20St')>=0, 'address is the search query');
    const timer = await page.$eval('#visitLiveTimer', function(el){return el.textContent;});
    assert.ok(/^\d+:\d\d:\d\d$/.test(timer), 'elapsed timer '+timer);
    await page.screenshot({path:path.join(outDir, '03-visit-in-progress-390.png')});

    await page.click('#visitDoneBtn');
    await page.waitForFunction(function(){
      return document.getElementById('visitDayScreen').classList.contains('active');
    }, {timeout:5000});
    await page.waitForFunction(function(){
      const c = document.getElementById('visitAidePad');
      return c && c.width > 10;
    }, {timeout:5000});
    const before = await page.evaluate(function(){
      return {
        out:document.getElementById('visitClockOutBtn').hidden,
        outDisplay:getComputedStyle(document.getElementById('visitClockOutBtn')).display,
        hint:document.getElementById('visitLockHint').textContent,
        locked:document.getElementById('visitClientPad').dataset.locked,
        times:document.querySelectorAll('#visitDayScreen input[type="time"]').length,
        typeBtn:[].some.call(document.querySelectorAll('#visitDayScreen button'), function(b){return b.textContent.trim()==='Type';}),
        unable:/unable to sign/i.test(document.getElementById('visitDayScreen').innerText)
      };
    });
    assert.strictEqual(before.out, true, 'clock out hidden before signatures');
    assert.strictEqual(before.outDisplay, 'none', 'clock out is not painted before signatures');
    assert.strictEqual(before.hint, 'Clock Out appears after both the caregiver and the client have signed.');
    assert.strictEqual(before.locked, '1', 'client pad locked');
    assert.strictEqual(before.times, 0, 'no editable clock time');
    assert.strictEqual(before.typeBtn, false, 'no type option');
    assert.strictEqual(before.unable, false, 'no unable option');
    await page.screenshot({path:path.join(outDir, '04-day-tasks-390.png')});
    await page.evaluate(function(){
      document.getElementById('visitHandHint').scrollIntoView({block:'start'});
    });
    await page.screenshot({path:path.join(outDir, '04-signatures-locked-390.png')});

    await page.click('#visitTickAll');
    const ticked = await page.$$eval('#visitTaskList input', function(nodes){return nodes.map(function(n){return n.checked;});});
    assert.deepStrictEqual(ticked, [true, true], 'tick all checks every task');
    await page.click('#visitUntickAll');
    const unticked = await page.$$eval('#visitTaskList input', function(nodes){return nodes.every(function(n){return !n.checked;});});
    assert.strictEqual(unticked, true, 'untick all clears every task');
    await page.click('#visitTaskList input');

    await page.evaluate(function(){
      const c = document.getElementById('visitAidePad');
      const ctx = c.getContext('2d');
      ctx.strokeStyle = '#1a2744';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(12, 70);
      ctx.lineTo(260, 80);
      ctx.stroke();
      visitCaptureInk('aide');
      visitSyncLocks();
    });
    const mid = await page.evaluate(function(){
      return {
        clientLocked:document.getElementById('visitClientPad').dataset.locked,
        out:document.getElementById('visitClockOutBtn').hidden
      };
    });
    assert.strictEqual(mid.clientLocked, '0', 'client pad unlocks after the caregiver signs');
    assert.strictEqual(mid.out, true, 'clock out still hidden until the client signs');

    await page.type('#visitOfficeNote', 'Sample note for the preview.');
    await page.evaluate(function(){
      const c = document.getElementById('visitClientPad');
      const ctx = c.getContext('2d');
      ctx.strokeStyle = '#1a2744';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(16, 60);
      ctx.lineTo(240, 90);
      ctx.stroke();
      visitCaptureInk('client');
      visitSyncLocks();
    });
    const ready = await page.evaluate(function(){
      const btn = document.getElementById('visitClockOutBtn');
      return {hidden:btn.hidden, text:btn.textContent.trim(), hint:document.getElementById('visitLockHint').hidden};
    });
    assert.strictEqual(ready.hidden, false, 'clock out appears');
    assert.strictEqual(ready.text, 'Clock Out');
    assert.strictEqual(ready.hint, true, 'lock hint hides once both have signed');
    await page.evaluate(function(){
      document.getElementById('visitClockOutBtn').scrollIntoView({block:'center'});
    });
    await page.screenshot({path:path.join(outDir, '05-clock-out-ready-390.png')});

    const noteOnPhone = await page.evaluate(function(){return visitOpen && visitOpen.officeNote;});
    assert.strictEqual(noteOnPhone, 'Sample note for the preview.');
    await page.click('#visitClockOutBtn');
    await page.waitForFunction(function(){
      const live = document.getElementById('visitLive');
      return document.getElementById('cgHomeView').style.display !== 'none' && live && live.hidden;
    }, {timeout:5000});
    const stored = await page.evaluate(function(){
      const keys = [];
      for(let i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
      const week = keys.filter(function(k){return k.indexOf('wd_')===0;}).map(function(k){return localStorage.getItem(k)||'';}).join('\n');
      return {
        weekHasNote:week.indexOf('Sample note for the preview.')>=0,
        openVisit:localStorage.getItem('evercare_visit_day1_preview.aide')
      };
    });
    assert.strictEqual(stored.weekHasNote, false, 'the report is not in week storage');
    assert.strictEqual(stored.openVisit, null, 'the open visit is closed');

    await page.click('#bottomNav button[data-nav="timesheet"]');
    await page.waitForFunction(function(){
      const form = document.getElementById('cgFormView');
      return form && form.style.display==='block';
    }, {timeout:5000});
    const timesheet = await page.evaluate(function(){
      const notes = document.getElementById('cg_notes');
      return {
        notes:notes ? notes.value : null,
        timeInputs:document.querySelectorAll('#cgFormView input[type="time"]').length,
        confirm:document.querySelectorAll('#cgFormView .sig-act-confirm').length
      };
    });
    assert.strictEqual(timesheet.notes, '', 'timesheet comments stay empty');
    assert.ok(timesheet.timeInputs >= 2, 'timesheet time inputs stay');
    assert.ok(timesheet.confirm >= 2, 'timesheet signature confirm stays');
    await page.screenshot({path:path.join(outDir, '06-timesheet-unchanged-390.png')});
    console.log('caregiver-visit-day1 browser checks ok');
  }finally{
    await browser.close();
    server.close();
  }
}

runBrowser().catch(function(err){
  console.error(err);
  process.exit(1);
});
