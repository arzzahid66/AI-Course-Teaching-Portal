-- ClassGate schema — AI Engineering Course (paid, Batch 1 / Batch 2)
-- Clean install. Run via `node --env-file=.env scripts/reset-db.mjs --confirm`
-- (which backs up and drops the old tables first), or on an empty database.

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
CREATE TABLE students (
  id             serial PRIMARY KEY,
  name           text NOT NULL,
  whatsapp       text,
  gender         text,
  token          text UNIQUE,
  email          text UNIQUE,
  password_hash  text,
  password_plain text,
  status         text NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Curriculum: levels (Batch 1 / Batch 2) and their weekends
-- ---------------------------------------------------------------------------
CREATE TABLE course_levels (
  level    int PRIMARY KEY CHECK (level IN (1, 2)),
  title    text NOT NULL,
  promise  text,
  outcomes text                         -- one outcome per line
);

CREATE TABLE weekends (
  id         serial PRIMARY KEY,
  level      int  NOT NULL REFERENCES course_levels(level),
  weekend_no int  NOT NULL,
  title      text NOT NULL,
  ng_skill   text,                      -- e.g. "3.1, 3.2"
  tag        text,                      -- PROJECT / PROJECT A / CAPSTONE …
  topics     text,                      -- one bullet per line
  you_build  text,
  homework   text,
  slides     text,                      -- extra links, one per line: "Label | url"
  UNIQUE (level, weekend_no)
);

CREATE TABLE weekend_videos (
  id         serial PRIMARY KEY,
  weekend_id int  NOT NULL REFERENCES weekends(id) ON DELETE CASCADE,
  title      text NOT NULL,
  url        text NOT NULL,
  kind       text NOT NULL DEFAULT 'topic' CHECK (kind IN ('topic', 'hands_on', 'extra')),
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE video_progress (
  student_id int NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  video_id   int NOT NULL REFERENCES weekend_videos(id) ON DELETE CASCADE,
  watched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, video_id)
);

-- ---------------------------------------------------------------------------
-- Intakes and enrollment
-- ---------------------------------------------------------------------------
CREATE TABLE batches (
  id           serial PRIMARY KEY,
  name         text NOT NULL,                       -- "Batch 1 — Sep 2026"
  level        int  NOT NULL REFERENCES course_levels(level),
  start_date   date NOT NULL,                       -- first class day
  class_time   time NOT NULL DEFAULT '10:00',       -- Asia/Karachi
  weekends     int  NOT NULL DEFAULT 8,
  months       int  NOT NULL DEFAULT 2,
  monthly_fee  int  NOT NULL DEFAULT 2000,
  grace_days   int  NOT NULL DEFAULT 7,
  status       text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed')),
  w_attendance int  NOT NULL DEFAULT 30,            -- progress weights
  w_homework   int  NOT NULL DEFAULT 35,
  w_quiz       int  NOT NULL DEFAULT 25,
  w_videos     int  NOT NULL DEFAULT 10,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE enrollments (
  id         serial PRIMARY KEY,
  student_id int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  batch_id   int  NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dropped')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, batch_id)
);

-- ---------------------------------------------------------------------------
-- Fees
-- ---------------------------------------------------------------------------
CREATE TABLE fee_invoices (
  id            serial PRIMARY KEY,
  enrollment_id int  NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  month_no      int  NOT NULL,
  due_date      date NOT NULL,
  amount        int  NOT NULL,
  discount      int  NOT NULL DEFAULT 0,
  note          text,
  UNIQUE (enrollment_id, month_no)
);

CREATE SEQUENCE receipt_seq;

CREATE TABLE payments (
  id         serial PRIMARY KEY,
  invoice_id int  NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  student_id int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount     int  NOT NULL CHECK (amount > 0),
  method     text NOT NULL DEFAULT 'EasyPaisa',
  reference  text,                                  -- transaction ID
  receipt_no text NOT NULL,                         -- shared by the rows of one payment
  note       text,
  paid_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_accounts (
  id             serial PRIMARY KEY,
  method         text NOT NULL,                     -- EasyPaisa / JazzCash / Bank
  account_title  text,
  account_number text,
  bank_name      text,
  iban           text,
  instructions   text,
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_settings (
  key   text PRIMARY KEY,
  value text
);

-- ---------------------------------------------------------------------------
-- Classes and attendance
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id           serial PRIMARY KEY,
  batch_id     int  NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  weekend_id   int  REFERENCES weekends(id) ON DELETE SET NULL,
  title        text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  meet_link    text NOT NULL DEFAULT '',
  code         text NOT NULL DEFAULT '',
  is_open      boolean NOT NULL DEFAULT false,
  closed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attendance (
  id            serial PRIMARY KEY,
  student_id    int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id    int  NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('present', 'absent', 'excused')),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_id)
);

CREATE TABLE leave_requests (
  id           serial PRIMARY KEY,
  student_id   int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id   int  REFERENCES sessions(id) ON DELETE SET NULL,
  lesson_title text,
  lesson_at    timestamptz,
  reason       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  feedback     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Homework
-- ---------------------------------------------------------------------------
CREATE TABLE homework_submissions (
  id            serial PRIMARY KEY,
  enrollment_id int  NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  weekend_id    int  NOT NULL REFERENCES weekends(id) ON DELETE CASCADE,
  link_url      text NOT NULL,
  note          text,
  status        text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'needs_changes', 'approved')),
  marks         int  CHECK (marks BETWEEN 0 AND 10),
  feedback      text,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz,
  UNIQUE (enrollment_id, weekend_id)
);

-- ---------------------------------------------------------------------------
-- Questions, logins, push
-- ---------------------------------------------------------------------------
CREATE TABLE questions (
  id          serial PRIMARY KEY,
  student_id  int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject     text,
  body        text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  answer      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);

CREATE TABLE login_logs (
  id         serial PRIMARY KEY,
  student_id int REFERENCES students(id) ON DELETE SET NULL,
  role       text NOT NULL DEFAULT 'student',
  name       text,
  email      text,
  ip         text,
  user_agent text,
  is_pwa     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id         serial PRIMARY KEY,
  student_id int REFERENCES students(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'student',
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- MCQ quizzes. quiz_options.is_correct is the answer key — never sent to the
-- browser; scoring is server-side (src/actions/quiz.ts). level NULL = all levels.
-- ---------------------------------------------------------------------------
CREATE TABLE quizzes (
  id                    serial PRIMARY KEY,
  title                 text NOT NULL,
  description           text,
  level                 int REFERENCES course_levels(level),
  time_limit_sec        int  NOT NULL DEFAULT 600,
  pass_percent          int  NOT NULL DEFAULT 50,
  max_attempts          int  NOT NULL DEFAULT 2,
  questions_per_attempt int  NOT NULL DEFAULT 0,
  is_published          boolean NOT NULL DEFAULT false,
  sort_order            int  NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quiz_questions (
  id         serial PRIMARY KEY,
  quiz_id    int  NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  body       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0
);

CREATE TABLE quiz_options (
  id          serial PRIMARY KEY,
  question_id int  NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  body        text NOT NULL,
  is_correct  boolean NOT NULL DEFAULT false,
  sort_order  int  NOT NULL DEFAULT 0
);

CREATE TABLE quiz_attempts (
  id           serial PRIMARY KEY,
  quiz_id      int  NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id   int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  score        int,
  total        int,
  percent      int,
  passed       boolean,
  question_ids int[],
  started_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  submitted_at timestamptz
);

CREATE TABLE quiz_reattempt_requests (
  id             serial PRIMARY KEY,
  quiz_id        int  NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id     int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  grant_attempts int  NOT NULL DEFAULT 2,
  feedback       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_enrollments_batch     ON enrollments(batch_id);
CREATE INDEX idx_enrollments_student   ON enrollments(student_id);
CREATE INDEX idx_invoices_enrollment   ON fee_invoices(enrollment_id);
CREATE INDEX idx_payments_invoice      ON payments(invoice_id);
CREATE INDEX idx_payments_student      ON payments(student_id);
CREATE INDEX idx_sessions_batch        ON sessions(batch_id, scheduled_at);
CREATE INDEX idx_sessions_is_open      ON sessions(is_open);
CREATE INDEX idx_attendance_session    ON attendance(session_id);
CREATE INDEX idx_attendance_student    ON attendance(student_id);
CREATE INDEX idx_weekend_videos        ON weekend_videos(weekend_id, sort_order);
CREATE INDEX idx_homework_weekend      ON homework_submissions(weekend_id);
CREATE INDEX idx_homework_status       ON homework_submissions(status);
CREATE INDEX idx_questions_student     ON questions(student_id);
CREATE INDEX idx_questions_status      ON questions(status);
CREATE INDEX idx_leave_student         ON leave_requests(student_id);
CREATE INDEX idx_leave_status          ON leave_requests(status);
CREATE INDEX idx_login_logs_created    ON login_logs(created_at DESC);
CREATE INDEX idx_login_logs_student    ON login_logs(student_id);
CREATE INDEX idx_push_student          ON push_subscriptions(student_id);
CREATE INDEX idx_push_role             ON push_subscriptions(role);
CREATE INDEX idx_quiz_questions_quiz   ON quiz_questions(quiz_id, sort_order);
CREATE INDEX idx_quiz_options_question ON quiz_options(question_id, sort_order);
CREATE INDEX idx_quiz_attempts_student ON quiz_attempts(student_id, quiz_id);
CREATE INDEX idx_quiz_reattempt_status ON quiz_reattempt_requests(status);
CREATE INDEX idx_quiz_reattempt_pair   ON quiz_reattempt_requests(student_id, quiz_id);

-- ---------------------------------------------------------------------------
-- Seed: payment account + settings (the admin edits these in Fees → Payment accounts)
-- ---------------------------------------------------------------------------
INSERT INTO payment_accounts (method, account_title, account_number, instructions, sort_order)
VALUES ('EasyPaisa', 'Abdul Rehman Zahid', '03487356993',
        'Write your full name in the transfer note, then send the screenshot on WhatsApp.', 0);

INSERT INTO app_settings (key, value) VALUES ('tutor_whatsapp', '923487356003');

-- ---------------------------------------------------------------------------
-- Seed: course levels (from the 15-Sep-2026 course outline)
-- ---------------------------------------------------------------------------
INSERT INTO course_levels (level, title, promise, outcomes) VALUES
(1, 'AI Foundations & Coding Agents',
 $t$By the end you will understand how LLMs actually work, be able to direct a coding agent properly, write a real specification, and have three finished projects plus a live portfolio.$t$,
 $t$3 completed projects
2 live URLs
A portfolio
A client-ready demo video
The ability to direct a coding agent instead of just hoping it works$t$),
(2, 'AI Engineering & Production',
 $t$Move from "it works on my laptop" to systems that are reliable, measured and production-ready — the skills employers are actually screening for.$t$,
 $t$Production-level grounding
A working agent with guardrails
A real evaluation suite
A monitored deployment
The vocabulary to hold your own in an AI engineering interview$t$);

-- ---------------------------------------------------------------------------
-- Seed: 16 weekends
-- ---------------------------------------------------------------------------
INSERT INTO weekends (level, weekend_no, title, ng_skill, tag, topics, you_build, homework) VALUES
(1, 1, 'How LLMs Actually Work', '1.1', NULL,
 $t$What AI, machine learning and LLMs really are — in plain language, no maths
Tokens, context window and knowledge cut-off — and why each one matters to you
Temperature and sampling — controlling how random the output is
Cache hits and cost — how to spend less for the same result
When to trust an LLM and when not to — knowing where it is strong and where it will fail
Choosing the right model for the job — one model does not fit everything$t$,
 'A custom AI assistant for a real business, plus a cost comparison across three models',
 'Find three tasks where the AI gives you a wrong answer. Write down why you think it failed.'),
(1, 2, 'Writing a Spec + Your First Live Build', '4.1', 'PROJECT',
 $t$Prompting properly: role, context, examples, output format — then we stop calling it "prompt engineering"
Writing a specification: what is the problem, who is the user, what does success look like
Why a clear spec produces a better result than a clever prompt
No-code AI builders (Lovable / Replit) — turning a spec into a working website
Publishing and sharing a live link$t$,
 'Your first live website with a working chatbot — from a written spec, not a guess',
 'Write a one-page spec for your own idea, then build it.'),
(1, 3, 'Coding Agents, Part 1: Directing the Work', '3.1, 3.2', NULL,
 $t$Setting up a coding agent (Cursor / Claude Code)
The professional workflow: Plan → Execute → Deploy & Monitor, and why it loops back
Breaking a task into verifiable steps — the single most useful habit you will learn
Choosing autonomy level: interactive back-and-forth, delegating a chunk, or setting a goal and letting it run
Giving the agent the right context — decisions, feedback, changed assumptions
Running it safely — permissions, and avoiding data loss$t$,
 'Your first real working script — planned properly, not vibe-coded blindly',
 'Build one small tool. Submit your plan document alongside the code.'),
(1, 4, 'Coding Agents, Part 2: Reviewing & Customizing', '3.3, 3.4, 3.5', NULL,
 $t$How an agent actually works — it is a harness wrapped around an LLM
Spotting failure modes: over-engineering a simple problem, skipping verification, stopping before the goal, or being about to destroy your files
Reviewing agent output — testing user flows, asking for screenshots as evidence
Standing context files (CLAUDE.md / AGENTS.md) so the agent knows your codebase
Cleaning up agent-generated mess before it becomes permanent
Why "run agents for hours and burn millions of tokens" is social media hype, not practice$t$,
 'A reviewed, cleaned-up project with its own context file — the way professionals actually work',
 $t$Take last week's tool and review it properly. List everything the agent got wrong.$t$),
(1, 5, 'Your Own AI Tool: APIs & Tool Calling', '1.1', NULL,
 $t$What an API is — explained simply
API keys, keeping them safe, and controlling spending
Connecting your code to an AI model
Structured output — forcing the AI to return clean, usable data every time
Tool calling — giving the model a calculator, a search, a database$t$,
 'A working AI tool that runs on your machine and returns reliable, structured results',
 'Add one new tool to your assistant and prove it works.'),
(1, 6, 'Grounding AI With Your Own Data', '1.2', 'PROJECT A',
 $t$Why the model does not know your company's information
Embeddings and AI search — explained without maths
Turning PDFs, price lists, policies and FAQs into something an AI can use
Deciding what goes in the prompt versus what the AI should go and fetch
Stopping made-up answers$t$,
 $t$Project A: A chatbot that answers questions from a real business's documents$t$,
 'Rebuild it with a real PDF from a real local business.'),
(1, 7, 'Automation, Deployment & Going Live', '1.3, 1.5', 'PROJECT B',
 $t$Workflow automation with n8n — trigger → AI thinks → action happens
Connecting AI to Google Sheets, Gmail and WhatsApp
Fallbacks — what happens when a step fails, so the whole thing does not crash
Deploying your project (Railway / Vercel / Render)
Environment variables, spending limits, and testing before a client sees it$t$,
 'Project B: A live automation with a real URL that anyone can open',
 'Deploy Project A and Project B. Share both links.'),
(1, 8, 'Your First Client + Demo Day', '4.2, 4.4', 'PROJECT C',
 $t$Product sense: understanding what a user actually needs, not what sounds impressive
Choosing one niche: clinics, property, restaurants or e-commerce
The method that works: build the demo first, pitch second
Recording a 2-minute screen video that sells for you
Pricing, proposals, LinkedIn profile and portfolio setup
High-agency ownership — spotting problems and proposing solutions without waiting to be asked
Presentation of all student projects$t$,
 'Project C: A working demo built for one real local business, plus a live portfolio',
 'Send your demo to five real businesses.'),
(2, 1, 'Software Engineering Fundamentals', '2.1', NULL,
 $t$Why fundamentals matter more, not less, now that agents write the code
The trade-offs an agent silently makes for you: latency, availability, consistency, reliability, maintainability, cost
Frontend basics: components, caching, rendering
Backend basics: API design, authentication, session and state management
Asynchronous processing, data persistence and testing$t$,
 'A proper front-end plus back-end version of your Batch 1 project', NULL),
(2, 2, 'Managing Data Properly', '2.2', NULL,
 $t$Access patterns — how will the data be used, how often, and by whom
Choosing storage: relational tables, documents, key-value, graphs
Transactions and concurrency — what breaks when two people act at once
Keeping data clean, consistent and fresh
Privacy, governance and compliance
Key point: your AI takes its context from your data — if the data architecture is wrong, only you can fix that$t$,
 'A real database behind your AI application, designed on purpose', NULL),
(2, 3, 'Grounding at Production Level', '1.2', NULL,
 $t$Chunking strategies — and why bad chunking quietly ruins your answers
Choosing an embedding model
Vector index vs knowledge graph vs semantic layer — picking the right representation for your data
Hybrid search and reranking for much better retrieval
Building a data pipeline that keeps everything fresh
When RAG is the wrong answer and something simpler is better$t$,
 'A properly indexed, refreshable knowledge base — not a tutorial demo', NULL),
(2, 4, 'Evaluation-Driven Development', '1.4', 'MOST IMPORTANT',
 $t$Reading traces and outputs — what is actually happening inside your system
Error analysis — finding out why it fails, not just that it failed
Choosing your eval type: deterministic code checks, LLM-as-a-judge, human-in-the-loop
Building your own test set from real failures
Evaluating your evals — is your test itself correct?
Running the loop continuously: evaluate, fix, evaluate, fix$t$,
 'A full evaluation suite that proves your system works — the strongest single item in an AI portfolio', NULL),
(2, 5, 'Agentic Systems, Part 1: Design', '1.3', NULL,
 $t$Two kinds of system: workflows (a defined sequence) vs agent harness (the LLM decides the next step)
Which steps to chain, which to run in parallel
When to use plain code instead of an LLM call — not everything needs a model
Tool calling and the agent loop, with limits that stop runaway cost
Giving agents access through MCP, CLI and sandboxes
Designing fallbacks for every step$t$,
 'A working agent that completes a multi-step task and degrades gracefully when something fails', NULL),
(2, 6, 'Agentic Systems, Part 2: Memory & Safety', '1.3', NULL,
 $t$Memory architecture — how an agent remembers across conversations
Managing context in long sessions without overflowing
Single agent vs multi-agent — and when multi-agent is just extra complexity
Prototype to production: guardrails, adversarial inputs, prompt injection, preventing data exfiltration
A look at what is next: voice agents, computer-use agents, generative UI$t$,
 'An agent with memory, guardrails, and a documented security review', NULL),
(2, 7, 'Running It In Production', '1.5, 2.4, 2.5', NULL,
 $t$Observability — knowing what your system did with real users, and why
Tracking performance and detecting drift as the model degrades over time
Handling model failures and security incidents
Testing strategy — unit and integration tests, regression testing, CI/CD
Designing for failure: graceful degradation, minimising blast radius
"Shift left" security — thinking about it at the start, not the end
Optimising cost and latency: model choice, simplification, caching$t$,
 'A monitored, tested, cost-controlled deployment with alerts that actually fire', NULL),
(2, 8, 'Architecture, Shaping the Build & Capstone', '2.3, 4.2, 4.3, 4.4', 'CAPSTONE',
 $t$System decomposition — breaking a system into sensible parts
Monolith vs microservices, and choosing a tech stack
Architecture as a moving target — prototype, production and scale each look different
Shaping the build: prototype → MVP → shipping in small batches
Business sense — market size, unit economics, why a project gets funded or killed
Explaining to non-technical people what is and is not feasible
Final capstone presentation, CV and portfolio review$t$,
 'Capstone: One complete, deployed, evaluated AI system you can put at the top of your CV', NULL);

-- ---------------------------------------------------------------------------
-- 001 — Shared tool bookings + login-code relay
--
-- Students who have paid in full book a turn on a shared tool (the Claude Code
-- Pro plan, the OpenAI API key). The tutor approves, and for Claude relays the
-- one-time sign-in code through the portal so no password is ever shared.
--
-- Additive and idempotent: safe against a live database, and safe to run twice.
--   node --env-file=.env scripts/apply-migration.mjs migrations/001_shared_resources.sql
-- ---------------------------------------------------------------------------

-- Needed by the EXCLUDE constraint below: it mixes an int (=) with a range (&&)
-- inside one GiST index, which core GiST cannot do on its own.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS shared_resources (
  id              serial PRIMARY KEY,
  name            text NOT NULL,
  blurb           text,                              -- shown to students on the card
  handover_note   text,                              -- how they will actually get access
  help_video_url  text,                              -- YouTube link: how to get and use it
  max_minutes     int  NOT NULL DEFAULT 300,         -- longest booking; 0 = no cap
  capacity        int  NOT NULL DEFAULT 1,           -- how many students may hold it at once
  cooldown_hours  int  NOT NULL DEFAULT 24,          -- wait after a slot before booking again
  book_ahead_days int  NOT NULL DEFAULT 14,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_resources_name ON shared_resources(lower(name));

CREATE TABLE IF NOT EXISTS resource_requests (
  id                 serial PRIMARY KEY,
  resource_id        int  NOT NULL REFERENCES shared_resources(id) ON DELETE CASCADE,
  student_id         int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  seat               int  NOT NULL DEFAULT 1,  -- which place inside the tool's capacity
  reason             text NOT NULL,
  start_at           timestamptz NOT NULL,
  end_at             timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  feedback           text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  reviewed_at        timestamptz,
  revoke_notified_at timestamptz,                    -- set once the slot-end email has gone out
  CONSTRAINT resource_req_window CHECK (end_at > start_at)
);

-- The "only one student at a time" rule, enforced by Postgres instead of by
-- application code: two APPROVED bookings of the same tool can never overlap,
-- however many Approve clicks land at the same moment.
DO $$ BEGIN
  ALTER TABLE resource_requests ADD CONSTRAINT resource_no_overlap
    EXCLUDE USING gist (
      resource_id WITH =,
      seat        WITH =,
      tstzrange(start_at, end_at) WITH &&
    )
    WHERE (status = 'approved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One row per "I need a sign-in code" during a slot. A slot can legitimately
-- need several (the session drops, the student switches device). `code` is
-- NULL until the tutor sends it and NULL again once used or expired, so a live
-- code is never left sitting in the database.
CREATE TABLE IF NOT EXISTS resource_login_codes (
  id           serial PRIMARY KEY,
  request_id   int  NOT NULL REFERENCES resource_requests(id) ON DELETE CASCADE,
  asked_at     timestamptz NOT NULL DEFAULT now(),
  code         text,
  sent_at      timestamptz,
  expires_at   timestamptz,
  used_at      timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_resource_req_status  ON resource_requests(status);
CREATE INDEX IF NOT EXISTS idx_resource_req_student ON resource_requests(student_id, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_req_window  ON resource_requests(resource_id, start_at);
CREATE INDEX IF NOT EXISTS idx_login_codes_request  ON resource_login_codes(request_id, asked_at DESC);

-- Seed the two tools that exist today. The tutor edits these in Admin -> Tools.
INSERT INTO shared_resources (name, blurb, handover_note, max_minutes, cooldown_hours, sort_order)
VALUES
  ('Claude Code Pro',
   'Shared Claude Code Pro plan. Claude allows a rolling 5-hour usage window, so one booking is at most 5 hours.',
   'Ask for the sign-in code from this page during your slot - your tutor sends it straight away. The password is never shared.',
   300, 24, 0),
  ('OpenAI API key',
   'Shared OpenAI API key for practice. Keep your spending small and stop as soon as your slot ends.',
   'The key is sent to you on WhatsApp. Stop using it as soon as your slot ends.',
   180, 24, 1)
ON CONFLICT DO NOTHING;
