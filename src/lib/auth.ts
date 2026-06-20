import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, STUDENT_COOKIE } from "./constants";

function requireAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    throw new Error("ADMIN_PASSWORD is not set. Add it to your environment variables.");
  }
  return pw;
}

/**
 * Deterministic, opaque session token derived from ADMIN_PASSWORD.
 * The raw password is never stored in the cookie; only this hash is.
 * Changing ADMIN_PASSWORD instantly invalidates all existing sessions.
 */
export function adminSessionToken(): string {
  return crypto
    .createHash("sha256")
    .update("classgate:v1:" + requireAdminPassword())
    .digest("hex");
}

/** Constant-time comparison of two same-length hex strings. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** True if the supplied plaintext password matches ADMIN_PASSWORD. */
export function checkAdminPassword(candidate: string): boolean {
  const expected = requireAdminPassword();
  const a = crypto.createHash("sha256").update(candidate).digest("hex");
  const b = crypto.createHash("sha256").update(expected).digest("hex");
  return safeEqual(a, b);
}

/**
 * True if the supplied email matches ADMIN_EMAIL (case-insensitive).
 * If ADMIN_EMAIL is not set, the email field is ignored (password-only mode).
 */
export function checkAdminEmail(candidate: string): boolean {
  const expected = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!expected) return true; // backward-compatible: no email required
  return candidate.trim().toLowerCase() === expected;
}

/** Set the httpOnly admin cookie after a successful login. */
export function setAdminCookie(): void {
  cookies().set(ADMIN_COOKIE, adminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
}

export function clearAdminCookie(): void {
  cookies().delete(ADMIN_COOKIE);
}

/** Read the cookie and verify it matches the current password's token. */
export function isAdmin(): boolean {
  const value = cookies().get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  return safeEqual(value, adminSessionToken());
}

/** Throw if the caller is not an authenticated admin. Call inside every admin action. */
export function assertAdmin(): void {
  if (!isAdmin()) {
    throw new Error("Not authorized");
  }
}

/** Generate a long, URL-safe, unguessable student token (24 chars). */
export function generateStudentToken(): string {
  return crypto.randomBytes(18).toString("base64url"); // 18 bytes -> 24 chars
}

// ===========================================================================
// Student passwords + sessions
// ===========================================================================

/** Hash a plaintext password as `scrypt$<saltHex>$<hashHex>`. */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Verify a plaintext password against a stored `scrypt$salt$hash` string. */
export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = crypto.scryptSync(plain, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/** Secret used to sign student session cookies. Falls back to ADMIN_PASSWORD. */
function studentSigningKey(): string {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error("SESSION_SECRET or ADMIN_PASSWORD must be set.");
  }
  return "classgate-student:v1:" + secret;
}

function signStudentId(id: number): string {
  return crypto
    .createHmac("sha256", studentSigningKey())
    .update(String(id))
    .digest("hex");
}

export function setStudentCookie(id: number): void {
  const value = `${id}.${signStudentId(id)}`;
  cookies().set(STUDENT_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export function clearStudentCookie(): void {
  cookies().delete(STUDENT_COOKIE);
}

/** Read + verify the student cookie. Returns the student id or null. */
export function getStudentSession(): number | null {
  const value = cookies().get(STUDENT_COOKIE)?.value;
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const idPart = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const id = Number(idPart);
  if (!Number.isInteger(id) || id <= 0) return null;
  const expected = signStudentId(id);
  if (!safeEqual(sig, expected)) return null;
  return id;
}

/** Throw if no student is logged in; otherwise return the student id. */
export function requireStudentId(): number {
  const id = getStudentSession();
  if (id === null) throw new Error("Not logged in");
  return id;
}
