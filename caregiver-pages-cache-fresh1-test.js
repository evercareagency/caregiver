#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, 'caregiver-push-sw.js'), 'utf8');

const metas = html.match(/<meta name="caregiver-build" content="[^"]+">/g);
assert.ok(metas && metas.length > 2, 'caregiver-build metas');
assert.strictEqual(metas[0], '<meta name="caregiver-build" content="2026-10-08-sec1-cg2">', 'newer tip meta is first');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-10-08-sec1-ui-h2">') > 0, 'sec1-ui-h2 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-10-08-sec1-ui">') > 0, 'sec1-ui meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-msg-composer-rect1">') > 0, 'msg-composer-rect1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pwa-install-copy1">') > 0, 'pwa-install-copy1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-care-msg-send1">') > 0, 'care-msg-send1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-aide-notif-done-hide1">') > 0, 'aide-notif-done-hide1 meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-pages-cache-fresh1">') > 0, 'pages-cache-fresh1 meta stays');
assert.ok(html.includes('<meta name="caregiver-shell" content="2026-09-29-pages-cache-fresh1">'), 'tiny shell build id');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-29-aide-home-addr1-autofill1">') > 0, 'autofill meta stays');
assert.ok(metas.indexOf('<meta name="caregiver-build" content="2026-09-28-aide-home-addr1">') > 0, 'aide-home-addr1 meta stays');
assert.ok(html.includes('<!-- caregiver-build: 2026-09-29-pages-cache-fresh1 v=pages-cache-fresh1 —'), 'pages-cache-fresh1 comment');
assert.ok(html.includes('v=pages-cache-fresh1'), 'pages-cache-fresh1 probe');
assert.ok(html.includes('https://evercareagency.github.io/caregiver/'), 'clean Home Screen URL');
assert.ok(html.includes("cache:'no-store'"), 'revalidate uses cache no-store');
assert.ok(html.includes('controllerchange'), 'page listens for controllerchange');
assert.ok(html.includes('MERGE HOLD') && html.includes('Do not squash-merge') && html.includes('Do not claim LIVE'), 'merge hold');
assert.ok(html.includes('?v=aide-home-addr1-autofill1'), 'autofill ?v= marker stays');
assert.ok(html.includes('?v=aide-home-addr1'), 'aide-home-addr1 ?v= marker stays');
assert.ok(html.includes('data-cache="?v=aide-home-addr1-autofill1"'), 'gate cache marker stays');
assert.ok(html.includes("var CLIENTHRS_SW='./caregiver-push-sw.js';"), 'push script URL stays');
assert.ok(html.includes("navigator.serviceWorker.register(CLIENTHRS_SW,{scope:'./'})"), 'push registration scope stays');
assert.ok(html.includes("var script = './caregiver-push-sw.js';"), 'shell uses the push worker URL');
assert.ok(html.includes("navigator.serviceWorker.register(script, {scope:'./', updateViaCache:'none'})"), 'shell registers that worker at scope ./');

