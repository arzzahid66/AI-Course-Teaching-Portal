// Custom service worker additions — merged by next-pwa
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "ClassGate", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "ClassGate", {
      body: data.body || "",
      icon: "/icons/icon-192x192.svg",
      badge: "/icons/icon-192x192.svg",
      data: { url: data.url || "/" },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
