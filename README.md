# ClassGate 🎓

A mobile-first **student portal** for the paid **AI Engineering Course**: live class every
Sunday at 10:00 AM (Pakistan time), 2 recorded videos every week, homework, quizzes,
monthly fees and a progress score for every student.

The Google Meet link is **never** shared directly. A student only sees it after they:

1. **log in** with the email + password their tutor gave them,
2. have **no fee month unpaid past its grace period**, and
3. **enter today's spoken code word** within 30 minutes of the class starting.

## How the course is organised

- **Levels:** Batch 1 (*AI Foundations & Coding Agents*) and Batch 2 (*AI Engineering &
  Production*), 8 weekends each. The 16 weekends (topics, "you build", homework, Ng skill
  tags) are seeded from the course outline and editable in **Curriculum**.
- **Intakes:** each new group is an intake of a level, e.g. "Batch 1 — Sep 2026". There is
  no limit. Creating an intake auto-schedules one class per weekend from its first date.
- **Enrollment:** a student joins an intake; after finishing Batch 1 they can be enrolled in
  a Batch 2 intake. Each enrollment keeps its own fees, attendance, homework and score.

## Business rules

| Rule | Detail |
|---|---|
| Fee | Rs 2,000 per month × 2 months per intake (both editable per intake). Enrolling creates Month 1 (due on the first class date) and Month 2 (one month later). |
| Paying | Record one month, part of a month, or everything at once (e.g. Rs 4,000). One payment = one receipt number (`CG-2026-0001`). Discounts/waivers per month. |
| Blocking | Check-in is blocked when a month is still unpaid **7 days** (grace days, per intake) after its due date. |
| Absences | **No fines.** Closing a class marks no-shows absent. An approved leave marks the student *excused* for that class. |
| Progress score | 0–100 per enrollment: attendance 30 · homework 35 · quiz 25 · videos 10 (weights per intake). Only work that is already due counts; a part with nothing due is left out. Bands: 85+ Excellent, 70–84 Good, 50–69 Needs work, <50 At risk. |
| Weekly content | A weekend's videos and homework open 7 days before its class. Homework is due one week after the class and is marked out of 10. |

The logic lives in [`src/lib/course.ts`](src/lib/course.ts) (fees, blocking, progress) and is
always re-checked on the server.

## Pages

| Route | Who | What |
|---|---|---|
| `/` | Everyone | Landing page with login links |
| `/login` | Students | Email + password login |
| `/portal` | Students | Class, Course, Videos, Homework, Progress, Fees, Quiz, **Tools**, Leave, Ask |
| `/admin?batch=<id>` | Tutor | Dashboard, Intakes, Students, Classes, Fees, Curriculum, Homework, Progress, Quiz, **Tools**, Questions, Leave, Logs — scoped to the intake picked in the header |

**Payment details** (EasyPaisa / JazzCash / bank accounts and the WhatsApp number for
screenshots) are stored in the database and edited in **Admin → Fees → Payment accounts**.
Every student sees them in their Fees tab.

## Tech

- **Next.js 16 (App Router)** + **TypeScript** + **Tailwind CSS**, PWA with Web Push
- **Neon Postgres** via `@neondatabase/serverless`
- All database access happens in server actions / server components; `DATABASE_URL` and
  SQL never reach the browser.
- No auth library: students log in with an email + password the tutor sets; admin is a
  single password (optionally + email). Both are `httpOnly` cookies.

---

## Local development

```bash
npm install
npm run dev
```

