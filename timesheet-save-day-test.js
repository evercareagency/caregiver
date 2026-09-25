#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert.ok(!html.includes('Save This Day'), 'per-day Save This Day copy must be gone');
assert.ok(!html.includes('sbtn_'), 'per-day save button ids must be gone');
assert.ok(html.includes('id="saveDayBtn"'), 'Save Day control missing');
assert.ok(html.includes('onclick="saveActiveDay()"'), 'Save Day must use the relocated save path');
assert.ok(html.includes('>✓ Save Day</button>'), 'primary Save Day label missing');
assert.ok(html.includes('Check at least one service before saving.'), 'empty-service error copy missing');
assert.ok(html.includes('id="saveDaySvcErr"'), 'inline service error missing');
assert.ok(html.includes('function requireDayService'), 'service gate missing');
assert.ok(html.includes('function saveDayData'), 'existing saveDayData path must stay');
assert.ok(html.includes('function previewDay'), 'existing previewDay path must stay');

const matrixAt = html.indexOf('id="serviceMatrix"');
const saveAt = html.indexOf('id="saveDayBtn"');
const commentsAt = html.indexOf('Comments');
assert.ok(matrixAt > 0 && saveAt > matrixAt, 'Save Day must follow the service matrix');
assert.ok(commentsAt > saveAt, 'Save Day must stay before Comments');
assert.ok(!/class="day-body"[\s\S]{0,2500}saveDayBtn|Save This Day|previewDay\(/.test(html.slice(html.indexOf('id="dayBlocks"'), html.indexOf('id="serviceMatrix"'))),
  'day cards must not keep a save button');

assert.ok(html.includes('onclick="ackImportantNotice()"'), 'I Understand must record the ack');
assert.ok(html.includes('>I Understand</button>'), 'notice button copy must stay');
assert.ok(html.includes('Important Notice'), 'notice title must stay');
assert.ok(html.includes("sessionStorage.setItem(noticeAckStorageKey(),'1')"), 'notice ack must use sessionStorage');
assert.ok(html.includes('notice_ack_'), 'notice ack key must be namespaced');
assert.ok(/function caregiverLogout\(\)\{[^}]*clearNoticeAck\(/.test(html), 'logout must clear notice ack');
assert.ok(/freshLogin\)\{[\s\S]{0,180}clearNoticeAck\(/.test(html), 'fresh login must clear notice ack');
assert.ok(html.includes("id==='alertModal'&&typeof isNoticeAcked==='function'&&isNoticeAcked()"), 'acked notice must not re-open');
assert.ok(html.includes('if(!liveSvcs.length)'), 'saveDayData must refuse empty services');
assert.ok(/function previewDay\(i\)\{[\s\S]{0,220}requireDayService\(i\)/.test(html), 'previewDay must require a service');
assert.ok(html.includes('v=cgsave1'), 'cgsave1 marker missing');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgsave1">'), 'cgsave1 build stamp missing');
assert.ok(html.includes('function paintDayRowStatus'), 'collapsed day status sync missing');
assert.ok(html.includes('Filled · Signed'), 'filled and signed label missing');
assert.ok(html.includes('function snapshotDayDraft'), 'collapse must snapshot the day');
const refreshFn=html.slice(html.indexOf('function refreshSaveDayState'), html.indexOf('function saveActiveDay'));
assert.ok(refreshFn&&!refreshFn.includes("contains('open')"), 'Save Day state must not require the accordion to be open');
assert.ok(refreshFn.includes('saveTargetDayName'), 'Save button must name the target day');

console.log('static checks ok');

async function runBrowser(){
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
  await page.setRequestInterception(true);
  page.on('request',req=>{
    const u=req.url();
    if(/script\.google\.com|nominatim|fonts\.googleapis|fonts\.gstatic|gstatic\.com/.test(u))req.abort();
    else req.continue();
  });
  page.on('dialog',d=>d.accept());
  const rawUrl=process.env.CG_URL||'http://127.0.0.1:8765/index.html';
  const url=/[?&]sheets=1(?:&|$)/.test(rawUrl)?rawUrl:(rawUrl+(rawUrl.indexOf('?')>=0?'&':'?')+'sheets=1');
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
  await page.evaluate(()=>{
    const sess={username:'aide1',name:'Test Aide',loginAt:Date.now(),mustChangePassword:false,needsEmail:false};
    localStorage.setItem('cg_session',JSON.stringify(sess));
    sessionStorage.setItem('sandata_ack_session','1');
    sessionStorage.setItem('notice_ack_aide1','1');
  });
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>typeof saveActiveDay==='function'&&document.getElementById('dayBlocks')&&document.getElementById('dayBlocks').children.length===7,{timeout:20000});

  const result=await page.evaluate(()=>{
    const errors=[];
    const check=(cond,msg)=>{if(!cond)errors.push(msg);};
    const btn=document.getElementById('saveDayBtn');
    const err=document.getElementById('saveDaySvcErr');
    const matrix=document.getElementById('serviceMatrix');
    const card=btn.closest('.card');
    check(!!btn,'save button missing');
    check(card&&card.contains(matrix),'Save Day is not in the services card');
    check(matrix.compareDocumentPosition(btn)&Node.DOCUMENT_POSITION_FOLLOWING,'Save Day is not after the matrix');
    check(!document.querySelector('.day-body button.btn'),'a day card still has a save button');
    check(document.querySelectorAll('.matrix-section h3').length===6,'service sections changed');
    check(btn.disabled,'Save Day starts disabled before a day is open');
    check(err.style.display==='none','service error hidden until a day is open');

    document.getElementById('cgHomeView').style.display='none';
    document.getElementById('cgFormView').style.display='block';
    toggleDay(1);
    check(document.getElementById('dbody_1').classList.contains('open'),'Monday did not open');
    check(/Saving Monday/.test(document.getElementById('saveDayTarget').textContent),'target should name Monday');
    check(btn.disabled,'zero Monday services must disable Save Day');
    check(err.style.display==='block','zero services must show the inline error');
    check(err.textContent==='Check at least one service before saving.','error copy drifted');
    btn.style.transition='none';
    const grey=getComputedStyle(btn).backgroundColor;
    check(grey==='rgb(176, 181, 184)','disabled Save Day should be grey, got '+grey);

    const box=document.querySelector('#serviceMatrix input[data-day="1"]');
    box.checked=true;
    box.dispatchEvent(new Event('change'));
    check(!btn.disabled,'one Monday service must enable Save Day');
    check(getComputedStyle(btn).backgroundColor==='rgb(42, 127, 127)','enabled Save Day must be teal, got '+getComputedStyle(btn).backgroundColor);
    check(err.style.display==='none','error hides once a service is checked');

    toggleDay(2);
    check(/Saving Tuesday/.test(document.getElementById('saveDayTarget').textContent),'last opened day is the save target');
    check(btn.disabled,'Tuesday with zero services stays blocked');
    toggleDay(2);
    check(/Saving Monday/.test(document.getElementById('saveDayTarget').textContent),'closing Tuesday returns to open Monday');
    check(!btn.disabled,'Monday still has a service');

    document.getElementById('d1_date').value='2026-09-21';
    document.getElementById('d1_in').value='08:00';
    document.getElementById('d1_out').value='12:00';
    document.getElementById('d1_in').dispatchEvent(new Event('input'));
    ['sp_aide_1','sp_client_1'].forEach(function(id){
      const c=document.getElementById(id);
      const ctx=c.getContext('2d');
      ctx.strokeStyle='#1a2744';
      ctx.lineWidth=4;
      ctx.beginPath();
      ctx.moveTo(12,24);
      ctx.lineTo(140,78);
      ctx.stroke();
      persistPadSig(id);
    });
    toggleDay(1);
    check(!document.getElementById('dbody_1').classList.contains('open'),'Monday accordion should collapse');
    check(document.getElementById('dstat_1').textContent==='Filled · Signed','collapsed Monday must not stay Not filled');
    check(!/Not filled/.test(document.getElementById('dstat_1').textContent),'collapsed label stuck on Not filled');
    check(/Saving Monday/.test(document.getElementById('saveDayTarget').textContent),'collapsed Monday stays the save target');
    check(btn.textContent==='✓ Save Monday','Save button should name Monday');
    check(!btn.disabled,'Save Monday stays enabled after collapse when a service is checked');
    const drafted=getUserWeekData()[1]||{};
    check(drafted.tin==='08:00'&&drafted.tout==='12:00','collapse keeps times in the day model');
    check(!!drafted.aideSig&&!!drafted.clientSig,'collapse keeps both signatures in the day model');

    requireSandataAck=function(){return true;};
    requireClientSelected=function(){return true;};
    requireDaySignatures=function(){return true;};
    const preview=document.getElementById('previewModal');
    saveActiveDay();
    check(preview.classList.contains('show'),'Save Day must open the existing day preview');
    check(!document.getElementById('dbody_1').classList.contains('open'),'Save must not re-expand the collapsed day');
    check(/Monday/.test(document.getElementById('previewDayContent').textContent),'preview names the save target');
    check(/08:00/.test(document.getElementById('previewDayContent').textContent),'preview reads times while the day is collapsed');
    check(/✓ Signed/.test(document.getElementById('previewDayContent').textContent),'preview reads signatures while the day is collapsed');
    check(!/None checked/.test(document.getElementById('previewDayContent').textContent),'preview must list the checked service');
    closeModal('previewModal');

    box.checked=false;
    box.dispatchEvent(new Event('change'));
    check(btn.disabled,'clearing the only service disables Save Day');
    previewDay(1);
    check(!preview.classList.contains('show'),'previewDay must not open with zero services');
    const before=JSON.stringify(getUserWeekData());
    saveDayData(1,{date:'2026-09-21',tin:'08:00',tout:'12:00',hrs:'4:00',svcs:['Assist W/Bath-Bed/Tub/Shower'],aideSig:'x',clientSig:'y',aideSigInk:true,clientSigInk:true});
    check(JSON.stringify(getUserWeekData())===before,'empty matrix must not save');

    box.checked=true;
    box.dispatchEvent(new Event('change'));
    storedHasRealInk=function(){return true;};
    saveDayData(1,{date:'2026-09-21',tin:'08:00',tout:'12:00',hrs:'4:00',svcs:[],aideSig:'x',clientSig:'y',aideSigInk:true,clientSigInk:true,verified:null});
    const saved=getUserWeekData()[1];
    check(!!saved&&saved.savedAt,'a day with a service still saves through saveDayData');
    check(saved.svcs&&saved.svcs.length===1,'saved day keeps the checked service');
    check(!document.getElementById('dbody_1').classList.contains('open'),'successful save still closes the day');
    check(btn.disabled,'Save Day disables after the day closes');

    sessionStorage.removeItem('notice_ack_aide1');
    window._noticeAcked=false;
    openModal('alertModal');
    check(document.getElementById('alertModal').classList.contains('show'),'notice shows before ack');
    ackImportantNotice();
    check(!document.getElementById('alertModal').classList.contains('show'),'I Understand closes the notice');
    check(sessionStorage.getItem('notice_ack_aide1')==='1','ack stored in sessionStorage for this user');
    openModal('alertModal');
    check(!document.getElementById('alertModal').classList.contains('show'),'notice does not re-open after ack');
    toggleDay(1);
    const pad=document.getElementById('sp_aide_1');
    pad.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:30,clientY:40}));
    openModal('sandataModal');
    check(!document.getElementById('sandataModal').classList.contains('show'),'Sandata does not re-show after session ack');
    const id=createNewTimesheet();
    openTS(id);
    check(!document.getElementById('alertModal').classList.contains('show'),'opening a timesheet must not re-show the notice');
    check(!document.getElementById('sandataModal').classList.contains('show'),'opening a timesheet must not re-show Sandata');
    check(sessionStorage.getItem('notice_ack_aide1')==='1','ack survives opening a timesheet');
    caregiverLogout();
    check(!sessionStorage.getItem('notice_ack_aide1'),'logout clears notice ack');
    check(window._noticeAcked!==true,'logout clears the in-memory notice flag');
    return {errors,grey};
  });

  const shotDir='/tmp/cg-shots';
  fs.mkdirSync(shotDir,{recursive:true});
  await page.evaluate(()=>{
    const sess={username:'aide1',name:'Test Aide',loginAt:Date.now(),mustChangePassword:false,needsEmail:false};
    localStorage.setItem('cg_session',JSON.stringify(sess));
    sessionStorage.setItem('sandata_ack_session','1');
    sessionStorage.setItem('notice_ack_aide1','1');
  });
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>document.getElementById('dayBlocks')&&document.getElementById('dayBlocks').children.length===7,{timeout:20000});
  await page.evaluate(()=>{
    document.getElementById('cgHomeView').style.display='none';
    document.getElementById('cgFormView').style.display='block';
    toggleDay(1);
    document.getElementById('saveDayBtn').scrollIntoView({block:'end'});
  });
  await page.screenshot({path:path.join(shotDir,'save-day-blocked.png')});
  await page.evaluate(()=>{
    const box=document.querySelector('#serviceMatrix input[data-day="1"]');
    box.checked=true;
    box.dispatchEvent(new Event('change'));
    document.getElementById('saveDayBtn').scrollIntoView({block:'center'});
  });
  await page.screenshot({path:path.join(shotDir,'save-day-enabled.png')});
  await browser.close();
  if(result.errors.length){
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
  console.log('browser checks ok', result.grey);
}

runBrowser().catch(err=>{console.error(err);process.exit(1);});
