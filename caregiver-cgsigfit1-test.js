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

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-09-25-cgsigfit1">', 'first meta is cgsigfit1');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-25-cgsigs2">') > 0, 'cgsigs2 meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cgsigfit1 v=cgsigfit1 —'), 'cgsigfit1 comment');
assert.ok(html.includes('v=cgsigfit1'), 'cgsigfit1 probe');
assert.ok(html.includes('v=cgsigs2') && html.includes('content="2026-09-25-cgsigs2"'), 'cgsigs2 stays');
assert.ok(html.includes('v=cgsiglock1') && html.includes('content="2026-09-25-cgsiglock1"'), 'cgsiglock1 stays');
assert.ok(html.includes('v=cgsigs1') && html.includes('content="2026-09-25-cgsigs1"'), 'cgsigs1 stays');
assert.ok(html.includes('5510 Pearl Rd Ste 200, Cleveland, OH 44129'), 'office address stays on the form');
assert.ok(html.includes('const TS_PDF_PAGE_SLACK_PT=72;'), 'letter slack still keeps the address on page 1');
assert.ok(html.includes('canvas.sigpad.sig-locked{cursor:default;box-shadow:inset 0 0 0 2px var(--success);pointer-events:none;touch-action:auto;}'), 'locked pad still ignores pointer and scroll');
assert.ok(html.includes('sbStampTimesheetSigs'), 'PDF still stamps signature scribbles');
assert.ok(html.includes('sbSetCaptureSigs(container,true)'), 'capture hides overlay sigs before the single stamp');
assert.ok(html.includes('ctx.setTransform(1,0,0,1,0,0)'), 'stamp resets the html2canvas translate before drawing ink');
assert.ok(!html.includes(',98,11.5)') && !html.includes(',159,15)'), 'old full-cell stamp boxes are gone');

const askRedo = extractFn(html, 'function askRedoSig(id)');
assert.ok(askRedo.includes("title.textContent='Are you sure?'"), 'redo asks are you sure');
assert.ok(askRedo.includes("go.textContent='Yes, redo'"), 'redo confirm is explicit');
assert.ok(askRedo.includes("openModal('sigDialogModal')"), 'redo opens the dialog before unlock');
assert.ok(!askRedo.includes('clearSig('), 'asking does not clear the pad');
assert.ok(!askRedo.includes('paintSigLock(id,false)'), 'asking does not unlock');

const commit = extractFn(html, 'function commitSigDialog()');
assert.ok(commit.includes("mode==='confirm'") && commit.includes('paintSigLock(id,true)'), 'confirm still locks');
assert.ok(commit.includes('clearSig(id)'), 'yes redo still clears after the dialog');

const fitSrc = html.slice(html.indexOf('const TS_SIG_FIT='), html.indexOf(';', html.indexOf('const TS_SIG_FIT=')) + 1);
const fitBox = {};
vm.createContext(fitBox);
const fit = vm.runInContext(fitSrc + '\nTS_SIG_FIT', fitBox);
assert.ok(fit.dayH <= 9 && fit.dayH >= 6, 'day box is shorter than the 13.4pt row');
assert.ok(fit.dayW <= 96 && fit.dayW >= 60, 'day box stays inside the HHA column');
assert.ok(fit.topH <= 16 && fit.topH >= 8, 'top box stays inside the header cell');
assert.ok(fit.topW <= 180 && fit.topW >= 100, 'top box stays inside the header cell width');
assert.ok(fit.dayH < 13.4 - 2, 'day ink has vertical margin inside the row');
function pct(pt, whole){return (pt / whole * 100).toFixed(4);}
assert.ok(html.includes('width:' + pct(fit.dayW, 612) + '%'), 'day sig CSS width matches TS_SIG_FIT');
assert.ok(html.includes('height:' + pct(fit.dayH, 792) + '%'), 'day sig CSS height matches TS_SIG_FIT');
assert.ok(html.includes('width:' + pct(fit.topW, 612) + '%'), 'top sig CSS width matches TS_SIG_FIT');
assert.ok(html.includes('height:' + pct(fit.topH, 792) + '%'), 'top sig CSS height matches TS_SIG_FIT');
assert.ok(html.includes('TS_SIG_FIT.dayW,TS_SIG_FIT.dayH'), 'day stamp uses the inset box');
assert.ok(html.includes('TS_SIG_FIT.topW,TS_SIG_FIT.topH'), 'top stamp uses the inset box');

const ctx = {};
vm.createContext(ctx);
vm.runInContext([
  extractFn(html, 'function sbSigChamfer(mask,w,h)'),
  extractFn(html, 'function sbThinSigPixels(src,w,h,boxW,boxH,penPt)')
].join('\n'), ctx);

