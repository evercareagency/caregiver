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

const blocks = extractFn(html, 'function buildDayBlocks(fixDays=');
assert.ok(blocks.includes("note.className='day-fix-note'"), 'flagged day gets a note');
assert.ok(blocks.includes('note.textContent=correctionNoteText'), 'the day note is text, not HTML');
assert.ok(!blocks.includes('note.innerHTML'), 'the day note does not use innerHTML');
assert.ok(html.includes('correction_note'), 'the read asks for correction_note');
assert.ok(html.includes('overflow-wrap:anywhere'), 'the note can wrap on a phone');

function el(){
  const node = {textContent:'', className:'', children:[], style:{}, classList:{add:function(){}, remove:function(){}}};
  node.appendChild = function(child){node.children.push(child); node.textContent += child.textContent;};
  node.removeChild = function(child){node.children = node.children.filter(function(c){return c !== child;});};
  return node;
}
const box = {
  document: {createElement: function(){return el();}},
  formatWeekOfLabel: function(v){return 'Week of 09/30/2026';}
};
vm.createContext(box);
vm.runInContext([
  extractFn(html, 'function correctionNoteText(note)'),
  extractFn(html, 'function paintCorrectionBanner(banner, data)')
].join('\n'), box);

const hostile = '<img src=x onerror=alert(1)> Fix Wednesday hours';
const banner = el();
box.paintCorrectionBanner(banner, {weekStart:'2026-09-27', correctionNote:hostile});
assert.strictEqual(banner.children.length, 2);
assert.strictEqual(banner.children[1].className, 'correction-note');
assert.strictEqual(banner.children[1].textContent, hostile);
assert.ok(banner.textContent.indexOf('Week of 09/30/2026') >= 0);
assert.ok(banner.textContent.indexOf(hostile) >= 0);
assert.ok(!banner.children[1].innerHTML, 'server text is not assigned as HTML');

const empty = el();
box.paintCorrectionBanner(empty, {weekStart:'2026-09-27', correctionNote:'   '});
assert.ok(empty.children[1].textContent.indexOf('The office asked for a correction on this day.') >= 0);
assert.ok(empty.children[1].textContent.indexOf('(216) 377-5991') >= 0);

console.log('caregiver-correction-note checks ok');
