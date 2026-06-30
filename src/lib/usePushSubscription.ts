// @ts-nocheck
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

      // PushManager accepts base64url string directly
      const sub = await (reg.pushManager.subscribe as (o: object) => Promise<PushSubscription>)({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
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
