// Imported into the Workbox service worker (vite.config.ts -> workbox.importScripts).
// Shows DawaShield push notifications sent by the daily GitHub Action through
// Firebase Cloud Messaging, even when the app is closed.
/* eslint-disable no-restricted-globals */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = { data: { body: event.data && event.data.text() } }; }
  const d = payload.data || {};
  const n = payload.notification || {};
  const title = d.title || n.title || "DawaShield";
  const body = d.body || n.body || "";
  const url = d.url || "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: d.tag || "dawashield",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
      requireInteraction: d.kind === "flagged",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
