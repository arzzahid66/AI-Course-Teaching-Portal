// Business rules and shared constants.

/**
 * Ensure a pasted link is an absolute URL. Tutors sometimes paste a link
 * without the scheme (e.g. "meet.google.com/abc-defg-hij" or
 * "youtu.be/xyz"). Rendered in an `<a href>`, a scheme-less value is treated as
 * a RELATIVE path, so the student is sent to `/portal/meet.google.com/...` on
 * the portal domain and gets a 404 instead of the real destination. Prefix
 * `https://` when the value has no scheme so the link always points outward.
 */
export function normalizeUrl(raw: string | null | undefined): string {
  const link = (raw ?? "").trim();
  if (!link) return "";
  if (/^https?:\/\//i.test(link)) return link;
  return `https://${link}`;
}

/**
 * Turn a pasted YouTube link into one that can go in an `<iframe src>`, or
 * null when it is not a YouTube link at all.
 *
 * Tutors paste whatever the Share button gave them, so all the usual shapes
 * are accepted: `watch?v=`, `youtu.be/`, `/shorts/`, `/live/` and an already
 * embeddable `/embed/`. A `?t=` start time is carried over, because "watch
 * from here" links are exactly what someone shares when the useful part is
 * two minutes in.
 *
 * Returning null is not a failure - callers fall back to a plain outward link,
 * so a Drive or Loom recording still works, just without the inline player.
 *
 * The embed points at youtube-nocookie.com: students are minors in some cases,
 * and this way YouTube sets no tracking cookie unless they actually press play.
 */
export function youtubeEmbedUrl(raw: string | null | undefined): string | null {
  const link = normalizeUrl(raw);
  if (!link) return null;

  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }

  const host = u.hostname.replace(/^www\./i, "").toLowerCase();
  const path = u.pathname;
  let id = "";

  if (host === "youtu.be") id = path.slice(1);
  else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (path === "/watch") id = u.searchParams.get("v") ?? "";
    else if (path.startsWith("/embed/")) id = path.slice(7);
    else if (path.startsWith("/shorts/")) id = path.slice(8);
    else if (path.startsWith("/live/")) id = path.slice(6);
  }

  id = id.split("/")[0];
  // YouTube ids are 11 chars today, but the range keeps that from being a
  // rule we have to revisit; the character class is the part that matters.
  if (!/^[A-Za-z0-9_-]{8,16}$/.test(id)) return null;

  const t = u.searchParams.get("t") ?? u.searchParams.get("start") ?? "";
  const secs = /^(\d+)s?$/.exec(t)?.[1] ?? "";

  return `https://www.youtube-nocookie.com/embed/${id}${secs ? `?start=${secs}` : ""}`;
}

/** Alias kept for the class / Google Meet check-in link. @see normalizeUrl */
export const normalizeMeetLink = normalizeUrl;

/** One named link inside a Library resource (a recording or a slides file). */
export type ResourceLink = { label: string; url: string };

/**
 * Parse a resource's multi-line link text into structured links. A Library item
 * can hold several recordings and/or several slide files: the tutor enters one
 * link per line in the admin form, optionally naming it as "Label | https://…".
 * Blank lines are ignored, each URL is normalized to an absolute https URL, and
 * a line with no "|" has an empty label (the UI then shows a sensible default).
 */
export function parseResourceLinks(raw: string | null | undefined): ResourceLink[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf("|");
      const label = i >= 0 ? line.slice(0, i).trim() : "";
      const rawUrl = i >= 0 ? line.slice(i + 1).trim() : line;
      return { label, url: normalizeUrl(rawUrl) };
    })
    .filter((l) => l.url.length > 0);
}

/** Re-serialize parsed links back to the stored "Label | url" multi-line text. */
export function serializeResourceLinks(links: ResourceLink[]): string {
  return links.map((l) => (l.label ? `${l.label} | ${l.url}` : l.url)).join("\n");
}

