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

const warm = extractFn(html, 'function warmUpSheets()');
assert.ok(warm.includes('evercareSbEnabled()'), 'cut uses the sheets rollback helper');
assert.ok(warm.indexOf('evercareSbEnabled()') < warm.indexOf('SHEETS_URL'), 'flag check precedes /exec');
assert.ok(warm.indexOf('evercareSbEnabled()') < warm.indexOf('_sheetsWarmUpStarted=true'), 'skip does not mark warm started');
assert.ok(warm.includes("action:'ping'"), 'sheets mode still posts the ping beacon');
assert.ok(warm.includes("method:'GET'"), 'sheets mode still GET-warms /exec');
assert.ok(!/supabase/i.test(warm), 'warm path must not touch supabase');
assert.ok(!/await\s+/.test(warm), 'warmkeep must not be awaited');
assert.ok(/function warmUpSheets\(\)\{[\s\S]*?\}\nwarmUpSheets\(\);/.test(html), 'sheets rollback still calls warm as soon as the script evaluates');

function runWarm(opts){
  const fetches = [];
  const mem = Object.assign({}, opts.storage || {});
  const box = {
    location: {search: opts.search || ''},
    localStorage: {
      getItem: function(k){return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;}
    },
    SHEETS_URL: 'https://sheets.example/exec',
    fetch: function(url, init){
      fetches.push({url: url, method: (init && init.method) || 'GET', body: (init && init.body) || ''});
      return Promise.resolve({ok: true, clone: function(){return this;}, json: function(){return Promise.resolve({ok: true});}});
    },
    noteAceHealth: function(){},
    markAceHealthBad: function(){}
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(
    extractFn(html, 'function evercareSbEnabled()') + '\n' +
    warm + '\n' +
    'warmUpSheets();\nwarmUpSheets();\n',
    box
  );
  return {fetches: fetches, started: box._sheetsWarmUpStarted === true};
}

const cut = runWarm({});
assert.strictEqual(cut.fetches.length, 0, 'supabase cut fires no warm /exec beacon');
assert.strictEqual(cut.started, false, 'supabase cut does not mark warmkeep started');

const sheetsQuery = runWarm({search: '?sheets=1'});
assert.strictEqual(sheetsQuery.fetches.length, 2, 'sheets=1 still warms once across the repeat call');
assert.strictEqual(sheetsQuery.started, true, 'sheets=1 marks warmkeep started');
assert.strictEqual(sheetsQuery.fetches[0].method, 'POST');
assert.ok(sheetsQuery.fetches[0].body.indexOf('"action":"ping"') >= 0, 'sheets=1 posts action ping');
assert.strictEqual(sheetsQuery.fetches[1].method, 'GET');
assert.ok(sheetsQuery.fetches.every(function(f){return f.url === 'https://sheets.example/exec';}));

const sheetsStore = runWarm({storage: {evercare_sheets: '1'}});
assert.strictEqual(sheetsStore.fetches.length, 2, 'evercare_sheets=1 still warms /exec');
assert.strictEqual(sheetsStore.fetches[0].method, 'POST');
assert.strictEqual(sheetsStore.fetches[1].method, 'GET');

const ignored = runWarm({search: '?sb=0', storage: {evercare_sb: '0'}});
assert.strictEqual(ignored.fetches.length, 0, 'old sb flags do not restore warmkeep');

console.log('caregiver-warmoff static checks ok');
