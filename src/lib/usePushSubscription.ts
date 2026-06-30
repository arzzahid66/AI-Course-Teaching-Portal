"use client";

import { useEffect } from "react";

type SaveFn = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) => Promise<void>;

export function usePushSubscription(saveFn: SaveFn) {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return;

    async function subscribe() {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        // Refresh the subscription in DB in case it changed
        await saveFn({
          endpoint: existing.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(existing.getKey("p256dh")!))),
            auth: btoa(String.fromCharCode(...new Uint8Array(existing.getKey("auth")!))),
          },
        });
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey!),
      });

      const key = sub.getKey("p256dh");
      const authKey = sub.getKey("auth");
      if (!key || !authKey) return;

      await saveFn({
        endpoint: sub.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
          auth: btoa(String.fromCharCode(...new Uint8Array(authKey))),
        },
      });
    }

    subscribe().catch(() => {});
  }, [saveFn]);
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
  return arr.buffer as ArrayBuffer;
}
