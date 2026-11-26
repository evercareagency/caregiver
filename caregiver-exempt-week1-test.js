#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/preview/aide-exempt-week.sql'), 'utf8');

function sliceBetween(src, startMark, endMark){
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, startMark);
  return src.slice(start, end);
}

const week = sliceBetween(html, 'id="exemptWeekScreen"', 'id="exemptReportScreen"');
const report = sliceBetween(html, 'id="exemptReportScreen"', 'id="exemptSignScreen"');
const sign = sliceBetween(html, 'id="exemptSignScreen"', 'id="exemptReadyScreen"');
const ready = sliceBetween(html, 'id="exemptReadyScreen"', 'id="exemptDoneScreen"');
const done = sliceBetween(html, 'id="exemptDoneScreen"', 'id="callOffScreen"');
const js = sliceBetween(html, '// exempt-week1', '</script>');
const form = sliceBetween(html, 'id="cgFormView"', 'id="cgSuccessView"');

assert.ok(week.includes('Exempt, manual entry'), 'exempt badge copy');
assert.ok(html.includes('Clock in at each visit'), 'regular chip copy');
assert.ok(html.includes('id="visitModeBar"'), 'regular chip lives on the home header');
assert.ok(week.includes('Tap a day to enter start and end times.'), 'day callout');
assert.ok(week.includes('Sample Client') && week.includes('Weekly hours'), 'sample client');
assert.ok(js.includes("holiday:'Thanksgiving'"), 'thanksgiving label only');
assert.ok(!/holiday pay|holidayPay|holiday_pay|pay multiplier/i.test(js + week + sql), 'no holiday pay');
assert.ok(report.includes('Anything to report this week?'), 'weekly report title');
assert.ok(report.includes('Before you submit'), 'weekly report subtitle');
assert.ok(js.includes('Was the member in the hospital or ER this week?'));
assert.ok(js.includes('Did the member fall or get hurt this week?'));
assert.ok(js.includes('Any change in how the member is doing this week?'));
assert.ok(js.includes('Tell us what happened'));
assert.ok(js.includes('Answer this question to continue.'));
assert.ok(ready.includes('Submit week') && ready.includes('id="exemptSubmitFinal"'));
assert.ok(done.includes('Timesheet submitted'));
assert.ok(done.includes('Thursday, Nov 26 · 1:34 PM'));
assert.ok(done.includes('Nothing really left this phone'));
assert.ok(done.includes('MOCK-1126'));
assert.ok(sign.includes('Then the caregiver signs') && sign.includes('Then the client signs'), 'both signature cards');
assert.ok(sign.includes('Sign here with your finger') && sign.includes('>Clear<'), 'draw pad and clear');
assert.ok(sign.includes('data-locked="1"'), 'client pad starts locked');
assert.ok(sign.includes('id="exemptSignGo"'), 'continue after both signatures');
assert.ok(!/unable to sign/i.test(sign) && !/>Type</.test(sign), 'draw only');
assert.ok(ready.includes('id="exemptReadySigs"') && done.includes('id="exemptDoneSigs"'), 'signature thumbnails');
assert.ok(!/flagged|sent to the office/i.test(week + report + sign + ready + done + js), 'no flagged or sent-to-the-office copy');
assert.ok(html.includes('exempt=1'), 'exempt preview flag');
assert.ok(!js.includes('localStorage') && !js.includes('doFinalSubmit') && !js.includes('saveDayData') && !js.includes('sbStampTimesheetSigs'), 'preview does not save or paint a timesheet');
assert.ok(form.includes('type="time" id="d${i}_in"') || html.includes('type="time" id="d${i}_in"'), 'timesheet time inputs stay on the timesheet');

