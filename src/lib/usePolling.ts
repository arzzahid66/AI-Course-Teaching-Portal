"use client";

import { useEffect, useRef } from "react";

/**
 * Re-run `fetcher` on an interval so a page stays current without the user
 * pressing refresh.
 *
 * Why polling and not a websocket: this app runs on Vercel serverless with
 * Neon's HTTP driver. There is no long-lived process to hold a socket open,
 * and Neon over HTTP cannot LISTEN/NOTIFY, so even a server-sent-events
 * endpoint would end up polling the database on the server instead of the
 * client - same queries, plus a connection Vercel bills for by the second.
 * A short poll from the one or two people looking at a tab is cheaper and has
 * nothing to reconnect after a sleep/wake.
 *
 * Two things this does that a bare setInterval does not:
 *
 *   * **Pauses while the tab is hidden.** Browsers throttle background timers
 *     to roughly once a minute, so an unpaused interval does not really keep
 *     running - it just produces unpredictable gaps and pointless queries.
 *   * **Fetches immediately when the tab becomes visible again**, which is the
 *     moment the user is actually looking. That matters a lot here: a student
 *     waiting for a Claude sign-in code is switching between claude.ai and
 *     this tab, and should see the code the instant they come back.
 *
 * Calls never overlap - if one is still in flight, the next tick is skipped.
 */
export function usePolling(
  fetcher: () => Promise<void>,
  intervalMs: number,
  enabled = true
): void {
  // Kept in a ref so a fetcher redefined on every render does not restart the
  // interval, which would reset the clock and effectively never fire.
  const latest = useRef(fetcher);
  latest.current = fetcher;

  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;

    async function tick() {
      if (stopped || inFlight.current || document.hidden) return;
      inFlight.current = true;
      try {
        await latest.current();
      } catch {
        // A dropped poll is not worth showing anyone; the next tick recovers.
      } finally {
        inFlight.current = false;
      }
    }

    const id = setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
