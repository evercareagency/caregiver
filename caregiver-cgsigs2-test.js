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

assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgsigs2">'), 'cgsigs2 meta');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cgsigs2 v=cgsigs2 —'), 'cgsigs2 comment');
assert.ok(html.includes('v=cgsigs2'), 'cgsigs2 probe');
assert.ok(html.includes('v=cguser1') && html.includes('content="2026-09-25-cguser1"'), 'cguser1 stays');
assert.ok(html.includes('v=cghome1b') && html.includes('content="2026-09-25-cghome1b"'), 'cghome1b stays');
assert.ok(html.includes('v=cgsigs1') && html.includes('content="2026-09-25-cgsigs1"'), 'cgsigs1 stays');
assert.ok(html.includes('v=cgsiglock1') && html.includes('content="2026-09-25-cgsiglock1"'), 'cgsiglock1 stays');
assert.ok(html.includes('5510 Pearl Rd Ste 200, Cleveland, OH 44129'), 'office address stays on the form');
assert.ok(html.includes('canvas.sigpad.sig-locked{cursor:default;box-shadow:inset 0 0 0 2px var(--success);pointer-events:none;touch-action:auto;}'), 'locked pad still ignores pointer and scroll');
assert.ok(html.includes('sbStampTimesheetSigs'), 'PDF still stamps signature scribbles');
assert.ok(html.includes('const TS_PDF_PAGE_SLACK_PT=72;'), 'letter slack still keeps the address on page 1');

const askRedo = extractFn(html, 'function askRedoSig(id)');
assert.ok(askRedo.includes("title.textContent='Are you sure?'"), 'redo asks are you sure');
assert.ok(askRedo.includes("go.textContent='Yes, redo'"), 'redo confirm is explicit');
assert.ok(askRedo.includes("openModal('sigDialogModal')"), 'redo opens the dialog before unlock');
assert.ok(!askRedo.includes('clearSig('), 'asking does not clear the pad');
assert.ok(!askRedo.includes('paintSigLock(id,false)'), 'asking does not unlock');

const commit = extractFn(html, 'function commitSigDialog()');
assert.ok(commit.includes("mode==='confirm'") && commit.includes('paintSigLock(id,true)'), 'confirm still locks');
assert.ok(commit.includes('clearSig(id)'), 'yes redo still clears after the dialog');
const redoBranch = commit.slice(commit.indexOf("mode==='confirm'"));
assert.ok(redoBranch.indexOf('clearSig(id)') > redoBranch.indexOf('return;'), 'clear runs only on the redo path');

console.log('caregiver-cgsigs2 static checks ok');
