#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const {spawn} = require('child_process');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const CLIENT = 'af44b579-5881-46ea-8cb8-83a33c0af200';

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

assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-cg-pdf-view v=cgpdfv1 —'), 'cg pdf view marker');
assert.ok(html.includes('v=cgpdfv1'), 'cg pdf view probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-cg-pdf-view">'), 'cg pdf view meta');
assert.ok(html.includes('v=cgpdf1'), 'letter pdf marker stays');
assert.ok(html.includes('v=bakuuid1'), 'backup uuid marker stays');
assert.ok(html.includes('v=home1'), 'save-home marker stays');
assert.ok(html.includes('v=nocert1'), 'nocert marker stays');
assert.ok(html.includes('v=sbseal1'), 'auth seal marker stays');
assert.ok(html.includes('v=offline1'), 'offline marker stays');
assert.ok(html.includes('const TS_PDF_PAGE_SLACK_PT=14;'), '14pt slack stays');

const btnAt = html.indexOf('id="viewPdfBtn"');
const saveAt = html.indexOf('id="saveDayBtn"');
const submitAt = html.indexOf('id="cgSubmitBtn"');
assert.ok(btnAt > saveAt && btnAt < submitAt, 'View PDF sits on the timesheet after Save Day');
assert.ok(html.includes('>View PDF</button>'), 'View PDF label');
assert.ok(/id="viewPdfBtn"[^>]*style="display:none/.test(html), 'View PDF starts hidden');
assert.ok(html.includes('id="viewPdfFrame"'), 'on-page PDF frame');
assert.ok(!html.includes('cloudBackupId') || !extractFn(html, 'function cgPaintViewPdf()').includes('cloudBackupId'), 'View PDF is not gated on cloudBackupId');
assert.ok(!extractFn(html, 'function viewSavedTimesheetPdf()').includes('pdf_storage_path'), 'View PDF is not gated on pdf_storage_path');
assert.ok(!extractFn(html, 'async function renderISList()').includes('View PDF'), 'inservice list does not gain View PDF');
assert.ok(!/Print Certificate|View Cert/i.test(extractFn(html, 'async function renderISList()')), 'aide cert strip stays absent');

const save = extractFn(html, 'function saveDayData(i,dayObj)');
assert.ok(save.includes('cgNoteSavedDayPdf'), 'Save Day notes the PDF');
assert.ok(!save.includes('showCaregiverHome'), 'Save Day stays off Home');
assert.ok(!save.includes('backToTSHome'), 'Save Day stays on the timesheet');
const sync = extractFn(html, 'function sbSyncSavedDay(i,dayObj)');
assert.ok(sync.includes('sbRefreshTimesheetPdf(row.id)'), 'Save Day still refreshes the office PDF');
const write = extractFn(html, 'async function sbWriteTimesheetPdf(timesheetId,record)');
assert.ok(write.includes('window.__cgViewPdfBlob'), 'a produced PDF blob is kept for View PDF');
assert.ok(write.includes('renderTimesheetPdfBlob'), 'Save Day PDF still uses the letter overlay');
const view = extractFn(html, 'async function viewSavedTimesheetPdf()');
assert.ok(view.includes('cgRenderSavedTimesheetPdf'), 'View PDF renders the saved timesheet');
assert.ok(view.includes('cgShowTimesheetPdf'), 'View PDF shows the blob');
assert.ok(view.includes('Pick a client first.'), 'sb view still requires a real client');
const render = extractFn(html, 'async function renderTimesheetPdfBlob(r)');
assert.ok(render.includes('windowWidth:sheetW') && render.includes('windowHeight:sheetH'), 'locked capture stays');
assert.ok(render.includes("html2canvas(container,{scale:1,useCORS:true,backgroundColor:'#ffffff'})"), 'capture falls back if the lock fails');
const jpeg = extractFn(html, 'function sbJpegLetterPdf(canvas,quality)');
assert.ok(jpeg.includes('getNumberOfPages()>1'), 'extra pages are still dropped');
assert.ok(jpeg.includes('catch(e){}'), 'a deletePage error does not drop the blob');

function pdfPages(bytes){
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for(let i = 0; i < u8.length; i++)s += String.fromCharCode(u8[i]);
  return {
    magic: s.slice(0, 5),
    pages: (s.match(/\/Type\s*\/Page(?!s)/g) || []).length,
    media: (s.match(/\/MediaBox\s*\[[^\]]+\]/g) || [])
  };
}

