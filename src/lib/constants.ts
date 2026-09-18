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
