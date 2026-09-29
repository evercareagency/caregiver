#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-09-29-pages-cache-fresh1">', 'newer tip meta is first');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-aide-home-addr1-autofill1">') > 0, 'aide-home-addr1-autofill1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-aide-home-addr1">') > 0, 'aide-home-addr1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-care-msg-safe1">') > 0, 'care-msg-safe1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-punch-leftovers1">') > 0, 'punch-leftovers1 meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-28-punch-leftovers1 v=punch-leftovers1 —'), 'punch-leftovers1 comment');
assert.ok(html.includes('v=punch-leftovers1'), 'punch-leftovers1 probe');
assert.ok(html.includes('data-punch-leftovers="v=punch-leftovers1"'), 'dock marker');
assert.ok(html.includes('MERGE HOLD') && html.includes('Do not claim LIVE'), 'merge hold');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-27-care-msg-tab1">') > 0, 'care-msg-tab1 stays');
assert.ok(html.includes('v=care-msg-tab1') && html.includes('v=vapid1') && html.includes('v=clienthrs1d') && html.includes('v=aidechat1') && html.includes('v=offline1'), 'prior markers stay');

assert.ok(html.includes('viewport-fit=cover'), 'notched phones report the safe-area inset');
assert.ok(html.includes('interactive-widget=resizes-content'), 'keyboard resize flag stays');
assert.ok(html.includes('--eca-safe-b:env(safe-area-inset-bottom, 0px)'), 'safe-area token');
assert.ok(html.includes('--eca-dock-h:calc(var(--eca-dock-pad) + var(--eca-dock-btn) + var(--eca-dock-pad) + var(--eca-safe-b))'), 'dock height includes the inset');
assert.ok(html.includes('--eca-dock-clear:calc(var(--eca-dock-h) + 28px)'), 'clearance is the dock plus a gap');
assert.ok(html.includes('body.has-bottom-nav .wrap{padding-bottom:calc(108px + var(--eca-safe-b));}'), 'page wrap clears the dock and the inset');
assert.ok(html.includes('body.has-bottom-nav footer{margin-bottom:0;padding-bottom:var(--eca-dock-clear);}'), 'site footer clears the dock');
assert.ok(html.includes('padding:var(--eca-dock-pad) 4px calc(var(--eca-dock-pad) + var(--eca-safe-b))'), 'dock labels sit above the home indicator');
assert.ok(html.includes('.bottom-nav{position:fixed;'), 'dock stays fixed');
assert.ok(!html.includes('#bottomNav{display:none') || html.includes('body.aidechat-kb #bottomNav{display:none !important;}'), 'dock is not hidden as the cover fix');

const msgRule = html.slice(html.indexOf('#messagesScreen.active{'), html.indexOf('#messagesScreen .hdr'));
assert.ok(msgRule.includes('bottom:var(--eca-dock-h)'), 'messages screen ends at the top of the dock');
assert.ok(!msgRule.includes('100dvh') && !msgRule.includes('inset:0'), 'messages screen does not cover the viewport bottom');
assert.ok(html.includes('body.aidechat-kb #messagesScreen.active{bottom:0;}'), 'keyboard path documented: screen fills the visual bottom only while the keyboard class is on');
assert.ok(html.includes('body.aidechat-kb #bottomNav{display:none !important;}'), 'dock hides only for the open composer keyboard');
assert.ok(html.includes('The dock hides only while the phone keyboard is open'), 'keyboard exception is written down');

const scrollFn = html.slice(html.indexOf('function aideChatScrollThread()'), html.indexOf('async function aideChatDeliver'));
assert.ok(scrollFn.includes('thread.scrollTop=thread.scrollHeight'), 'thread scrolls inside itself');
assert.ok(!scrollFn.includes('scrollIntoView'), 'scrolling to the last message does not pan the page and the dock');

const nav = html.slice(html.indexOf('id="bottomNav"'), html.indexOf('id="deleteDraftModal"'));
assert.ok(nav.includes('data-nav="home"') && nav.includes('data-nav="timesheet"') && nav.includes('data-nav="messages"') && nav.includes('data-nav="inservices"') && nav.includes('data-nav="more"'), 'five tabs stay');

assert.ok(html.includes('id="sandataModal"') && html.includes('id="alertModal"'), 'sandata and important notice stay');
assert.ok(html.includes('id="callOffSubmitBtn"'), 'call off submit stays');
assert.ok(html.includes('ackSandata') && html.includes('ackImportantNotice'), 'notice stack handlers stay');

console.log('caregiver-punch-leftovers1-test: ok');
