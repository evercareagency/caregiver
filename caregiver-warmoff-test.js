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

assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-warm-off v=warmoff1 —'), 'warm-off marker');
assert.ok(html.includes('v=warmoff1'), 'warm-off probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-warm-off">'), 'warm-off meta');
assert.ok(html.includes('v=cgpdf1p2'), 'print marker stays');
assert.ok(html.includes('v=norbkup1'), 'no-rm-backup marker stays');
assert.ok(html.includes('v=pwreset1'), 'password reset marker stays');
assert.ok(html.includes('v=isassign1'), 'assign unlock marker stays');
assert.ok(html.includes('v=portal1'), 'portal marker stays');
assert.ok(html.includes('v=cgpdfv1'), 'view pdf marker stays');
assert.ok(html.includes('v=ishydr1'), 'inservice hydrate marker stays');
assert.ok(html.includes('v=bakuuid1'), 'backup uuid marker stays');
assert.ok(html.includes('v=cgpdf1'), 'letter pdf marker stays');
assert.ok(html.includes('v=home1'), 'save-home marker stays');
assert.ok(html.includes('v=nocert1'), 'nocert marker stays');
assert.ok(html.includes('v=sbseal1'), 'auth seal marker stays');
assert.ok(html.includes('v=offline1'), 'offline marker stays');

assert.ok(!html.includes('function warmUpSheets('), 'warm-up function is removed');
assert.ok(!html.includes("action:'ping'"), 'ping action is removed');
assert.ok(!/warmUpSheets\(\)/.test(html), 'page load does not call warm-up');

function runLoad(opts){
  const fetches = [];
  const mem = Object.assign({}, opts.storage || {});
  const box = {
    location: {search: opts.search || ''},
    localStorage: {
      getItem: function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;}
    },
    fetch: function(url, init){
      fetches.push({url: url, method: (init && init.method) || 'GET', body: (init && init.body) || ''});
      return Promise.resolve({ok: true, json: function(){return Promise.resolve({ok: true});}});
    }
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(extractFn(html, 'function evercareSbEnabled()') + '\nevercareSbEnabled();', box);
  return {fetches: fetches};
}

assert.strictEqual(runLoad({}).fetches.length, 0, 'default load does not fetch');
assert.strictEqual(runLoad({search: '?sheets=1'}).fetches.length, 0, 'sheets=1 does not warm Apps Script');
assert.strictEqual(runLoad({storage: {evercare_sheets: '1'}}).fetches.length, 0, 'stored sheets flag does not warm Apps Script');
assert.strictEqual(runLoad({search: '?sb=0', storage: {evercare_sb: '0'}}).fetches.length, 0, 'old sb flags do not fetch');

console.log('caregiver-warmoff static checks ok');