function el(id){
  return {
    id: id,
    hidden: true,
    disabled: false,
    textContent: id === 'viewPdfBtn' ? 'View PDF' : '',
    style: {display: id === 'viewPdfBtn' || id === 'viewPdfPanel' ? 'none' : ''},
    src: ''
  };
}

function runView(opts){
  const els = {viewPdfBtn: el('viewPdfBtn'), viewPdfFrame: el('viewPdfFrame'), viewPdfPanel: el('viewPdfPanel')};
  const msgs = [];
  const opened = [];
  const box = {
    document: {
      getElementById: function(id){return els[id] || null;},
      createElement: function(){
        return {href:'', target:'', click: function(){opened.push('anchor');}, remove: function(){}};
      },
      body: {appendChild: function(){}, removeChild: function(){}}
    },
    window: {},
    URL: {
      createObjectURL: function(){return 'blob:timesheet-pdf';},
      revokeObjectURL: function(){}
    },
    Blob: function Blob(parts, init){this.parts = parts; this.type = init && init.type; this.size = 2048;},
    currentTS: 'ts_local',
    currentUser: {username:'aide.one', name:'Aide One'},
    getUserWeekData: function(){return opts.days || {};},
    getSelectedClient: function(){return opts.client || null;},
    getAllTimesheets: function(){return opts.timesheets || [];},
    evercareSbEnabled: function(){return opts.sb !== false;},
    cgShouldSyncNow: function(){return !!opts.syncing;},
    sbIsUuid: function(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||'').trim());},
    showTempMsg: function(msg){msgs.push(msg);},
    sbEnsurePdfLibs: async function(){return opts.libs !== false;},
    sbTimesheetPdfRecord: function(days){box.recordDays = days; return {days: days, clientName:'Ada'};},
    renderTimesheetPdfBlob: async function(){
      box.rendered = (box.rendered || 0) + 1;
      if(opts.renderFail)throw new Error('blank form');
      const raw = opts.pdfText || ('%PDF-1.4\n1 0 obj\n<</Type /Page\n/MediaBox [0 0 612 792]>>\nendobj\n' + 'x'.repeat(1100));
      const u8 = new Uint8Array(raw.length);
      for(let i = 0; i < raw.length; i++)u8[i] = raw.charCodeAt(i) & 255;
      u8.size = u8.byteLength;
      return u8;
    },
    sbPdfMagicOk: async function(b){
      if(!b)return false;
      const n = b[0];
      return n === 0x25;
    },
    sbPdfSize: function(b){return b && (b.size || b.byteLength) || 0;}
  };
  box.window = box;
  vm.createContext(box);
  const src = [
    extractFn(html, 'function cgWeekHasSavedDay(wd)'),
    extractFn(html, 'function cgPaintViewPdf()'),
    extractFn(html, 'function cgClientUuidForPdf()'),
    extractFn(html, 'async function cgRenderSavedTimesheetPdf()'),
    extractFn(html, 'function cgShowTimesheetPdf(blob)'),
    extractFn(html, 'function cgNoteSavedDayPdf()'),
    extractFn(html, 'async function viewSavedTimesheetPdf()')
  ].join('\n');
  vm.runInContext(src, box);
  box._els = els;
  box._msgs = msgs;
  box._opened = opened;
  return box;
}

