# ClassGate 🚪

A mobile-first **student portal + attendance & fee gate** in front of your live
Google Meet class. The Meet link is **never** shared directly. A student only sees
it after they:

1. **log in** to their own account (email + password their tutor gave them),
2. **owe nothing** — their ledger balance is `0`, and
3. **enter today's spoken code word** — within the check-in window.

Only then is attendance recorded and the Meet link revealed. There is **no camera
and no screen-share** anywhere in this app.

Beyond check-in, each student's portal shows their **curriculum roadmap** (what's
coming up / already covered), their **assignments** (with done/pending status), and
their **attendance + fee history**. The tutor manages everything — students,
sessions, topics, assignments, and payments — from `/admin`.

## Tech

- **Next.js 14 (App Router)** + **TypeScript** + **Tailwind CSS**
- **Neon Postgres** via `@neondatabase/serverless`
- **All database access happens in Server Actions only.** `DATABASE_URL` and SQL
  never reach the browser.
- No external auth library. Students log in with an **email + password** the tutor
  sets (no self-signup); the session is an `httpOnly` cookie. Admin is a single
  password, also an `httpOnly` cookie, re-verified on every admin action.
- Deploys to **Vercel free tier**.

---

## Pages

| Route        | Who      | What                                                              |
| ------------ | -------- | ---------------------------------------------------------------- |
| `/login`     | Students | Email + password login.                                          |
| `/portal`    | Students | Their dashboard: Class check-in, Topics, Assignments, My record. |
| `/admin`     | Tutor    | Students, Sessions, Payments, Topics, Tasks.                     |

### Student portal (`/portal`) — bottom tabs

- **Class** — when a session is open: enter the code word → marked present → Meet
  button appears. Shows "you owe Rs X" if blocked, or "no class live" otherwise.
- **Topics** — upcoming vs already-covered curriculum.
- **Tasks** — assignments with each student's own done/pending badge (they submit
  proof on WhatsApp; the tutor marks them done).
- **Record** — balance, attendance history, fee history.

The session code and Meet link are **never** sent to the client until a successful,
server-verified check-in.

### Business rules

- Missed-class penalty = **Rs 200** (`MISSED_CLASS_PENALTY` in `src/lib/constants.ts`).
- Check-in window: **15 min before** to **30 min after** `scheduled_at`.
- A student with **balance > 0** is blocked from checking in and seeing the link.
- **Only one open session at a time** — creating a session closes any open one.
- Closing a session marks every active no-show `absent` **and** adds a Rs 200 penalty.

`balance = SUM(penalty.amount) − SUM(payment.amount)`

---

