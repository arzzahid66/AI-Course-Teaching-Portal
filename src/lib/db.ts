import "server-only";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to your environment variables.");
}

// `sql` is a tagged-template query function. It is ONLY ever imported by
// server-side modules ("use server" actions / server components) — never by a
// client component, so DATABASE_URL never reaches the browser.
export const sql = neon(process.env.DATABASE_URL);
