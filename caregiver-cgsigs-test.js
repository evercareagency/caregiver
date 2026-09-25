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

assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgsigs1">'), 'cgsigs1 meta');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cgsigs1 v=cgsigs1 —'), 'cgsigs1 marker');
assert.ok(html.includes('v=cgisbadge2') && html.includes('content="2026-09-25-cgisbadge2"'), 'cgisbadge2 stays');
assert.ok(html.includes('v=cgquizlet1') && html.includes('v=loginkb1') && html.includes('v=cgisbadge1') && html.includes('v=cghome1') && html.includes('v=cgauth1'), 'main markers stay');
assert.ok(html.includes('v=cgsigs1'), 'cgsigs1 probe');
assert.ok(html.includes('v=cgpdf1') && html.includes('v=cgpdf1p2') && html.includes('v=cgpdfv1'), 'prior pdf markers stay');
assert.ok(html.includes('v=bcast1b') && html.includes('v=home1') && html.includes('v=offline1'), 'prior markers stay');
assert.ok(html.includes('clientSigX:470') && html.includes('clientSigY:100'), 'top client signature box');
assert.ok(html.includes('caregiverSigX:490') && html.includes('caregiverSigY:128'), 'top caregiver signature box');
assert.ok(html.includes('ts-sig-top'), 'top signature image class');
assert.ok(html.includes('sbStampTimesheetSigs'), 'PDF stamps signature images after the overlay capture');
assert.ok(html.includes('isPlausibleSigSrc(cur[key])'), 'blank pad keeps a stored signature image');

const persist = extractFn(html, 'function persistPadSig(id)');
const keepAt = persist.indexOf('isPlausibleSigSrc(cur[key])');
const dropAt = persist.indexOf('delete cur[key]');
assert.ok(keepAt > 0 && dropAt > keepAt, 'stored signature image is kept before any blank-pad delete');

const formStart = html.indexOf('const TS_FORM_PT=');
const formEnd = html.indexOf(';', formStart);
const src = [
  html.slice(formStart, formEnd + 1),
  extractFn(html, 'function tsPdfPctX(x)'),
  extractFn(html, 'function tsPdfPctY(y)'),
  extractFn(html, 'function tsPdfEscape(s)'),
  extractFn(html, 'function tsPdfFill(text,x,y,cls)'),
  extractFn(html, 'function tsPdfDay(days,i)'),
  extractFn(html, 'function tsPdfTo12(t)'),
  extractFn(html, 'function tsPdfToMDY(d)'),
  extractFn(html, 'function tsPdfHrsDec(hrs)'),
  extractFn(html, 'function tsPdfHrsDisplay(hrs)'),
  extractFn(html, 'function tsPdfSvcKey(s)'),
  extractFn(html, 'function tsPdfDayHasService(d,label)'),
  extractFn(html, 'function tsPdfDayWorked(d)'),
  extractFn(html, 'function tsPdfSigned(d,role)'),
  extractFn(html, 'function tsPdfSigHtml(d,role,x,y,extra)'),
  extractFn(html, 'function tsPdfDayRank(d,i)'),
  extractFn(html, 'function tsPdfSummarySigs(days)'),
  extractFn(html, 'function buildTimesheetPrintHtml(r)')
].join('\n');

const ctx = {TS_PDF_BLANK: 'assets/blank-letter.png?v=a713ovl', TS_SVC_OVERLAY: []};
vm.createContext(ctx);
vm.runInContext(src, ctx);

const monAide = 'data:image/png;base64,' + 'MONA'.repeat(30);
const monClient = 'data:image/png;base64,' + 'MONC'.repeat(30);
const thuAide = 'data:image/png;base64,' + 'THUA'.repeat(30);
const thuClient = 'data:image/png;base64,' + 'THUC'.repeat(30);
const out = ctx.buildTimesheetPrintHtml({
  clientName: 'Bowlax',
  empName: 'moe',
  totalHrs: '20:00',
  days: {
    1: {date: '2026-09-21', tin: '10:00', tout: '18:00', hrs: '8:00', aideSig: monAide, clientSig: monClient, aideSigInk: true, clientSigInk: true},
    2: {date: '2026-09-22', tin: '08:00', tout: '12:00', hrs: '4:00'},
    4: {date: '2026-09-24', tin: '09:33', tout: '21:33', hrs: '12:00', aideSig: thuAide, clientSig: thuClient, aideSigInk: true, clientSigInk: true}
  }
});

function count(s){return out.split(s).length - 1;}
assert.strictEqual(count('class="ts-sig"'), 4, 'Monday and Thursday each paint HHA and Client row images');
assert.strictEqual(count('ts-sig-top'), 2, 'top client and caregiver boxes each get one image');
assert.strictEqual(count(monAide), 1, 'Monday HHA scribble stays on Monday only');
assert.strictEqual(count(monClient), 1, 'Monday client scribble stays on Monday only');
assert.strictEqual(count(thuAide), 2, 'latest day HHA scribble also fills the top caregiver box');
assert.strictEqual(count(thuClient), 2, 'latest day client scribble also fills the top client box');
const yOf = vm.runInContext('(function(pt){return tsPdfPctY(pt);})', ctx);
const F = vm.runInContext('TS_FORM_PT', ctx);
assert.ok(out.includes('top:' + yOf(F.dayY0 + F.dayStep)), 'Monday row uses the Monday Y');
assert.ok(out.includes('top:' + yOf(F.dayY0 + 4 * F.dayStep)), 'Thursday row uses the Thursday Y');
assert.ok(out.includes('top:' + yOf(F.clientSigY)), 'top client box Y');
assert.ok(out.includes('top:' + yOf(F.caregiverSigY)), 'top caregiver box Y');
assert.ok(out.includes('09/21/26') && out.includes('09/24/26') && out.includes('09/22/26'), 'unsigned Tuesday still prints its times');
assert.ok(!out.includes('---'), 'unsigned signature cells are left blank on the form');

const summary = ctx.tsPdfSummarySigs({
  1: {date: '2026-09-21', aideSig: monAide, clientSig: monClient},
  4: {date: '2026-09-24', aideSig: thuAide, clientSig: thuClient}
});
assert.strictEqual(summary.aide.aideSig, thuAide);
assert.strictEqual(summary.client.clientSig, thuClient);

console.log('caregiver-cgsigs-test: ok');
