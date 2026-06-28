import "server-only";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to your environment variables.");
}

// The raw Neon query function. It is ONLY ever imported by server-side modules
// ("use server" actions / server components) — never by a client component, so
// DATABASE_URL never reaches the browser.
const baseSql = neon(process.env.DATABASE_URL);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Neon's serverless HTTP driver occasionally throws a transient
 * "Error connecting to database: fetch failed" — typically on a cold start or a
 * brief network blip. These are not real query errors; the same query succeeds
 * a moment later. We detect that class of error here so we can retry it.
 */
function isTransientConnectionError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("error connecting to database") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("eai_again") ||
    msg.includes("network") ||
    msg.includes("connection terminated") ||
    msg.includes("terminating connection")
  );
}

/**
 * Drop-in replacement for Neon's tagged-template `sql` that transparently
 * retries transient connection failures with a short backoff. A genuine query
 * error (bad SQL, constraint violation, etc.) is thrown immediately without
 * retrying. Every call site in this app uses `sql` only as a tagged template,
 * so wrapping just that call form is sufficient.
 */
export const sql = (async (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => {
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await baseSql(strings, ...params);
    } catch (e) {
      lastError = e;
      if (attempt === MAX_ATTEMPTS || !isTransientConnectionError(e)) throw e;
      console.warn(
        `[db] transient connection error (attempt ${attempt}/${MAX_ATTEMPTS}), retrying…`
      );
      await sleep(200 * attempt); // 200ms, then 400ms
    }
  }
  throw lastError;
}) as typeof baseSql;
