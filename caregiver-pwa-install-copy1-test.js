#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, 'caregiver-push-sw.js'), 'utf8');

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-10-08-sec1-ui">', 'newer tip meta is first');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-msg-composer-rect1">') > 0, 'msg-composer-rect1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pwa-install-copy1">') > 0, 'pwa-install-copy1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-care-msg-send1">') > 0, 'care-msg-send1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pages-cache-fresh1">') > 0, 'pages-cache-fresh1 meta stays');
assert.ok(html.includes('<meta name="caregiver-shell" content="2026-09-29-pages-cache-fresh1">'), 'shell id stays pages-cache-fresh1');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-29-pwa-install-copy1 v=pwa-install-copy1 —'), 'build comment');
assert.ok(html.includes('v=pwa-install-copy1'), 'probe marker');

const tip = html.slice(html.indexOf('<!-- caregiver-build: 2026-09-29-pwa-install-copy1'), html.indexOf('<!-- caregiver-build: 2026-09-29-care-msg-send1'));
assert.ok(tip.includes('MERGE HOLD') && tip.includes('Do not claim LIVE') && tip.includes('Do not squash-merge'), 'merge hold');
assert.ok(tip.includes('Quiet Mo'), 'quiet mo');
assert.ok(tip.includes('Ace unchanged') && tip.includes('No new Ace patch'), 'ace unchanged');
assert.ok(!/CALLABLE/.test(tip), 'this tip does not claim callable');
assert.ok(tip.includes('View More'), 'tip names View More');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-29-pages-cache-fresh1 v=pages-cache-fresh1 —'), 'pages-cache-fresh1 comment stays');

const modalStart = html.indexOf('id="iosInstallModal"');
const modalEnd = html.indexOf('id="alertModal"', modalStart);
assert.ok(modalStart > 0 && modalEnd > modalStart, 'install modal');
const modal = html.slice(modalStart, modalEnd);
assert.ok(modal.includes('data-pwa-install="v=pwa-install-copy1"'), 'modal marker');
const share = modal.indexOf('<strong>Share</strong>');
const viewMore = modal.indexOf('<strong>View More</strong>');
const addHome = modal.indexOf('<strong>Add to Home Screen</strong>');
const add = modal.indexOf('<strong>Add</strong>');
assert.ok(share > 0 && viewMore > share && addHome > viewMore && add > addHome, 'steps are Share, View More, Add to Home Screen, Add');
assert.ok(modal.includes('the square with an arrow pointing up (usually at the bottom of Safari).'), 'share hint');
assert.ok(modal.includes('if you don\u2019t see Add to Home Screen yet, tap View More / the row that opens more actions.'), 'view more hint');
assert.ok(modal.includes('<strong>Add</strong> — top right. Done.'), 'add hint');
assert.ok(!/scroll the list/i.test(modal), 'the modal does not say only scroll the list');
assert.ok(modal.includes('Using Android Chrome?'), 'android footnote stays');
assert.ok(modal.includes('<strong>Install app</strong>'), 'android install app stays');
assert.ok(modal.includes("closeModal('iosInstallModal')\">Got it"), 'got it stays');

assert.ok(html.includes('id="pwaBannerInstallBtn"'), 'banner button stays');
assert.ok(html.includes('>Install</button>'), 'banner label stays Install');
assert.ok(html.includes('📱 Add to Home Screen'), 'cta label stays Add to Home Screen');
assert.ok(html.includes("el.textContent=ready?'📲 Tap Install':'📱 Add to Home Screen';"), 'ready label stays');
assert.ok(html.includes("banBtn.textContent=ready?'Tap Install':'Install';"), 'banner ready label stays');

assert.ok(sw.includes('v=pages-cache-fresh1') && sw.includes('skipWaiting') && sw.includes('#messages'), 'push worker shell behavior stays');
assert.ok(!sw.includes('pwa-install-copy1'), 'push worker is not retagged');
assert.ok(html.includes("var script = './caregiver-push-sw.js';"), 'shell still uses the push worker');
assert.ok(html.includes("navigator.serviceWorker.register(script, {scope:'./', updateViaCache:'none'})"), 'shell registration stays');

console.log('pwa-install-copy1 ok');
console.log('marker proof: ' + metas[0]);
