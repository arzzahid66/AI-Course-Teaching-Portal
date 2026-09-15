# ClassGate Revamp — AI Engineering Course (paid)

This file is the plan and progress tracker for the revamp. Update it as tasks are finished.

## Context
- **Old course:** the free 8-week course with Rs 200 fines is finished. All old data is backed up to `backups/` and then wiped.
- **New course:** the paid **AI Engineering Course** (outline dated 15 Sep 2026).
  - **Levels:** Batch 1 (AI Foundations & Coding Agents) and Batch 2 (AI Engineering & Production).
  - **Length:** 8 weekends each, with a live class every **Sunday at 10:00 AM** (Asia/Karachi) and 2 recorded videos every week.
  - **Fee:** **Rs 2,000 per month**, so Rs 4,000 per batch. A student can pay one month at a time or the full batch at once. Every payment is recorded.
  - **Intakes:** unlimited, and new intakes keep starting. The first intake starts **Sun 20 Sep 2026**.

## Decisions (confirmed by the user)
1. **No fines, no automatic repeat.** Absences are only counted, and they lower the student's progress score.
2. **Progress score (0–100) for each enrollment.** Weights are editable per intake:
   | Part | Default weight | Measured as |
   |---|---|---|
   | Attendance | 30 | present ÷ (closed sessions − excused) |
   | Homework | 35 | average of marks/10 over weekends whose homework is due; not submitted = 0 |
   | Quiz | 25 | average of the best attempt % over published quizzes for the level; not attempted = 0 |
   | Videos | 10 | watched ÷ videos of weekends already held |
   - **Only due items count**, so future weekends are never counted as 0.
   - **Bands:** 85+ Excellent · 70–84 Good · 50–69 Needs work · <50 At risk.
   - **Leave:** an approved leave for a session marks the student `excused` for it.
3. **Unpaid fee blocks check-in.** A student is blocked when any month is still unpaid after `due_date + grace_days` (default 7, editable per intake).
4. **Payment accounts are dynamic.**
   - EasyPaisa, JazzCash and bank details live in the DB and the admin edits them. The WhatsApp number for payment screenshots is also a DB setting.
   - Every student always sees them in the Fees tab.
   - They are seeded with the current values (EasyPaisa 03487356993, WhatsApp 923487356003).
5. **Extras this round:** weekly videos (marked watched) and homework (a link, marked out of 10 with feedback).
6. **Not this round:** public apply page, portfolio/projects, certificates, automatic reminders, removing `password_plain`.

## Implementation choices
- **Intake:** `batches` row. Creating one auto-generates N weekly sessions from `start_date` at `class_time`, each linked to weekend 1..N of its level (`is_open=false`).
- **Enrollment:** `enrollments(student_id, batch_id)`. A student's *current* enrollment is the latest `active` one. The portal shows that batch.
- **Fees:**
  - Enrolling creates `fee_invoices` month 1..`months`. Month k is due on `start_date + (k-1) months`, and the amount is `monthly_fee`.
  - `recordPayment(enrollment, amount, target)`: `target` is a month or `auto`, which fills unpaid months oldest first. One receipt number `CG-YYYY-NNNN` is shared by the rows of a single payment.
- **Curriculum:**
  - `course_levels(level, title, promise, outcomes)` holds the per-level text.
  - `weekends(level, weekend_no, …, slides)` holds the 16 weekends seeded from the PDF. Slides / extra links are multi-line "Label | url", reusing `parseResourceLinks`.
  - `weekend_videos` holds the videos for each weekend, and `video_progress` records who watched what.
- **Weekend timing:**
  - Weekend N is *open* to students from 7 days before its session.
  - Its videos count toward progress once its session time has passed.
  - Its homework is due at the next session, or 7 days after the last session.
- **Quizzes:** `quizzes.level` (NULL = all levels). A student sees published quizzes for their level.
- **Dropped:** `ledger`, `topics`, `assignments`, `assignment_status`, `curriculum_weeks`, `course_outcomes`, `resources`.
- **Admin intake picker:** `/admin?batch=<id>`, defaulting to the newest active/upcoming batch.
- **Code layout:**
  - New server actions go in separate files: `src/actions/batches.ts`, `fees.ts`, `curriculum.ts`, `homework.ts`, `progress.ts`.
  - New admin tabs go in `src/app/admin/tabs/*.tsx`, with shared UI in `src/app/admin/ui.tsx`.

## Schema (migration.sql, clean install)
- **Kept:** `students`, `login_logs`, `push_subscriptions`, `questions`, `quiz_*`.
- **Kept with changes:**
  - `sessions`: + `batch_id` NOT NULL, `weekend_id`.
  - `attendance.status`: present / absent / excused.
  - `leave_requests`, `quizzes`: + `level`.
- **New:** `batches`, `enrollments`, `fee_invoices`, `payments`, `payment_accounts`, `app_settings`, `course_levels`, `weekends`, `weekend_videos`, `video_progress`, `homework_submissions` (+ `marks`).

