// Business rules and shared constants.

/** Penalty (in Rs) charged to a student who misses a class. */
export const MISSED_CLASS_PENALTY = 200;

/** Reason text stored on the penalty ledger row. */
export const MISSED_CLASS_REASON = "Missed class";

/**
 * Check-in stays open this many minutes AFTER the tutor opens the session
 * (i.e. measured from the session's created_at / class start), not from the
 * scheduled time. Latecomers past this are too late and must be let in by the
 * tutor manually.
 */
export const CHECKIN_WINDOW_MIN = 30;

// ---------------------------------------------------------------------------
// Payment details shown to a blocked student (so they can clear their dues).
// Change these to your own numbers.
// ---------------------------------------------------------------------------

/** EasyPaisa account number students send their missed-class fee to. */
export const PAYMENT_EASYPAISA_NUMBER = "03487356993";

/** Account holder name shown next to the EasyPaisa number (optional). */
export const PAYMENT_ACCOUNT_NAME = "";

/**
 * Tutor WhatsApp number for payment screenshots, in international format
 * (country code, digits only — no '+' or spaces) for wa.me links.
 * e.g. Pakistan 0348... -> 92348...
 */
export const TUTOR_WHATSAPP_NUMBER = "923487356003";

/** Name of the httpOnly admin session cookie. */
export const ADMIN_COOKIE = "classgate_admin";

/** Name of the httpOnly student session cookie. */
export const STUDENT_COOKIE = "classgate_student";