`.env` needs `DATABASE_URL` and `ADMIN_PASSWORD` (optional: `ADMIN_EMAIL`, `CRON_SECRET`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` for push notifications).

Student emails (optional) need `EMAIL_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASSWORD` (a Gmail app password), `SMTP_FROM`, `SMTP_USE_TLS`, and `APP_URL` (the site's
base URL, used for the "Open the portal" button). Student replies go to the sending Gmail
account, or to `EMAIL_REPLY_TO` if set. Emails are sent for
new videos, homework changes, published quizzes, classes, reviews, answers, receipts and fee
reminders; the "✉ Email" button on any student sends a custom message.
Open <http://localhost:3000>; admin is at `/admin`, students at `/login`.

## Database

[`migration.sql`](migration.sql) is a **clean install** of the full schema plus seed data
(2 levels, 16 weekends, one payment account, 2 shared tools).

Once there is live data, **never** use it to add tables - it drops everything first. Additive
changes go in [`migrations/`](migrations/) and are applied with a runner that only ever adds:

```bash
node --env-file=.env scripts/apply-migration.mjs migrations/001_shared_resources.sql
node --env-file=.env scripts/apply-migration.mjs migrations/002_resource_help_video.sql
node --env-file=.env scripts/apply-migration.mjs migrations/003_resource_capacity.sql
```

Each migration is idempotent and runs in one transaction, so re-running it is harmless and a
failure leaves the database untouched. New tables are also appended to `migration.sql` so a
clean install stays in sync.

```bash
# Back up every table to backups/<timestamp>/*.json (nothing is deleted)
node --env-file=.env scripts/reset-db.mjs

# Back up, DROP every table, and install migration.sql — deletes all data
node --env-file=.env scripts/reset-db.mjs --confirm
```

`backups/` is git-ignored because it contains student data.

## Deploy (Vercel)

1. Import the repo on <https://vercel.com>.
2. Add the environment variables above (use Neon's **pooled** connection string).
3. Deploy.

---

## Day-to-day usage

1. **Intakes** → create "Batch 1 — Sep 2026" with the first class date. Eight Sunday classes
   are scheduled automatically.
2. **Curriculum** → add each weekend's 2 videos (and slides) once; every intake of that level
   gets them.
3. **Students** → add students into the intake (optionally "Paid full batch now"), or
   bulk-paste `name, whatsapp, gender, email, password, paid` lines. Send each student
   their login.
4. **Classes** → before class, **Edit** the class to add the Meet link and a code word. At
   class time press **Start**, say the code, admit only the emails in the green list, then
   **Close class**.
5. **Fees** → record payments when a screenshot arrives; tap a month to change its due date
   or give a discount; export CSV; send reminders.
6. **Homework** → mark submissions out of 10 with feedback.
7. **Tools** → approve who gets the shared Claude Code plan / OpenAI key, and relay Claude
   sign-in codes while a student's slot is running.
8. **Progress** → see everyone ranked by score; export CSV.

### Recording the screen

Before you record the admin dashboard, press **👁 Fees visible** in the header. It flips to
**🙈 Fees hidden** and every rupee amount across Dashboard, Fees, Students and Intakes
becomes `Rs •••••`, the blocked-students list is hidden and CSV export is disabled. The setting
lives in `app_settings.privacy_mode` and never affects `/portal` - a student always sees their
own fee.

## Stop students from sharing the Meet link 🔒

A web app can't un-reveal a link, and Google Meet has no public API to auto-admit people on
a normal Gmail account, so use the **lobby allow-list**:

1. Give every student a Google email (it is also their portal login).
2. In Meet → **Host controls** → turn **Quick access OFF** so everyone waits in the lobby.
3. In **Admin → Classes**, the live class lists **Checked in — admit in Meet** (name + email).
4. Admit only matching emails; deny everyone else. Students blocked for fees can't check in.

Use a fresh Meet link per class so a leaked link is dead next time.

## Security notes

- `src/lib/db.ts`, `auth.ts`, `course.ts` and `curriculum.ts` import `server-only`.
- Every admin action calls `assertAdmin()`; every student action calls `requireStudentId()`.
- The class code and Meet link are only sent after a server-verified check-in; video links
  are only sent once their weekend is open.
- Student login uses a scrypt hash. **Note:** `students.password_plain` also stores the
  password so the tutor can look it up — acceptable only for these low-stakes logins.

## Project structure

```
migration.sql                 # schema + seed (clean install)
scripts/reset-db.mjs          # backup / wipe / reinstall
src/
  lib/
    db.ts                     # Neon client with retry (server-only)
    auth.ts                   # admin + student cookies, password hashing
    course.ts                 # batches, fees, blocking, payments, progress score
    curriculum.ts             # levels, weekends, videos loader
    constants.ts              # course defaults, check-in window, tutor profile
  actions/
    admin.ts                  # students + enrollment, classes, attendance, leave, questions, logs
    batches.ts                # intakes, dashboard, progress
    fees.ts                   # fee board, payments, invoices, payment accounts
    curriculum.ts             # weekends, videos, homework review
    student.ts                # portal data, check-in, videos, homework, leave, questions
    quiz.ts                   # MCQ quizzes (per level)
  app/
    admin/                    # AdminDashboard + tabs/* + ui.tsx
    portal/                   # PortalClient + sections.tsx
```