## Tasks
- [x] 1. `scripts/reset-db.mjs`: backup every table to `backups/<ts>/`, then with `--confirm` drop all tables and run `migration.sql`. Add `backups/` to `.gitignore`.
- [x] 2. New `migration.sql`: schema + seed (levels, 16 weekends, payment account, settings).
- [x] 3. Run the backup + reset against the DB.
- [x] 4. Server actions: batches/enrollment, fees + payment accounts + settings, curriculum/videos, homework, progress.
- [x] 5. Update `admin.ts`: remove ledger/topics/curriculum/resources/assignments; batch-scope students/sessions; `closeSession` with no penalty; leave approval → excused.
- [x] 6. Update `student.ts`: new `getPortalData` (enrollment, fees, accounts, weekends, videos, homework, progress), fee-based blocking, mark video watched, submit homework.
- [x] 7. Update `quiz.ts`: level filter.
- [x] 8. Admin UI: intake picker; Dashboard, Intakes, Students, Classes, Fees (+ accounts), Curriculum, Homework, Progress; keep Quiz/Questions/Leave/Logs.
- [x] 9. Student portal: Class (checklist), Course, Videos, Homework, Progress, Fees (+ how to pay), Quiz, Leave, Ask.
- [x] 10. Constants/copy: remove fine constants and "100% free" copy; move payment details to the DB; rebrand to "AI Engineering Course".
- [x] 11. `npx tsc --noEmit` + `npm run build` clean.
- [x] 12. End-to-end test with test students (see Verification), then wipe test data.
- [x] 13. README update.

## Verification
1. Create "Batch 1 — Sep 2026" starting 2026-09-20 → 8 Sunday 10:00 sessions exist (Sep 20 … Nov 8).
2. Student A added with a full payment (Rs 4,000) → both months paid, one receipt.
3. Student B unpaid; move month 1's due date into the past beyond the grace days → B blocked; record a payment → unblocked.
4. Close a session → the absent student has no fine and their attendance part drops. An approved leave → excused.
5. Mark videos watched, submit homework, admin gives 7/10 with feedback → progress matches a hand calculation in both views.
6. Admin edits the payment account → the student Fees tab shows the new details.
7. Fees CSV export matches the payments.

## Progress log
- 2026-09-15: plan approved; user said "go" for the wipe.
- 2026-09-15: tasks 1–3 done. Backup of 19 tables / 995 rows (58 students) in backups/2026-09-15T18-24-*; DB wiped; new schema seeded (16 weekends, 2 levels, 1 payment account).
- 2026-09-15: tasks 4–7 done (server). Shared logic in `src/lib/course.ts` (fees, blocking, progress, accounts) and `src/lib/curriculum.ts`; actions in `admin.ts` (students/enrollment/classes/leave/questions/logs), `batches.ts` (intakes, dashboard, progress), `fees.ts`, `curriculum.ts` (weekends, videos, homework review), `student.ts` (portal, videos, homework), `quiz.ts` (level). Server type-check clean; UI next.
- 2026-09-15: task 8 done — admin UI split into src/app/admin/tabs/* (Dashboard, Intakes, Students, Classes, Fees+accounts, Curriculum, Homework, Progress) with shared src/app/admin/ui.tsx; Quiz/Questions/Leave/Logs kept in AdminDashboard.tsx; quiz form has a level select.
- 2026-09-15: tasks 9–10 done — portal: new sections in src/app/portal/sections.tsx (Course, Videos, Homework, Progress, Fees + HowToPay, week checklist, fee block card); Quiz/Leave/Ask kept. Fine constants + hardcoded payment details removed; landing/meta copy rebranded. Full tsc clean.
- 2026-09-16: tasks 11–13 done. `npm run build` clean. E2E test (Playwright, temp admin password on port 3100) passed all 7 verification checks: 8 Sunday classes Sep 20–Nov 8; full payment → both months paid on one receipt; overdue month blocks check-in and payment unblocks; wrong code rejected, right code reveals Meet link; close → absent with no fine; approved leave → excused; videos + homework 7/10 → progress B 86 (Excellent) / A 0 (At risk), matching hand calculation; payment account edit shows in portal; payments CSV correct. Fixed during testing: "This week" card showed a not-yet-open weekend; fees copy duplicated when one month left; admin page computed progress twice. Test data wiped with reset script (DB is clean: 16 weekends, 2 levels, 1 payment account). README rewritten.

## Before launch (for the tutor)
- Fix the EasyPaisa / WhatsApp numbers in Admin → Fees → Payment accounts if one is wrong (seeded: 03487356993 / 923487356003).
- Create the intake "Batch 1 — Sep 2026" starting 2026-09-20, add Weekend 1 videos, add students, set each class's Meet link + code.
- Run `migration.sql`-based reset only on purpose — it deletes everything.
- 2026-09-16: removed the old "How to use this portal" and "How to submit homework" YouTube cards from the student Class tab (and their PORTAL_DEMO_YOUTUBE_ID / ASSIGNMENT_GUIDE_YOUTUBE_ID constants) — old-course videos.
