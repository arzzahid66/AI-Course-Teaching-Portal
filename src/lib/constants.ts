// Business rules and shared constants.

/** Penalty (in Rs) charged to a student who misses a class. */
export const MISSED_CLASS_PENALTY = 200;

/** Reason text stored on the penalty ledger row. */
export const MISSED_CLASS_REASON = "Missed class";

/** Check-in window: opens this many minutes BEFORE scheduled_at. */
export const CHECKIN_WINDOW_BEFORE_MIN = 15;

/** Check-in window: closes this many minutes AFTER scheduled_at. */
export const CHECKIN_WINDOW_AFTER_MIN = 30;

/** Name of the httpOnly admin session cookie. */
export const ADMIN_COOKIE = "classgate_admin";

/** Name of the httpOnly student session cookie. */
export const STUDENT_COOKIE = "classgate_student";