(async function(){
  const empty = runView({days:{}});
  vm.runInContext('cgPaintViewPdf()', empty);
  assert.strictEqual(empty._els.viewPdfBtn.style.display, 'none', 'no saved day hides View PDF');
  const missed = await vm.runInContext('viewSavedTimesheetPdf()', empty);
  assert.strictEqual(missed, null, 'View PDF does nothing before a day is saved');
  assert.ok(empty._msgs.indexOf('Save a day first.') >= 0, 'asks for a saved day');
  assert.strictEqual(empty.rendered, undefined, 'no render before a saved day');

  const savedDay = {1:{date:'2026-09-21', tin:'08:00', tout:'12:00', hrs:'4:00', svcs:['Bathing'], savedAt:'now', aideSig:'a', clientSig:'c'}};
  const blocked = runView({days:savedDay, client:null, sb:true});
  vm.runInContext('cgNoteSavedDayPdf()', blocked);
  assert.strictEqual(blocked._els.viewPdfBtn.style.display, 'block', 'saved day shows View PDF without a cloud id');
  assert.strictEqual(blocked._els.viewPdfBtn.textContent, 'View PDF');
  const blockedBlob = await vm.runInContext('viewSavedTimesheetPdf()', blocked);
  assert.strictEqual(blockedBlob, null, 'sb view without a client uuid does not open a PDF');
  assert.ok(blocked._msgs.indexOf('Pick a client first.') >= 0, 'missing client uses the backup sentence');

  const ready = runView({
    days: savedDay,
    client: {id: CLIENT, name: 'Ada Client'},
    sb: true,
    syncing: false
  });
  vm.runInContext('cgNoteSavedDayPdf()', ready);
  await new Promise(function(r){setTimeout(r, 20);});
  assert.ok(ready.rendered >= 1, 'Save Day path renders a PDF when upload is not running');
  assert.ok(ready.window.__cgViewPdfBlob, 'Save Day keeps the blob');
  const info = pdfPages(ready.window.__cgViewPdfBlob);
  assert.strictEqual(info.magic, '%PDF-', 'Save Day blob is a PDF');
  assert.strictEqual(info.pages, 1, 'Save Day blob is one page');
  assert.ok(/612 792/.test(info.media.join(' ')), 'Save Day blob is Letter');
  const opened = await vm.runInContext('viewSavedTimesheetPdf()', ready);
  assert.ok(opened, 'View PDF returns the blob');
  assert.strictEqual(ready._els.viewPdfFrame.src, 'blob:timesheet-pdf', 'View PDF points the frame at the blob');
  assert.strictEqual(ready._els.viewPdfPanel.style.display, 'block', 'View PDF panel is shown');
  assert.strictEqual(ready._els.viewPdfBtn.textContent, 'View PDF', 'button label returns after open');
  assert.ok(ready._msgs.indexOf('PDF ready.') >= 0, 'View PDF confirms');

  const online = runView({days:savedDay, client:{id:CLIENT, name:'Ada'}, sb:true, syncing:true});
  vm.runInContext('cgNoteSavedDayPdf()', online);
  await new Promise(function(r){setTimeout(r, 20);});
  assert.strictEqual(online.rendered, undefined, 'online Save Day leaves the blob to the upload refresh');
  assert.strictEqual(online._els.viewPdfBtn.style.display, 'block', 'online Save Day still shows View PDF');

  await headlessLetter();
  console.log('caregiver-pdf-view checks ok');
})().catch(function(err){
  console.error(err);
  process.exit(1);
});