assert.ok(sw.includes('v=clienthrs1d'), 'push marker stays on the worker');
assert.ok(sw.includes('v=pages-cache-fresh1'), 'shell marker on the worker');
assert.ok(sw.includes('skipWaiting'), 'skipWaiting');
assert.ok(sw.includes('clients.claim'), 'clientsClaim');
assert.ok(sw.includes("cache:'no-store'"), 'document fetch bypasses the HTTP cache');
assert.ok(!/caches\.(?:put|open|add|match|keys)/.test(sw), 'index.html is not written to Cache Storage');
assert.ok(sw.includes('#messages'), 'push tap opens the messages hash');
assert.ok(sw.includes('clienthrs-open-messages'), 'push tap tells the open page');
assert.ok(sw.includes("data: {open: 'messages'}"), 'push payload still opens messages');
assert.ok(!/remi\.html|\/remi(?:\/|"|')/i.test(sw), 'worker does not open a remi page');
assert.ok(!/quo/i.test(sw) && !/sms:/i.test(sw), 'push worker does not send sms');

const sliceStart = html.indexOf('// v=pages-cache-fresh1');
const sliceEnd = html.indexOf('// end v=pages-cache-fresh1', sliceStart);
assert.ok(sliceStart > 0 && sliceEnd > sliceStart, 'shell slice');
const slice = html.slice(sliceStart, sliceEnd);

function bootShell(opts){
  opts = opts || {};
  const ss = {};
  const reloads = [];
  const registers = [];
  const listeners = {};
  const fetches = [];
  const build = opts.build || '2026-09-29-pages-cache-fresh1';
  const shell = opts.shell || build;
  const ctx = {
    cgShellDidReload: false,
    cgShellBooted: false,
    cgShellReloadKey: 'cg_pages_cache_fresh1',
    location: {
      pathname: opts.pathname || '/caregiver/',
      search: opts.search || '',
      reload: function(){ reloads.push('reload'); }
    },
    sessionStorage: {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(ss, k) ? ss[k] : null; },
      setItem: function(k, v){ ss[k] = String(v); }
    },
    document: {
      visibilityState: 'visible',
      querySelector: function(sel){
        if (sel === 'meta[name="caregiver-build"]') return {content: build, getAttribute: function(){ return build; }};
        if (sel === 'meta[name="caregiver-shell"]') return {content: shell, getAttribute: function(){ return shell; }};
        return null;
      },
      addEventListener: function(name, fn){ listeners['doc:' + name] = fn; }
    },
    navigator: {
      serviceWorker: opts.noSw ? undefined : {
        controller: opts.controller || null,
        addEventListener: function(name, fn){ listeners[name] = fn; },
        register: function(script, options){
          registers.push({script: script, options: options});
          if (opts.registerThrows && options && options.updateViaCache) return Promise.reject(new Error('no updateViaCache'));
          return Promise.resolve({scope: options && options.scope, update: function(){ return Promise.resolve(); }});
        },
        getRegistration: function(){ return Promise.resolve({update: function(){ return Promise.resolve(); }}); }
      }
    },
    fetch: function(url, options){
      fetches.push({url: url, cache: options && options.cache});
      if (opts.fetchFail) return Promise.reject(new Error('offline'));
      const body = opts.there == null
        ? '<meta name="caregiver-build" content="' + build + '"><meta name="caregiver-shell" content="' + shell + '">'
        : opts.there;
      return Promise.resolve({
        ok: opts.ok !== false,
        text: function(){ return Promise.resolve(body); }
      });
    },
    addEventListener: function(name, fn){ listeners['win:' + name] = fn; },
    Promise: Promise,
    String: String
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(slice, ctx);
  ctx.reloads = reloads;
  ctx.registers = registers;
  ctx.listeners = listeners;
  ctx.fetches = fetches;
  ctx.ss = ss;
  return ctx;
}

function loadSw(){
  const listeners = {};
  const fetches = [];
  let fetchFails = 0;
  const ctx = {
    fetch: function(url, opts){
      fetches.push({url: url, cache: opts && opts.cache, request: url && url.url});
      if (fetchFails > 0) {
        fetchFails -= 1;
        return Promise.reject(new Error('network'));
      }
      return Promise.resolve({ok: true, url: typeof url === 'string' ? url : url.url, cache: opts && opts.cache});
    },
    URL: URL,
    Promise: Promise
  };
  ctx.self = {
    registration: {
      scope: 'https://evercareagency.github.io/caregiver/',
      showNotification: function(title, opts){
        ctx.shown = {title: title, opts: opts};
        return Promise.resolve();
      }
    },
    clients: {
      claim: function(){ ctx.claimed = true; return Promise.resolve(); },
      matchAll: function(){ return Promise.resolve(ctx.clients || []); },
      openWindow: function(url){ ctx.opened = url; return Promise.resolve(); }
    },
    skipWaiting: function(){ ctx.skipped = true; return Promise.resolve(); },
    addEventListener: function(name, fn){ listeners[name] = fn; }
  };
  vm.createContext(ctx);
  vm.runInContext(sw, ctx);
  ctx.listeners = listeners;
  ctx.fetches = fetches;
  ctx.failNext = function(n){ fetchFails = n; };
  return ctx;
}

(async function(){
  const same = bootShell();
  const sameResult = await same.cgShellRevalidate();
  assert.strictEqual(sameResult, false, 'matching build id does not reload');
  assert.strictEqual(same.reloads.length, 0, 'no reload when the clean URL is current');
  assert.strictEqual(same.fetches[0].url, '/caregiver/', 'revalidate fetches the clean path');
  assert.strictEqual(same.fetches[0].cache, 'no-store', 'revalidate bypasses the HTTP cache');
  assert.strictEqual(same.fetches.length, 1, 'a match does not prefetch a second copy');

  const withQuery = bootShell({search: '?v=aide-home-addr1-autofill1'});
  await withQuery.cgShellRevalidate();
  assert.strictEqual(withQuery.fetches[0].url, '/caregiver/', 'probe ?v= is not part of the revalidate URL');

  const nextHtml = '<meta name="caregiver-shell" content="2099-01-01-next"><meta name="caregiver-build" content="2099-01-01-next">';
  const stale = bootShell({there: nextHtml});
  const staleResult = await stale.cgShellRevalidate();
  assert.strictEqual(staleResult, true, 'mismatch asks for one hard reload');
  assert.strictEqual(stale.fetches[0].cache, 'no-store');
  assert.strictEqual(stale.fetches[1].cache, 'reload', 'uncontrolled mismatch refreshes the HTTP cache before reload');
  assert.strictEqual(stale.reloads.length, 1, 'hard reload once');
  assert.strictEqual(stale.ss.cg_pages_cache_fresh1, '2099-01-01-next|2099-01-01-next');
  stale.cgShellDidReload = false;
  const again = await stale.cgShellRevalidate();
  assert.strictEqual(again, true, 'the fetched id still differs');
  assert.strictEqual(stale.reloads.length, 1, 'the same mismatch does not reload a second time');

  const controlled = bootShell({there: nextHtml, controller: {}});
  await controlled.cgShellRevalidate();
  assert.strictEqual(controlled.fetches.length, 1, 'a controlling worker does the fresh navigation itself');
  assert.strictEqual(controlled.fetches[0].cache, 'no-store');
  assert.strictEqual(controlled.reloads.length, 1);

  const offline = bootShell({fetchFail: true, there: nextHtml});
  const offlineResult = await offline.cgShellRevalidate();
  assert.strictEqual(offlineResult, false, 'offline revalidate stays quiet');
  assert.strictEqual(offline.reloads.length, 0);

  const junk = bootShell({there: '<html><title>not the portal</title></html>'});
  await junk.cgShellRevalidate();
  assert.strictEqual(junk.reloads.length, 0, 'a page without the build meta does not reload');

  const reg = bootShell();
  const registration = await reg.cgShellRegister();
  assert.strictEqual(registration.scope, './');
  assert.strictEqual(reg.registers.length, 1);
  assert.strictEqual(reg.registers[0].script, './caregiver-push-sw.js');
  assert.strictEqual(reg.registers[0].options.scope, './');
  assert.strictEqual(reg.registers[0].options.updateViaCache, 'none');

  const legacy = bootShell({registerThrows: true});
  await legacy.cgShellRegister();
  assert.strictEqual(legacy.registers.length, 2, 'falls back when updateViaCache is refused');
  assert.strictEqual(legacy.registers[1].script, './caregiver-push-sw.js');
  assert.strictEqual(legacy.registers[1].options.scope, './');
  assert.ok(!legacy.registers[1].options.updateViaCache, 'fallback keeps scope ./');

  const control = bootShell();
  control.cgShellWatchController();
  control.listeners.controllerchange();
  control.listeners.controllerchange();
  assert.strictEqual(control.reloads.length, 1, 'controllerchange reloads once');

  const cert = bootShell({search: '?certSample=1'});
  cert.cgShellBoot();
  assert.strictEqual(cert.registers.length, 0, 'cert sample does not register a worker');
  assert.strictEqual(cert.fetches.length, 0, 'cert sample does not revalidate');

  const boot = bootShell();
  boot.cgShellBoot();
  boot.cgShellBoot();
  assert.strictEqual(boot.registers.length, 1, 'boot registers once');
  assert.strictEqual(boot.registers[0].script, './caregiver-push-sw.js');
  assert.ok(boot.listeners.controllerchange, 'boot listens for controllerchange');

  const worker = loadSw();
  const installWaits = [];
  worker.listeners.install({waitUntil: function(p){ installWaits.push(p); }});
  await Promise.all(installWaits);
  assert.strictEqual(worker.skipped, true, 'install skipWaiting');
  const activateWaits = [];
  worker.listeners.activate({waitUntil: function(p){ activateWaits.push(p); }});
  await Promise.all(activateWaits);
  assert.strictEqual(worker.claimed, true, 'activate clientsClaim');

  let responded = false;
  worker.listeners.fetch({
    request: {method: 'GET', mode: 'no-cors', destination: 'script', url: 'https://evercareagency.github.io/caregiver/app.js', headers: {get: function(){ return '*/*'; }}},
    respondWith: function(){ responded = true; }
  });
  assert.strictEqual(responded, false, 'scripts stay on the browser cache path');

  let nav;
  worker.listeners.fetch({
    request: {method: 'GET', mode: 'navigate', destination: 'document', url: 'https://evercareagency.github.io/caregiver/', headers: {get: function(){ return 'text/html'; }}},
    respondWith: function(p){ nav = p; }
  });
  const navRes = await nav;
  assert.strictEqual(worker.fetches[0].cache, 'no-store', 'navigation is network-first and not long-cached');
  assert.strictEqual(navRes.url, 'https://evercareagency.github.io/caregiver/');
  assert.strictEqual(worker.fetches.length, 1, 'a live navigation does not also read a stored shell');

  worker.failNext(1);
  let fallback;
  worker.listeners.fetch({
    request: {method: 'GET', mode: 'navigate', destination: 'document', url: 'https://evercareagency.github.io/caregiver/'},
    respondWith: function(p){ fallback = p; }
  });
  await fallback;
  assert.strictEqual(worker.fetches[1].cache, 'no-store');
  assert.ok(worker.fetches[2].request, 'offline falls back without a Cache Storage shell');

  const pushWaits = [];
  worker.listeners.push({
    data: {json: function(){ return {title: 'EverCare', body: 'Submit today', display_name: 'Remi'}; }},
    waitUntil: function(p){ pushWaits.push(p); }
  });
  await Promise.all(pushWaits);
  assert.strictEqual(worker.shown.title, 'EverCare');
  assert.strictEqual(worker.shown.opts.body, 'Remi — Submit today');
  assert.strictEqual(worker.shown.opts.data.open, 'messages');

  const clickWaits = [];
  worker.listeners.notificationclick({
    notification: {close: function(){ worker.closed = true; }},
    waitUntil: function(p){ clickWaits.push(p); }
  });
  await Promise.all(clickWaits);
  assert.strictEqual(worker.closed, true);
  assert.strictEqual(worker.opened, 'https://evercareagency.github.io/caregiver/#messages');

  worker.clients = [{
    url: 'https://evercareagency.github.io/caregiver/',
    focus: function(){ worker.focused = true; return Promise.resolve(); },
    postMessage: function(msg){ worker.posted = msg; },
    navigate: function(url){ worker.navigated = url; return Promise.resolve(); }
  }];
  const focusWaits = [];
  worker.listeners.notificationclick({
    notification: {close: function(){}},
    waitUntil: function(p){ focusWaits.push(p); }
  });
  await Promise.all(focusWaits);
  assert.strictEqual(worker.focused, true);
  assert.strictEqual(worker.posted.type, 'clienthrs-open-messages');
  assert.strictEqual(worker.navigated, 'https://evercareagency.github.io/caregiver/#messages');

  console.log('pages-cache-fresh1 ok');
  console.log('marker proof: ' + metas[0]);
})().catch(function(err){
  console.error(err);
  process.exit(1);
});