/**
 * Check-in stays open this many minutes AFTER the tutor opens the session
 * (i.e. measured from the session's created_at / class start), not from the
 * scheduled time. Latecomers past this are too late and must be let in by the
 * tutor manually.
 */
export const CHECKIN_WINDOW_MIN = 30;

// ---------------------------------------------------------------------------
// Quiz (MCQ modules) defaults. Used to pre-fill the admin create-quiz form and
// to size a re-attempt grant. Each quiz stores its own final values in the DB.
// ---------------------------------------------------------------------------

/** Default total time limit (minutes) suggested when creating a new quiz. */
export const QUIZ_DEFAULT_TIME_MIN = 10;

/** Default pass mark (%) suggested when creating a new quiz. */
export const QUIZ_DEFAULT_PASS_PERCENT = 50;

/** Default number of attempts a student gets per quiz. */
export const QUIZ_DEFAULT_MAX_ATTEMPTS = 2;

/** How many fresh attempts an approved re-attempt request grants. */
export const QUIZ_REATTEMPT_GRANT = 2;

// ---------------------------------------------------------------------------
// Course defaults. Each intake stores its own values; these pre-fill the
// "Create intake" form. Payment accounts + the WhatsApp number live in the DB
// (admin → Fees → Payment accounts).
// ---------------------------------------------------------------------------

/** Course name shown across the app. */
export const COURSE_NAME = "AI Engineering Course";

/** Default monthly fee (Rs) for a new intake. */
export const DEFAULT_MONTHLY_FEE = 2000;

/** Default number of paid months per intake (one level = 2 months). */
export const DEFAULT_MONTHS = 2;

/** Default weekends (weekly classes) per intake. */
export const DEFAULT_WEEKENDS = 8;

/** Default days after a due date before an unpaid month blocks check-in. */
export const DEFAULT_GRACE_DAYS = 7;

/** Default class time (Pakistan time) for auto-scheduled classes. */
export const DEFAULT_CLASS_TIME = "10:00";

// ---------------------------------------------------------------------------
// Instructors — shown to every student in the "About the instructors" card,
// opened from the Teachers button in the portal header. Add, remove or reorder
// freely; the card shows each person's initials, so no photos are needed.
// ---------------------------------------------------------------------------

export type Instructor = {
  /** Full name, shown in bold and used for the initials circle. */
  name: string;
  /** Role and where they work, e.g. "AI Engineer at Xeven Solutions". */
  role: string;
  /** A sentence or two for students. Keep it simple and jargon-free. */
  bio: string;
  /** Full https:// link to their LinkedIn profile. "" hides the button. */
  linkedin: string;
};

export const INSTRUCTORS: Instructor[] = [
  {
    name: "Abdul Rehman Zahid",
    role: "AI Engineer at Xeven Solutions",
    bio: "3 years of experience building real-world AI applications.",
    linkedin: "https://www.linkedin.com/in/abdul-rehman-zahid-5a34b628a/",
  },
  {
    name: "Muhammad Faizan Mumtaz",
    role: "AI Engineer at Xeven Solutions",
    bio: "2 years of experience building production AI systems and automations.",
    linkedin: "https://www.linkedin.com/in/muhammad-faizan-mumtaz/",
  },
  {
    name: "Bushra Akram",
    role: "AI Educator & Technical Content Creator at Philadelphia Training and Technician Institute, USA",
    bio: "She teaches AI, Prompt Engineering, Python, and n8n, with a special focus on AI for Kids.",
    linkedin: "https://www.linkedin.com/in/bushra-akram-3ba49a279/",
  },
];

/** Name of the httpOnly admin session cookie. */
export const ADMIN_COOKIE = "classgate_admin";

/** Name of the httpOnly student session cookie. */
export const STUDENT_COOKIE = "classgate_student";

// ---------------------------------------------------------------------------
// Fee-due banner (student portal)
// ---------------------------------------------------------------------------