function startServer(){
  return new Promise(function(resolve){
    const srv = http.createServer(function(req, res){
      const rel = decodeURIComponent((req.url || '/').split('?')[0]);
      const file = path.join(__dirname, rel === '/' ? 'index.html' : rel.replace(/^\/+/, ''));
      if(!file.startsWith(__dirname)){res.writeHead(403); res.end(); return;}
      fs.readFile(file, function(err, buf){
        if(err){res.writeHead(404); res.end('missing'); return;}
        const ext = path.extname(file);
        const type = ext === '.png' ? 'image/png' : ext === '.html' ? 'text/html' : 'application/octet-stream';
        res.writeHead(200, {'Content-Type': type});
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', function(){resolve(srv);});
  });
}

function httpGet(url){
  return new Promise(function(resolve, reject){
    http.get(url, function(res){
      let d = '';
      res.on('data', function(c){d += c;});
      res.on('end', function(){resolve(d);});
    }).on('error', reject);
  });
}

async function headlessLetter(){
  const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome';
  if(!fs.existsSync(chrome)){
    console.log('headless skipped, chrome missing');
    return;
  }
  const srv = await startServer();
  const port = srv.address().port;
  const debug = 9333 + Math.floor(Math.random() * 1000);
  const proc = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--remote-debugging-port=' + debug,
    'about:blank'
  ], {stdio: 'ignore'});
  try{
    let ver = null;
    for(let i = 0; i < 40; i++){
      try{ver = JSON.parse(await httpGet('http://127.0.0.1:' + debug + '/json/version')); break;}
      catch(e){await new Promise(function(r){setTimeout(r, 150);});}
    }
    if(!ver)throw new Error('chrome debug port did not open');
    const list = JSON.parse(await httpGet('http://127.0.0.1:' + debug + '/json'));
    const page = list.find(function(t){return t.type === 'page';});
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(function(resolve, reject){
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    let seq = 0;
    const pending = new Map();
    ws.addEventListener('message', function(ev){
      const msg = JSON.parse(ev.data);
      if(!msg.id || !pending.has(msg.id))return;
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if(msg.error)p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    });
    function send(method, params){
      const id = ++seq;
      return new Promise(function(resolve, reject){
        pending.set(id, {resolve: resolve, reject: reject});
        ws.send(JSON.stringify({id: id, method: method, params: params || {}}));
      });
    }
    await send('Page.enable');
    await send('Runtime.enable');
    const nav = await send('Page.navigate', {url: 'http://127.0.0.1:' + port + '/index.html'});
    if(nav.errorText)throw new Error(nav.errorText);
    await send('Page.loadEventFired').catch(function(){});
    for(let i = 0; i < 30; i++){
      const ready = await send('Runtime.evaluate', {expression: 'typeof renderTimesheetPdfBlob==="function"', returnByValue: true});
      if(ready.result && ready.result.value === true)break;
      await new Promise(function(r){setTimeout(r, 100);});
    }
    const expr = `(async function(){
      currentUser={username:'aide.one', name:'Aide One', sbAideId:'22222222-2222-2222-2222-222222222222'};
      currentTS='ts_view';
      myClients=[{id:'${CLIENT}', name:'Ada Client'}];
      const sel=document.getElementById('cg_client');
      sel.innerHTML='<option value="${CLIENT}">Ada Client</option>';
      sel.value='${CLIENT}';
      store.set('wd_aide.one_ts_view', {1:{date:'2026-09-21', tin:'08:00', tout:'12:00', hrs:'4:00', svcs:['Bathing'], savedAt:'now', aideSig:'a', clientSig:'c', aideSigInk:true, clientSigInk:true}});
      const hidden=document.getElementById('viewPdfBtn').style.display;
      cgNoteSavedDayPdf();
      let blob=null;
      for(let i=0;i<40;i++){
        blob=window.__cgViewPdfBlob;
        if(blob)break;
        await new Promise(function(r){setTimeout(r, 100);});
      }
      if(!blob)throw new Error('Save Day did not yield a PDF blob');
      const shown=document.getElementById('viewPdfBtn').style.display;
      const label=document.getElementById('viewPdfBtn').textContent;
      window.open=function(){return null;};
      const viewed=await viewSavedTimesheetPdf();
      const buf=new Uint8Array(await viewed.arrayBuffer());
      let s='';
      for(let i=0;i<buf.length;i++)s+=String.fromCharCode(buf[i]);
      return {
        hidden:hidden,
        shown:shown,
        label:label,
        size:viewed.size,
        magic:s.slice(0,5),
        pages:(s.match(/\\/Type\\s*\\/Page(?!s)/g)||[]).length,
        media:(s.match(/\\/MediaBox\\s*\\[[^\\]]+\\]/g)||[]),
        frame:document.getElementById('viewPdfFrame').src.slice(0,5),
        panel:document.getElementById('viewPdfPanel').style.display,
        btn:document.getElementById('viewPdfBtn').textContent
      };
    })()`;
    const evaluated = await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true});
    if(evaluated.exceptionDetails){
      throw new Error(evaluated.exceptionDetails.text + ' ' + JSON.stringify(evaluated.exceptionDetails.exception));
    }
    const out = evaluated.result.value;
    assert.strictEqual(out.hidden, 'none', 'button is hidden before the saved day is noted');
    assert.strictEqual(out.shown, 'block', 'Save Day shows View PDF');
    assert.strictEqual(out.label, 'View PDF');
    assert.strictEqual(out.magic, '%PDF-', 'viewed bytes are a PDF');
    assert.strictEqual(out.pages, 1, 'viewed PDF is one page');
    assert.ok(out.media.some(function(m){return /0 0 612/.test(m) && /792/.test(m);}), 'MediaBox is US Letter');
    assert.ok(out.size > 1024, 'PDF is larger than the empty guard');
    assert.strictEqual(out.frame, 'blob:', 'frame shows the blob');
    assert.strictEqual(out.panel, 'block', 'panel is open');
    assert.strictEqual(out.btn, 'View PDF');
    console.log('headless letter pdf', out.pages, 'page', out.size, 'bytes', out.media[0]);
    ws.close();
  }finally{
    proc.kill('SIGKILL');
    srv.close();
  }
}
