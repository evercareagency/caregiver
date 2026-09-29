/* v=clienthrs1d — web push for caregiver Messages.
   A tap opens the same Remi thread (#messages). Remi is never a full page.
   v=pages-cache-fresh1 — this is still the only worker. Scope stays ./ .
   skipWaiting + clientsClaim. Document navigations are network-first.
   index.html is never written into Cache Storage, so the clean Home Screen URL
   is not stuck on GitHub Pages max-age=600. */
self.addEventListener('install', function(event){
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(event){
  event.waitUntil(self.clients.claim());
});

function cgShellIsDocument(request){
  if (!request || request.method !== 'GET') return false;
  if (request.mode === 'navigate') return true;
  var dest = request.destination || '';
  return dest === 'document';
}

function cgShellNetworkFirst(request){
  var url = request && request.url ? request.url : '';
  return fetch(url, {cache:'no-store', credentials:'same-origin', redirect:'follow'}).catch(function(){
    return fetch(request);
  });
}

self.addEventListener('fetch', function(event){
  var request = event.request;
  if (!cgShellIsDocument(request)) return;
  if (!request.url || request.url.indexOf('http') !== 0) return;
  event.respondWith(cgShellNetworkFirst(request));
});

self.addEventListener('push', function(event){
  var payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {body: event.data ? event.data.text() : ''};
  }
  if (!payload || typeof payload !== 'object') payload = {};
  var title = payload.title || 'EverCare';
  var body = payload.body || payload.message || '';
  var who = payload.display_name || payload.displayName || '';
  if (who && body && body.indexOf(who) !== 0) body = who + ' — ' + body;
  event.waitUntil(self.registration.showNotification(title, {
    body: body,
    tag: payload.tag || 'evercare-messages',
    renotify: true,
    data: {open: 'messages'}
  }));
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var target = new URL('./#messages', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(list){
    var i;
    for (i = 0; i < list.length; i++) {
      if (!list[i].url || list[i].url.indexOf(self.registration.scope) !== 0) continue;
      return (function(client){
        var focus = client.focus ? client.focus() : Promise.resolve();
        return Promise.resolve(focus).then(function(){
          try { client.postMessage({type: 'clienthrs-open-messages'}); } catch (e) {}
          if (typeof client.navigate === 'function') return client.navigate(target).catch(function(){});
        });
      })(list[i]);
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  }));
});