/**
 * How many days before a month's due date the banner starts warning about it.
 *
 * Without this the banner announced next month's fee the moment the current
 * month was paid off - a student who had just paid saw "Month 2 fee is due"
 * over a month early, which reads as a demand rather than a reminder. Seven
 * days matches the grace period, so the student gets a week of notice and then
 * a week of grace.
 */
export const FEE_BANNER_LEAD_DAYS = 7;

/**
 * sessionStorage key prefix for a banner the student has closed. Session, not
 * local, on purpose: closing it silences that month for the rest of the visit,
 * and the next sign-in shows it again. Cleared on logout too, so logging back
 * in on the same device brings it back.
 */
export const FEE_BANNER_DISMISS_PREFIX = "fee-banner-closed:";

// ---------------------------------------------------------------------------
// Privacy Mode — hides every rupee amount across the ADMIN dashboard so the
// tutor can screen-record the portal without showing who has paid what. The
// student portal is never affected: a student always sees their own fee.
// ---------------------------------------------------------------------------

/** `app_settings` key holding "on" / "off" for admin-side Privacy Mode. */
export const PRIVACY_MODE_KEY = "privacy_mode";

/** What a hidden amount looks like. Dots, not a blur: a blur can be read back off a video. */
export const MASKED_AMOUNT = "Rs •••••";

// ---------------------------------------------------------------------------
// Shared tools — students take turns on the Claude Code Pro plan and the
// OpenAI API key. Each tool stores its own values in the DB; these only
// pre-fill the "Add tool" form.
// ---------------------------------------------------------------------------

/** Default longest single booking (minutes). 300 = Claude's rolling 5-hour window. */
export const RESOURCE_DEFAULT_MAX_MIN = 300;

/** Default wait after a slot ends before the same student may book it again. */
export const RESOURCE_DEFAULT_COOLDOWN_H = 24;

/** Default how far ahead a student may book. */
export const RESOURCE_DEFAULT_AHEAD_DAYS = 14;

/** Durations offered in the student's booking form (minutes). */
export const RESOURCE_DURATIONS = [60, 120, 180, 240, 300];

// --- Claude sign-in code relay -------------------------------------------
//
// claude.ai's "Continue with email" does NOT email a code. It emails the
// account owner a magic sign-in LINK; clicking it shows the owner a
// verification code, which the student then types into the screen they are
// already sitting on. So the student must reach that screen FIRST — the portal
// gates the "Ask for code" button on a confirmation to enforce that order.

/** The account students sign in as. Shown, and copyable, in the portal. */
export const CLAUDE_LOGIN_EMAIL = "arailearn66@gmail.com";

/**
 * Where time-sensitive tutor alerts go: "a student is waiting for a sign-in
 * code", and the slot-ended revoke reminder.
 *
 * Deliberately the same inbox as CLAUDE_LOGIN_EMAIL: Anthropic's "Sign in to
 * Claude.ai" link lands there too, so the alert and the link the tutor needs
 * to act on sit side by side in one place.
 *
 * Kept separate from ADMIN_EMAIL, which is the admin *login* identity and is
 * not necessarily a real inbox. `TUTOR_ALERT_EMAIL` in the environment
 * overrides this.
 */
export const TUTOR_ALERT_EMAIL = CLAUDE_LOGIN_EMAIL;

/**
 * How long the portal keeps showing a relayed code. This is our own safety
 * bound, NOT the real deadline: Anthropic's magic link expires 10 minutes
 * after it was sent and has already been ticking. Keep it short and tell the
 * student to hurry rather than implying the countdown is authoritative.
 */
export const LOGIN_CODE_TTL_MIN = 5;

/** Most code requests one slot may make, so the tutor's inbox can't be spammed. */
export const LOGIN_CODE_MAX_PER_SLOT = 5;

/** How often the student's portal checks whether the tutor has sent the code. */
export const LOGIN_CODE_POLL_MS = 5000;
