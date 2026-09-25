#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert.ok(html.includes('<!-- caregiver-build: 2026-09-24-no-rm-backup v=norbkup1 —'), 'no-rm-backup marker');
assert.ok(html.includes('v=norbkup1'), 'no-rm-backup probe');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-24-no-rm-backup">'), 'no-rm-backup meta');
assert.ok(html.includes('v=cgpdf1p2'), 'print one-page marker stays');
assert.ok(html.includes('v=isassign1'), 'assign unlock marker stays');
assert.ok(html.includes('v=pwreset1'), 'password reset marker stays');
assert.ok(html.includes('>Password saved</h2>'), 'password saved heading stays');
assert.ok(html.includes('>Open Caregiver</a>'), 'open caregiver button stays');
assert.ok(html.includes('v=portal1'), 'portal marker stays');
assert.ok(html.includes('v=cgpdfv1'), 'view pdf marker stays');
assert.ok(html.includes('v=ishydr1'), 'inservice hydrate marker stays');
assert.ok(html.includes('v=bakuuid1'), 'backup uuid marker stays');
assert.ok(html.includes('v=cgpdf1'), 'letter pdf marker stays');
assert.ok(html.includes('v=home1'), 'save-home marker stays');
assert.ok(html.includes('v=nocert1'), 'nocert marker stays');
assert.ok(html.includes('v=sbseal1'), 'auth seal marker stays');
assert.ok(html.includes('v=offline1'), 'offline marker stays');

const more = html.slice(html.indexOf('id="moreScreen"'), html.indexOf('id="bottomNav"'));
assert.ok(more.includes("onclick=\"askCloudBackup()\""), 'more backup stays');
assert.ok(more.includes('>Log out</button>'), 'more logout stays');
assert.ok(more.includes('8 hours'), '8 hour note stays');
assert.ok(!/Remove office backup/i.test(html), 'remove office backup label is gone');
assert.ok(!html.includes('askDeleteCloudBackup'), 'remove handler is gone');
assert.ok(!html.includes('cgDeleteBackupBtn'), 'hidden home remove button is gone');
assert.ok(!html.includes('Remove the office backup of this draft'), 'remove confirm is gone');
assert.ok(html.includes('id="backupConfirmModal"'), 'backup confirm stays');
assert.ok(html.includes('id="deleteDraftModal"'), 'delete-draft confirm stays');

console.log('caregiver-no-rm-backup static checks ok');
