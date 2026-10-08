#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const https = require('https');
const vm = require('vm');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-10-08-sec1-ui-h2">', 'sec1-ui-h2 meta is first');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-10-08-sec1-ui">') > 0, 'sec1-ui meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-msg-composer-rect1">') > 0, 'msg-composer-rect1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pages-cache-fresh1">') > 0, 'pages-cache-fresh1 meta stays');
assert.ok(html.includes('<meta name="caregiver-shell" content="2026-09-29-pages-cache-fresh1">'), 'shell id stays pages-cache-fresh1');
assert.ok(html.includes('<!-- caregiver-build: 2026-10-08-sec1-ui-h2 v=sec1-ui-h2 ?v=sec1-ui-h2 SEC1_UI_H2 —'), 'SEC1_UI_H2 marker');
assert.ok(html.includes('data-sec1-ui-h2="SEC1_UI_H2"'), 'SEC1_UI_H2 data marker');
assert.ok(html.includes('?v=sec1-ui-h2'), 'cache tag ?v=sec1-ui-h2');
assert.ok(html.includes('<!-- caregiver-build: 2026-10-08-sec1-ui v=sec1-ui ?v=sec1-ui SEC1_UI —'), 'SEC1_UI marker');
assert.ok(html.includes('data-sec1-ui="SEC1_UI"'), 'SEC1_UI data marker');
assert.ok(html.includes('data-cache="?v=sec1-ui"'), 'cache tag ?v=sec1-ui');
assert.ok(html.includes('https://evercareagency.github.io/caregiver/'), 'clean Home Screen URL stays');
assert.ok(html.includes('%22start_url%22:%22.%22'), 'manifest start_url stays a clean dot');
assert.ok(html.includes("start_url:'.'"), 'runtime start_url stays a clean dot');
assert.ok(!html.includes('start_url%22:%22?v=sec1-ui') && !html.includes("start_url:'?v=sec1-ui'"), 'Home Screen URL is not a sticky ?v=sec1-ui');
assert.ok(!html.includes('start_url%22:%22?v=sec1-ui-h2') && !html.includes("start_url:'?v=sec1-ui-h2'"), 'Home Screen URL is not a sticky ?v=sec1-ui-h2');
assert.ok(!/location\.(?:href|assign|replace)\([^)]*sec1-ui/.test(html), 'sec1-ui is not written onto the location');
assert.ok(html.includes('const CG_SESSION_MS=8*60*60*1000;'), 'caregiver session length stays 8 hours');
assert.ok(html.includes('const TS_PDF_PAGE_SLACK_PT=72;'), 'letter slack stays');
assert.ok(html.includes("format:'letter'"), 'PDF format stays letter');
assert.ok(html.includes('5510 Pearl Rd Ste 200, Cleveland, OH 44129'), 'office address stays');
assert.ok(html.includes('/^\\d{5}(?:-\\d{4})?$/'), 'ZIP check stays');
assert.ok(html.includes('https://nominatim.openstreetmap.org/search?format=json&q='), 'address geocode stays');
assert.ok(html.includes('https://nominatim.openstreetmap.org/reverse?format=json&lat='), 'reverse geocode stays');

function walk(dir, out){
  fs.readdirSync(dir, {withFileTypes:true}).forEach(function(ent){
    if(ent.name === '.git' || ent.name === 'node_modules')return;
    const full = path.join(dir, ent.name);
    if(ent.isDirectory())walk(full, out);
    else if(!/-test\.js$/.test(ent.name))out.push(full);
  });
  return out;
}

