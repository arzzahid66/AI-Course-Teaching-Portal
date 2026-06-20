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

/** Name of the httpOnly admin session cookie. */
export const ADMIN_COOKIE = "classgate_admin";

/** Name of the httpOnly student session cookie. */
export const STUDENT_COOKIE = "classgate_student";
