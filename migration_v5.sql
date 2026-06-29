-- ClassGate migration v5 — Course Roadmap (curriculum + outcomes)
-- Run this ONCE in the Neon SQL editor against your EXISTING database.
-- It only adds new tables + seed rows and never touches your existing data.
--
-- Students see a read-only "Course" tab listing every week of the course
-- (Part A = everyone / no laptop, Part B = bring your laptop) plus an
-- "After this course you can…" outcomes section. The tutor can add / edit /
-- delete all of this from the admin "Course" tab.

-- ---------------------------------------------------------------------------
-- curriculum_weeks: the course roadmap shown to every student
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS curriculum_weeks (
  id         serial PRIMARY KEY,
  sort_order int  NOT NULL DEFAULT 0,   -- controls display order (Week 0, 1, 2…)
  title      text NOT NULL,             -- e.g. "Week 0 — Welcome to AI: Foundations & Setup"
  part_a     text,                      -- "Everyone (no laptop)" content
  part_b     text,                      -- "Bring your laptop" content
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- course_outcomes: "After this course you can…" capability bullets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS course_outcomes (
  id         serial PRIMARY KEY,
  sort_order int  NOT NULL DEFAULT 0,
  body       text NOT NULL,             -- one capability statement
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_order ON curriculum_weeks(sort_order);
CREATE INDEX IF NOT EXISTS idx_outcomes_order   ON course_outcomes(sort_order);

-- ---------------------------------------------------------------------------
-- Seed the 8-week roadmap (only if the table is empty, so re-running is safe)
-- ---------------------------------------------------------------------------
INSERT INTO curriculum_weeks (sort_order, title, part_a, part_b)
SELECT * FROM (VALUES
  (0,
   'Week 0 — Welcome to AI: Foundations & Setup',
   'What is AI; types of AI; ML, DL and NLP; what is an LLM; what is an AI agent and agentic AI; what are tokens and tokenization; and how to use our ClassGate portal.',
   'Get hands-on with NotebookLM; learn prompt engineering and its techniques — zero-shot, few-shot, chain-of-thought, and role-based prompting.'),
  (1,
   'Week 1 — Prompting + How Computers Understand Us',
   'Prompting recap (role + context + example + format); what a programming language is and how a computer turns human language into actions.',
   'Create a v0 / Vercel account; build and publish a simple note-taking app.'),
  (2,
   'Week 2 — How the Internet Works',
   'What are hosting, domains, servers, and cloud storage; how the internet works — all in plain language.',
   'Improve your Vercel app, build something new, and publish it live.'),
  (3,
   'Week 3 — AI Productivity Tools + Intro to Python',
   'Do research with AI; create slides fast with Kimi; use Manus for tasks.',
   'The big idea — input → process → output. Read and understand small Python programs (variables, lists, loops, functions) in Google Colab (no-laptop students follow on screen).'),
  (4,
   'Week 4 — Coding with AI + Your First Streamlit App',
   'What is an API; what is GitHub; meet the AI coding tools — Claude Code, Claude (cowork), Codex.',
   'Build & deploy a simple Streamlit app (unit converter or study quiz) with a shareable link, and save your code to GitHub.'),
  (5,
   'Week 5 — Smarter AI (RAG) + Build a Chatbot',
   'What is RAG (giving AI your own documents to answer from), how it works, and the steps to build one.',
   'Ship a working study chatbot — easiest with Gradio in Colab (instant shareable link); Streamlit as a stretch goal.'),
  (6,
   'Week 6 — Automation with n8n (No-Code)',
   'What automation is and where it saves hours — triggers, actions, and connecting apps. Design a workflow on paper / screen together.',
   'Build a real flow in n8n (form → auto-email, or save messages → Google Sheet).'),
  (7,
   'Week 7 — AI Automations & Bots on n8n',
   'Webhooks and connecting services in plain terms; adding AI steps (auto-summarize, auto-reply); see a Telegram/WhatsApp bot in action.',
   'Deploy an AI auto-reply bot or a "summarize & email me" workflow.'),
  (8,
   'Week 8 — Capstone + Optional Earning',
   'Each student presents one project — study tool, app, chatbot, or automation. No-laptop students present the build they designed/tested.',
   'Final polish + (optional earning lane) make a freelance profile and portfolio page, and learn pricing basics.')
) AS v(sort_order, title, part_a, part_b)
WHERE NOT EXISTS (SELECT 1 FROM curriculum_weeks);

INSERT INTO course_outcomes (sort_order, body)
SELECT * FROM (VALUES
  (0, 'Use AI to study faster — summarize anything, and make notes, quizzes & slides.'),
  (1, 'Understand how code, apps, APIs, the internet and automation actually work.'),
  (2, 'Read basic Python and build & publish your own web app with Streamlit.'),
  (3, 'Build a working AI chatbot for your studies or your field.'),
  (4, 'Automate real tasks with n8n (auto-emails, bots, summaries).'),
  (5, 'Optionally earn — offer chatbot / automation / website services with a portfolio and profile.')
) AS v(sort_order, body)
WHERE NOT EXISTS (SELECT 1 FROM course_outcomes);