const files = walk(root, []);
const cdnjsRe = /https:\/\/cdnjs\.cloudflare\.com\/[^"'\\\s<>]+/g;
const urls = new Set();
files.forEach(function(file){
  const text = fs.readFileSync(file);
  if(text.includes(0))return;
  const src = text.toString('utf8');
  const found = src.match(cdnjsRe) || [];
  found.forEach(function(url){ urls.add(url); });
});
assert.ok(urls.size >= 2, 'pinned cdnjs urls are present');

const tags = html.match(/<(script|link)\b[^>]*>/gi) || [];
const cdnTags = tags.filter(function(tag){ return /cdnjs\.cloudflare\.com/.test(tag); });
assert.strictEqual(cdnTags.length, urls.size, 'every cdnjs url is a script or link tag');
cdnTags.forEach(function(tag){
  assert.ok(/^<script\b/i.test(tag), 'cdnjs tag is a script');
  const integrity = (tag.match(/\bintegrity="([^"]+)"/i) || [])[1] || '';
  assert.ok(/^sha384-[A-Za-z0-9+/]+=*$/.test(integrity), 'integrity is sha384');
  assert.ok(/\bcrossorigin="anonymous"/i.test(tag), 'crossorigin anonymous');
  assert.ok(/\breferrerpolicy="no-referrer"/i.test(tag), 'referrerpolicy no-referrer');
  const src = (tag.match(/\bsrc="([^"]+)"/i) || [])[1];
  assert.ok(urls.has(src), 'tag src is a repo cdnjs url');
});
urls.forEach(function(url){
  assert.ok(cdnTags.some(function(tag){ return tag.indexOf(url) >= 0; }), 'url has a pinned tag ' + url);
});

function fetchBytes(url){
  return new Promise(function(resolve, reject){
    const req = https.get(url, {headers:{'Accept-Encoding':'identity'}}, function(res){
      if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        res.resume();
        fetchBytes(res.headers.location).then(resolve, reject);
        return;
      }
      if(res.statusCode !== 200){
        res.resume();
        reject(new Error('http ' + res.statusCode + ' ' + url));
        return;
      }
      const chunks = [];
      res.on('data', function(chunk){ chunks.push(chunk); });
      res.on('end', function(){ resolve(Buffer.concat(chunks)); });
    });
    req.on('error', reject);
  });
}

function sha384(buf){
  return 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
}

function attr(tag, name){
  return (tag.match(new RegExp('\\b' + name + '="([^"]*)"', 'i')) || [])[1] || '';
}

(async function(){
  for(const tag of cdnTags){
    const src = attr(tag, 'src');
    const integrity = attr(tag, 'integrity');
    const bytes = await fetchBytes(src);
    assert.ok(bytes.length > 1000, 'downloaded file is the library');
    assert.strictEqual(sha384(bytes), integrity, 'integrity matches the downloaded file');
    assert.ok(!bytes.slice(0, 20).toString('utf8').includes('<html'), 'download is not an error page');
  }

  const start = html.indexOf('const _sbPdfLibPromises={};');
  const end = html.indexOf('function sbPdfLibsReady');
  assert.ok(start > 0 && end > start, 'loader slice');
  const appended = [];
  const pins = {};
  cdnTags.forEach(function(tag){
    pins[attr(tag, 'src')] = {
      getAttribute: function(name){ return attr(tag, name); }
    };
  });
  const box = {
    document: {
      getElementById: function(id){
        if(id !== 'sec1UiCdnjs')return null;
        return {content:{querySelectorAll: function(){ return Object.keys(pins).map(function(src){ return pins[src]; }); }}};
      },
      createElement: function(){
        const el = {attrs:{}, setAttribute: function(k, v){ this.attrs[k] = v; }};
        return el;
      },
      head: {appendChild: function(el){ appended.push(el); if(el.onload)el.onload(); }}
    },
    Promise: Promise,
    Error: Error
  };
  vm.createContext(box);
  vm.runInContext(html.slice(start, end) + '\nthis.sbLoadScript=sbLoadScript;', box);
  const src = attr(cdnTags[0], 'src');
  await box.sbLoadScript(src);
  assert.strictEqual(appended.length, 1, 'one script appended');
  assert.strictEqual(appended[0].src, src);
  assert.strictEqual(appended[0].attrs.integrity, attr(cdnTags[0], 'integrity'));
  assert.strictEqual(appended[0].attrs.crossorigin, 'anonymous');
  assert.strictEqual(appended[0].attrs.referrerpolicy, 'no-referrer');
  box._sbPdfLibPromises = {};
  await assert.rejects(box.sbLoadScript('https://cdnjs.cloudflare.com/ajax/libs/not-pinned/1.0.0/x.js'), /pdf lib/);

  console.log('caregiver-sec1-ui checks ok');
  console.log('sri assets ' + cdnTags.length);
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