assert.ok(sql.includes('NOT APPLIED'), 'sql is marked not applied');
assert.ok(sql.includes('time_entry_mode') && sql.includes('exempt_manual') && sql.includes('clock_in'));
assert.ok(sql.includes('exemption_reason') && sql.includes('exempt_effective_from'));
assert.ok(sql.includes('aide_manual_days') && sql.includes('aide_submit_exempt_week'));
assert.ok(sql.includes('caregiver_signature') && sql.includes('client_signature'), 'nullable signature columns');
assert.ok(sql.includes('public.aides'), 'caregiver row is aides');
assert.ok(sql.includes('not under supabase/migrations'), 'sql stays out of migrations');
assert.ok(!/\b(alter table|update|insert into|delete from)\s+public\.timesheets\b/i.test(sql), 'sql does not write timesheets');
assert.ok(!/holiday/i.test(sql) || /not stored here|no holiday-pay/i.test(sql));
assert.ok(sql.includes('clock_timestamp()'), 'submit time comes from the database');
assert.ok(/revoke all on function public\.aide_submit_exempt_week/i.test(sql));

console.log('caregiver-exempt-week1 static checks ok');

async function runBrowser(){
  if(process.env.SKIP_BROWSER==='1')return;
  let puppeteer;
  try{puppeteer=require('puppeteer-core');}
  catch(e){
    try{puppeteer=require('/tmp/visit-preview/node_modules/puppeteer-core');}
    catch(e2){
      console.log('caregiver-exempt-week1 browser skipped (no puppeteer-core)');
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
      const type = ext==='.ttf'?'font/ttf':ext==='.svg'?'image/svg+xml':ext==='.png'?'image/png':ext==='.js'?'text/javascript':'text/html; charset=utf-8';
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
  const outDir = '/opt/cursor/artifacts/exempt-week';
  fs.mkdirSync(outDir, {recursive:true});
  const base = 'http://127.0.0.1:'+port+'/index.html?visitpreview=1';
  const errors = [];
  try{
    const page = await browser.newPage();
    page.on('pageerror', function(err){errors.push(err.message);});
    await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    async function openExempt(screen){
      await page.goto(base+'&exempt=1&screen='+screen, {waitUntil:'domcontentloaded', timeout:20000});
      await page.waitForFunction(function(){return document.body.classList.contains('visit-exempt');}, {timeout:8000});
    }
    await openExempt('week');
    const weekText = await page.$eval('#exemptWeekScreen', function(el){return el.innerText;});
    assert.ok(weekText.indexOf('Exempt, manual entry')>=0);
    assert.ok(weekText.indexOf('18 h 00 m')>=0 && weekText.indexOf('18.00')>=0, weekText);
    assert.ok(weekText.indexOf('Thanksgiving')>=0);
    assert.ok(weekText.indexOf('3 of 7 days entered')>=0);
    assert.strictEqual(await page.$('#exemptWeekScreen #visitClockInBtn'), null);
    assert.ok(!/Clock In/.test(weekText), weekText);
    assert.strictEqual(await page.$eval('#exemptSubmitWeek', function(el){return el.disabled;}), false);
    await page.screenshot({path:path.join(outDir, '01-week-badge.png')});

    await openExempt('day');
    await page.waitForSelector('#exemptStart');
    const dayHours = await page.$eval('#exemptDayHours', function(el){return el.innerText;});
    assert.ok(dayHours.indexOf('4 h 00 m')>=0 && dayHours.indexOf('4.00')>=0, dayHours);
    assert.strictEqual(await page.$eval('#exemptStart', function(el){return el.value;}), '10:00');
    assert.strictEqual(await page.$eval('#exemptEnd', function(el){return el.value;}), '14:00');
    assert.ok((await page.$eval('#exemptSheet', function(el){return el.innerText;})).indexOf('Thanksgiving')>=0);
    await page.screenshot({path:path.join(outDir, '02-day-entry.png')});

    await openExempt('full');
    const fullText = await page.$eval('#exemptWeekScreen', function(el){return el.innerText;});
    assert.ok(fullText.indexOf('38.00')>=0 && fullText.indexOf('All 7 days entered')>=0, fullText);

    await openExempt('q1');
    const q1 = await page.$eval('#exemptReportScreen', function(el){return el.innerText;});
    assert.ok(q1.indexOf('Question 1 of 3')>=0);
    assert.ok(q1.indexOf('Was the member in the hospital or ER this week?')>=0);
    assert.ok(q1.indexOf('Answer this question to continue.')>=0);
    assert.strictEqual(await page.$eval('#exemptReportGo', function(el){return el.disabled;}), true);
    await page.screenshot({path:path.join(outDir, '03-q1.png')});

    await openExempt('q2');
    assert.ok((await page.$eval('#exemptReportScreen', function(el){return el.innerText;})).indexOf('Did the member fall or get hurt this week?')>=0);
    await openExempt('q3');
    assert.ok((await page.$eval('#exemptReportScreen', function(el){return el.innerText;})).indexOf('Any change in how the member is doing this week?')>=0);
    const sigDir = '/opt/cursor/artifacts/exempt-sign';
    fs.mkdirSync(sigDir, {recursive:true});
    await page.screenshot({path:path.join(sigDir, '01-q3.png')});
    await openExempt('sign');
    await page.waitForFunction(function(){
      var go=document.getElementById('exemptSignGo');
      var pad=document.getElementById('exemptClientPad');
      return document.getElementById('exemptSignScreen').classList.contains('active') && go && go.disabled && pad && pad.dataset.locked==='1';
    });
    await page.screenshot({path:path.join(sigDir, '02-sign-empty.png')});
    await page.evaluate(function(){
      function mark(id, label){
        var el=document.getElementById(id);
        var r=el.getBoundingClientRect();
        var d=document.createElement('div');
        d.setAttribute('data-ann','1');
        d.style.cssText='position:fixed;z-index:9999;border:4px solid #ff2a2a;border-radius:10px;pointer-events:none;box-shadow:0 0 0 3px #fff200;';
        d.style.left=(r.left-6)+'px';
        d.style.top=(r.top-6)+'px';
        d.style.width=(r.width+12)+'px';
        d.style.height=(r.height+12)+'px';
        var lab=document.createElement('div');
        lab.textContent=label;
        lab.style.cssText='position:absolute;left:-4px;top:-30px;background:#ff2a2a;color:#fff;font:800 15px/1.2 sans-serif;padding:5px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 0 #fff200;';
        d.appendChild(lab);
        document.body.appendChild(d);
      }
      mark('exemptAideLock', 'Caregiver signs here');
      mark('exemptClientLock', 'Client signs here');
    });
    await page.screenshot({path:path.join(sigDir, '02-sign-annotated.png')});
    await openExempt('signed');
    await page.waitForFunction(function(){
      function inked(id){
        var c=document.getElementById(id);
        if(!c||!c.width)return false;
        var data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
        for(var i=3;i<data.length;i+=24){if(data[i]>16)return true;}
        return false;
      }
      var go=document.getElementById('exemptSignGo');
      return go && !go.disabled && inked('exemptAidePad') && inked('exemptClientPad');
    });
    await page.screenshot({path:path.join(sigDir, '03-signed.png')});
    await openExempt('ready');
    await page.waitForFunction(function(){return document.querySelectorAll('#exemptReadySigs img').length===2;});
    assert.strictEqual(await page.$eval('#exemptSubmitFinal', function(el){return el.disabled;}), false);
    assert.strictEqual(await page.$eval('#exemptReadyHours', function(el){return el.textContent;}), '38.00');
    await page.screenshot({path:path.join(sigDir, '04-ready.png')});

    await openExempt('submitted');
    const doneText = await page.$eval('#exemptDoneScreen', function(el){return el.innerText;});
    assert.ok(doneText.indexOf('Timesheet submitted')>=0);
    assert.ok(doneText.indexOf('MOCK-1126')>=0);
    assert.ok(doneText.indexOf('38.00')>=0);
    assert.ok(doneText.indexOf('7 of 7')>=0);
    assert.ok(doneText.indexOf('Nothing really left this phone')>=0);
    assert.ok(!/flagged|sent to the office/i.test(doneText));
    assert.strictEqual(await page.$$eval('#exemptDoneSigs img', function(list){return list.length;}), 2);
    await page.screenshot({path:path.join(outDir, '04-submitted.png')});
    await page.screenshot({path:path.join(sigDir, '05-submitted.png')});

    await page.goto(base+'&exempt=0&screen=home', {waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForFunction(function(){
      var bar=document.getElementById('visitModeBar');
      return document.body.classList.contains('visit-preview') && !document.body.classList.contains('visit-exempt') && bar && !bar.hidden;
    }, {timeout:8000});
    const homeText = await page.$eval('#caregiverScreen', function(el){return el.innerText;});
    assert.ok(homeText.indexOf('Clock in at each visit')>=0, homeText);
    assert.ok(homeText.indexOf('Clock In')>=0, homeText);
    assert.ok(homeText.indexOf('For all call-offs, call the office')>=0);
    await page.screenshot({path:path.join(outDir, '05-regular-clock-home.png')});

    await openExempt('week');
    await page.evaluate(function(){
      document.querySelector('#exemptDayList [data-day="thu"]').click();
    });
    await page.waitForSelector('#exemptStart');
    assert.strictEqual(await page.$eval('#exemptStart', function(el){return el.value;}), '');
    await page.$eval('#exemptStart', function(el){el.value='10:00';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.$eval('#exemptEnd', function(el){el.value='09:00';el.dispatchEvent(new Event('input',{bubbles:true}));});
    const zero = await page.$eval('#exemptDayHours', function(el){return el.innerText;});
    assert.ok(zero.indexOf('0.00')>=0, zero);
    const beforeThu = await page.$eval('#exemptDayList [data-day="thu"]', function(el){return el.innerText;});
    await page.evaluate(function(){document.querySelector('.xw-actions .btn-teal').click();});
    await new Promise(function(r){setTimeout(r, 200);});
    assert.ok(await page.$('#exemptStart'), 'end before start stays on the sheet');
    const afterThu = await page.$eval('#exemptDayList [data-day="thu"]', function(el){return el.innerText;});
    assert.strictEqual(afterThu, beforeThu, 'end before start does not save');
    await page.$eval('#exemptEnd', function(el){el.value='14:00';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.$eval('#exemptNote', function(el){el.value='Worked morning only';el.dispatchEvent(new Event('input',{bubbles:true}));});
    const four = await page.$eval('#exemptDayHours', function(el){return el.innerText;});
    assert.ok(four.indexOf('4.00')>=0 && four.indexOf('4 h 00 m')>=0, four);
    await page.evaluate(function(){document.querySelector('.xw-actions .btn-teal').click();});
    await page.waitForFunction(function(){
      var row=document.querySelector('#exemptDayList [data-day="thu"]');
      return row && row.innerText.indexOf('4.00 h')>=0;
    });
    const total = await page.$eval('#exemptWeekFoot', function(el){return el.innerText;});
    assert.ok(total.indexOf('22.00')>=0 && total.indexOf('4 of 7')>=0, total);
    await page.evaluate(function(){document.getElementById('exemptSubmitWeek').click();});
    await page.waitForFunction(function(){return document.getElementById('exemptReportScreen').classList.contains('active');});
    assert.strictEqual(await page.$eval('#exemptReportGo', function(el){return el.disabled;}), true);
    await page.evaluate(function(){document.querySelector('#exemptReportBody .xw-choice.yes').click();});
    await page.waitForFunction(function(){return document.querySelector('#exemptReportBody textarea');});
    assert.strictEqual(await page.$eval('#exemptReportGo', function(el){return el.disabled;}), true);
    assert.ok((await page.$eval('#exemptReportScreen', function(el){return el.innerText;})).indexOf('Tell us what happened.')>=0);
    await page.type('#exemptReportBody textarea', 'Left for a checkup');
    await page.waitForFunction(function(){return document.getElementById('exemptReportGo') && !document.getElementById('exemptReportGo').disabled;});
    await page.evaluate(function(){document.getElementById('exemptReportGo').click();});
    await page.waitForFunction(function(){
      return document.getElementById('exemptReportScreen').innerText.indexOf('fall or get hurt')>=0;
    });
    assert.strictEqual(await page.$eval('#exemptReportGo', function(el){return el.disabled;}), true);
    await page.evaluate(function(){document.querySelector('#exemptReportBody .xw-choice.no').click();});
    await page.waitForFunction(function(){return document.getElementById('exemptReportGo') && !document.getElementById('exemptReportGo').disabled;});
    await page.evaluate(function(){document.getElementById('exemptReportGo').click();});
    await page.waitForFunction(function(){
      return document.getElementById('exemptReportScreen').innerText.indexOf('change in how the member is doing')>=0;
    });
    assert.strictEqual(await page.$eval('#exemptReadyScreen', function(el){return el.classList.contains('active');}), false, 'submit stays off until the last answer');
    assert.strictEqual(await page.$eval('#exemptReportGo', function(el){return el.disabled;}), true);
    await page.evaluate(function(){document.querySelector('#exemptReportBody .xw-choice.no').click();});
    await page.waitForFunction(function(){return document.getElementById('exemptReportGo') && !document.getElementById('exemptReportGo').disabled;});
    await page.evaluate(function(){document.getElementById('exemptReportGo').click();});
    await page.waitForFunction(function(){
      var go=document.getElementById('exemptSignGo');
      var pad=document.getElementById('exemptClientPad');
      return document.getElementById('exemptSignScreen').classList.contains('active') && go && go.disabled && pad && pad.dataset.locked==='1';
    });
    await page.evaluate(function(){
      function stroke(id){
        var c=document.getElementById(id);
        var ctx=c.getContext('2d');
        ctx.strokeStyle='#1a2744';ctx.lineWidth=4;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(16,60);ctx.lineTo(260,72);ctx.stroke();
      }
      stroke('exemptAidePad');
      exemptCapturePad('aide');
      stroke('exemptClientPad');
      exemptCapturePad('client');
    });
    await page.waitForFunction(function(){
      var go=document.getElementById('exemptSignGo');
      return go && !go.disabled;
    });
    await page.evaluate(function(){document.getElementById('exemptSignGo').click();});
    await page.waitForFunction(function(){
      var b=document.getElementById('exemptSubmitFinal');
      return document.getElementById('exemptReadyScreen').classList.contains('active') && b && !b.disabled && document.querySelectorAll('#exemptReadySigs img').length===2;
    });
    const notes = await page.$eval('#cg_notes', function(el){return el.value;});
    assert.strictEqual(notes, '', 'report answers do not land on the timesheet');
    const stored = await page.evaluate(function(){
      var keys=[];
      for(var i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
      return keys.filter(function(k){return /exempt|manual_day|MOCK-1126/i.test(k);});
    });
    assert.deepStrictEqual(stored, []);
    await page.evaluate(function(){document.getElementById('exemptSubmitFinal').click();});
    await page.waitForFunction(function(){return document.getElementById('exemptDoneScreen').classList.contains('active');});
    const liveDone = await page.$eval('#exemptDoneScreen', function(el){return el.innerText;});
    assert.ok(liveDone.indexOf('22.00')>=0, liveDone);
    assert.ok(liveDone.indexOf('MOCK-1126')>=0);
    assert.strictEqual(await page.$$eval('#exemptDoneSigs img', function(list){return list.length;}), 2);
    assert.strictEqual(await page.$eval('#cg_notes', function(el){return el.value;}), '');
    assert.ok(!errors.length, errors.join('\n'));
    console.log('caregiver-exempt-week1 browser checks ok');
    console.log('preview URL http://127.0.0.1:'+port+'/index.html?visitpreview=1&exempt=1&screen=week');
  }finally{
    await browser.close();
    server.close();
  }
}

runBrowser().catch(function(err){
  console.error(err);
  process.exit(1);
});