## Local development

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, ADMIN_PASSWORD (SESSION_SECRET optional)
npm run dev
```

Open <http://localhost:3000>. Admin is at `/admin`, students at `/login`.

---

## Deploy (Neon + Vercel)

### 1. Create / migrate the Neon database

- **Fresh database:** open the Neon **SQL Editor** and run [`migration.sql`](./migration.sql).
- **Already using an older ClassGate DB:** run [`migration_v2.sql`](./migration_v2.sql)
  instead — it only **adds** the new login columns and the topics/assignments tables
  and never touches your existing student rows.

Copy the **pooled** connection string from Neon (Dashboard → Connection Details).

### 2. Push to GitHub

```bash
git init && git add . && git commit -m "ClassGate"
git branch -M main
git remote add origin https://github.com/<you>/classgate.git
git push -u origin main
```

### 3. Deploy on Vercel

1. <https://vercel.com> → **Add New → Project** → import the repo.
2. **Environment Variables:**
   - `DATABASE_URL` → Neon pooled connection string
   - `ADMIN_PASSWORD` → a strong password
   - `SESSION_SECRET` *(optional)* → any long random string; if omitted,
     `ADMIN_PASSWORD` is used to sign student cookies.
3. **Deploy.**

---

## Day-to-day usage

1. **Add students** (Students tab) with a **login email + password**, or bulk-paste
   `name, whatsapp, gender, email, password` lines. Send each student their email +
   password over WhatsApp. (Existing students: open **View → Set login**.)
2. **Plan the course** — add upcoming **Topics** (roadmap) and **Assignments** in
   their tabs.
3. **Before class** — Sessions tab → **Create session** (title, time, Meet link, a
   code word). Set the time to the real class start time.
4. **At class time** — **say the code word out loud** / drop it in the WhatsApp
   group. Students log in, open the **Class** tab, type the code → marked present →
   Meet button appears.
5. **After class** — **Close session**: active no-shows are marked absent + charged
   Rs 200. **Mark covered** the topics you taught.
6. **Track work** — in **Tasks**, tap the grid cell to mark each student's assignment
   done when their WhatsApp submission arrives.
7. **Payments** — record a payment to drop a student's balance and unblock them.
8. **See a student's full picture** — Students tab → **View** (attendance, fees,
   assignment progress, and set/change their login).

---

## Stop students from sharing the Meet link 🔒

Once a student sees the Meet link they *could* forward it to a non-payer. A web app
can't un-reveal a link, and Google Meet has **no public API** to auto-admit/deny people
on a normal Gmail account — so the fix is a **manual email allow-list at the Meet
lobby**, which ClassGate makes easy:

1. **Give every student a Google email** when you add them (Students tab → email).
   This is both their portal login and the address they must use in Meet.
2. **Turn on the Meet lobby.** In your Google Meet → **Host controls** → switch
   **Quick access OFF**. Now everyone waits in a lobby and you must admit them; each
   knocker shows their **name + Google email**.
3. **Each class, use the allow-list.** Open `/admin` → **Sessions** → the live session
   shows **✅ Allowed in Meet** — the name + email of every student who has checked in
   and has no dues. Tap **Copy emails** if you like.
4. **Admit only matching emails.** In the Meet lobby, admit a person only if their
   email is on the green list; **deny everyone else**. Students who owe money can't
   check in, so they never reach the list.

Notes / limits:
- Students must join Meet **signed in** to their Google account, or their email won't
  show — the portal reminds them which email to use.
- This is manual matching (no Meet auto-admit API on consumer Gmail). For fully
  automatic enforcement you'd need Google Workspace + the Meet/Calendar APIs, which is
  outside this app's scope.
- Use a **fresh Meet link per session** so any link leaked last class is dead next time.

## Security notes

- `DATABASE_URL` / `ADMIN_PASSWORD` / `SESSION_SECRET` are server-only env vars;
  `src/lib/db.ts` and `src/lib/auth.ts` import `server-only` so they never bundle
  into client code.
- Student passwords are hashed with `scrypt` (salt + hash), never stored in plain text.
- Student and admin session cookies are `httpOnly`, `secure` in production, and
  signed/HMAC'd; tampering invalidates them.
- Every admin server action calls `assertAdmin()`; every student action calls
  `requireStudentId()` — the page-load check is not the only gate.
- Balance, code matching, time window, and session state are **always** re-checked
  server-side at check-in — the client is never trusted.

## Project structure

```
migration.sql / migration_v2.sql   # schema (fresh / upgrade)
src/
  lib/
    db.ts                          # neon() client (server-only)
    auth.ts                        # admin + student cookies, password hashing (server-only)
    constants.ts                   # penalty, check-in window, cookie names
  actions/
    studentAuth.ts                 # studentLogin / studentLogout
    student.ts                     # getPortalData, checkIn (cookie-based)
    admin.ts                       # students, sessions, payments, topics, assignments
  app/
    page.tsx                       # landing
    login/                         # student login (page + LoginForm)
    portal/                        # student dashboard (page + PortalClient)
    admin/                         # auth gate, LoginForm, AdminDashboard (5 tabs)
```

> **Note on times:** the "scheduled at" / "due" / "planned" datetime fields use your
> browser's local time and are converted to an absolute UTC timestamp before saving,
> so the check-in window is correct regardless of the server's timezone.