function inkStats(data, w, h){
  let n = 0, minx = w, maxx = -1, miny = h, maxy = -1;
  const xs = new Uint8Array(w);
  const thick = new Uint16Array(w);
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const p = (y * w + x) * 4;
      if(data[p + 3] < 24)continue;
      n++;
      xs[x] = 1;
      thick[x]++;
      if(x < minx)minx = x;
      if(x > maxx)maxx = x;
      if(y < miny)miny = y;
      if(y > maxy)maxy = y;
    }
  }
  let maxThick = 0, gap = 0, run = 0;
  for(let x = minx; x <= maxx; x++){
    if(thick[x] > maxThick)maxThick = thick[x];
    if(xs[x]){run = 0;}
    else{run++; if(run > gap)gap = run;}
  }
  return {n: n, minx: minx, maxx: maxx, miny: miny, maxy: maxy, maxThick: maxThick, gap: gap, span: maxy - miny};
}

const barW = 90, barH = 24;
const bar = new Uint8ClampedArray(barW * barH * 4);
for(let y = 4; y < 18; y++){
  for(let x = 6; x < 84; x++){
    const p = (y * barW + x) * 4;
    bar[p] = 26; bar[p + 1] = 39; bar[p + 2] = 68; bar[p + 3] = 255;
  }
}
const thinnedBar = ctx.sbThinSigPixels(bar, barW, barH, fit.dayW, fit.dayH, fit.penPt);
assert.ok(thinnedBar && thinnedBar.data, 'a fat bar is thinned');
assert.ok(thinnedBar.kept < thinnedBar.ink, 'thinning removes outer pixels');
const barOut = inkStats(thinnedBar.data, barW, barH);
assert.ok(barOut.maxThick < 8, 'fat bar is thinner than the 14px source, got ' + barOut.maxThick);
assert.ok(barOut.maxThick >= 1, 'thinned bar still has ink');
assert.ok(barOut.gap <= 1, 'thinned bar stays a continuous stroke, gap ' + barOut.gap);
assert.ok(barOut.maxx - barOut.minx > 70, 'thinned bar keeps the real length');

const waveW = 140, waveH = 80;
const wave = new Uint8ClampedArray(waveW * waveH * 4);
function disk(data, w, h, cx, cy, r){
  const r2 = r * r;
  for(let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++){
    for(let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++){
      const dx = x - cx, dy = y - cy;
      if(dx * dx + dy * dy > r2)continue;
      const p = (y * w + x) * 4;
      data[p] = 26; data[p + 1] = 39; data[p + 2] = 68; data[p + 3] = 255;
    }
  }
}
for(let i = 0; i <= 80; i++){
  const t = i / 80;
  disk(wave, waveW, waveH, 10 + t * 110, 40 + Math.sin(t * Math.PI * 2) * 18, 5);
}
const before = inkStats(wave, waveW, waveH);
const thinnedWave = ctx.sbThinSigPixels(wave, waveW, waveH, fit.dayW, fit.dayH, fit.penPt);
assert.ok(thinnedWave && thinnedWave.data, 'a fat scribble is thinned');
const waveOut = inkStats(thinnedWave.data, waveW, waveH);
assert.ok(waveOut.span > before.span * 0.55, 'scribble keeps its vertical shape, span ' + waveOut.span + ' vs ' + before.span);
assert.ok(waveOut.gap <= 3, 'scribble is not broken into dashes, gap ' + waveOut.gap);
let leftY = 0, leftN = 0, rightY = 0, rightN = 0;
for(let y = 0; y < waveH; y++){
  for(let x = 0; x < waveW; x++){
    const p = (y * waveW + x) * 4;
    if(thinnedWave.data[p + 3] < 24)continue;
    if(x < 45){leftY += y; leftN++;}
    else if(x > 95){rightY += y; rightN++;}
  }
}
assert.ok(leftN > 10 && rightN > 10, 'both ends of the scribble remain');
assert.ok(Math.abs(leftY / leftN - rightY / rightN) > 6, 'thinned ink still follows the real curve');

const hair = new Uint8ClampedArray(40 * 16 * 4);
for(let x = 4; x < 36; x++){
  const p = (8 * 40 + x) * 4;
  hair[p] = 26; hair[p + 1] = 39; hair[p + 2] = 68; hair[p + 3] = 255;
}
assert.strictEqual(ctx.sbThinSigPixels(hair, 40, 16, fit.dayW, fit.dayH, fit.penPt), null, 'an already-thin stroke is left as the real ink');

console.log('caregiver-cgsigfit1 checks ok');
