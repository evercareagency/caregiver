#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert.ok(html.includes('v=cgacct1'), 'cgacct1 marker');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-25-cgacct1 v=cgacct1 —'), 'cgacct1 comment');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgacct1">'), 'cgacct1 meta');
assert.ok(html.includes('<meta name="caregiver-build" content="2026-09-25-cgsave1">'), 'cgsave1 meta stays');
assert.ok(html.includes('v=cgsave1') && html.includes('v=coveraide1') && html.includes('v=cgsiglock1'), 'later markers stay');
assert.ok(html.includes('v=cgauth1') && html.includes('v=offline1'), 'auth and offline markers stay');

const home = html.slice(html.indexOf('id="cgHomeView"'), html.indexOf('id="cgFormView"'));
assert.ok(home.includes('id="callOffHomeBtn"'), 'home call off stays');
assert.ok(home.includes('>Call off</button>'), 'home call off label');
assert.ok(home.includes('id="cgBackupBtn"'), 'home backup stays');
assert.ok(home.includes("Back up this week's draft"), 'home backup label');
assert.ok(home.includes('onclick="askCloudBackup()"'), 'home backup action stays');

const account = html.slice(html.indexOf('id="moreScreen"'), html.indexOf('id="bottomNav"'));
assert.ok(account.includes('> Account</div>'), 'account header stays');
assert.ok(account.includes('id="more_aide_line"'), 'account username stays');
assert.ok(account.includes('8 hours'), '8-hour session copy stays');
assert.ok(account.includes('>Log out</button>'), 'log out stays');
assert.ok(account.includes('(216) 377-5991'), 'office phone stays');
assert.ok(account.includes('Home') && account.includes('Timesheet'), 'home and timesheet help stays');
assert.ok(!account.includes('>Call off</button>') && !account.includes('id="callOffMoreBtn"'), 'account has no call off');
assert.ok(!account.includes("Back up this week's draft") && !account.includes('askCloudBackup'), 'account has no backup');

const authSlice = html.slice(html.indexOf('id="authScreen"'), html.indexOf('id="locDeniedScreen"'));
assert.ok(authSlice.includes('id="loginBtn"'), 'login stays');
assert.ok(!authSlice.includes('cgacct1'), 'auth screen is not this tip');

console.log('caregiver-cgacct1 static checks ok');
