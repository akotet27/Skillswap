# SkillSwap

A peer-to-peer skill-mentorship marketplace: trade time, not money. Teach
someone for an hour and earn a credit; spend a credit to learn from someone
else. Matching, scheduling, real-time chat, and video calls all happen
directly on the platform — no linking out to Zoom or Calendly.

## Features

**Accounts & profiles**
- Email/password signup with OTP email verification, Google OAuth, TOTP 2FA
- JWT access tokens + rotating refresh tokens (with reuse detection)
- Profile editor: photo, bio, username, timezone, age
- "Skills I have" / "skills I want" tagging with autocomplete
- Weekly availability editor, timezone-aware
- Public profile pages (`/u/:username`), badges earned
- Admin-managed suspend/ban (blocks login, reversible)

**Matching & booking**
- Mutual-match algorithm: both sides' have/want sets must complement,
  ranked by how much weekly availability actually overlaps
- Swap requests with accept/decline, `.ics` calendar invites, reminder emails
- "Notify me" waitlist for a skill nobody teaches yet — emailed once someone
  does (daily sweep)

**Credits & escrow**
- Immutable ledger: every row is a single `+1`/`-1` (or a fraction for
  duration-based earning, see below) — no row is ever edited in place
- Teaching a session earns a credit, held in escrow for 24h after
  completion before it's spendable
- **Duration-based partial credit**: what you earn is proportional to how
  much of the scheduled time you were actually connected for (capped at a
  full credit at 100%, nothing at all under 5 connected minutes) — tracked
  from real join/leave timestamps on the video call, not just "did the
  session happen"
- Manual admin credit adjustments (with a required reason, logged)

**Messaging**
- Real-time chat over WebSocket, typing indicators, online presence
- **End-to-end encrypted text messages** — ECDH (P-256) key exchange +
  AES-GCM, keys generated and kept in the browser (IndexedDB), the server
  only ever stores/relays ciphertext
- Edit and delete your own messages (soft-delete, "message was deleted"
  placeholder)
- Voice notes and file attachments, with a preview-before-send step for
  files and inline image thumbnails
- Unread badges + toast notifications that follow you around the app, not
  just inside an open conversation
- WhatsApp/Telegram-style split view: conversation list + open chat side
  by side, single-pane on narrow screens

**Video calls**
- Custom peer-to-peer WebRTC, full-mesh signaling over a hand-rolled
  `ConnectionManager` (no third-party video SDK)
- Screen sharing, in-call chat, emoji reactions, guest invite links
  (join without an account)
- Instant join — no lead-time gate, either side can start whenever they're
  both ready
- **Minimize a call to a floating corner window** and keep using the rest
  of the app (check messages, browse, etc.) without hanging up — the call
  survives navigating away from its own page

**Moderation & admin**
- Report a user after a completed session; admin queue to review and
  resolve reports
- Suspend/unsuspend accounts, manual credit adjustments
- Admin analytics: signups over time, most-taught/wanted skills, sessions
  completed, credits in circulation, average time-to-first-match

**Known gap:** ratings are scaffolded (model + public-profile display of
`rating_average`/`rating_count`) but there's no endpoint to actually submit
one yet — every profile currently shows zero ratings. Semantic
(embedding-based) skill matching was scoped but not built — it needs
`sentence-transformers`/`torch`, a genuinely heavy dependency that wasn't
worth pulling in for this pass.

## Tech stack

- **Backend**: FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL, Redis, Celery
  (email sends, the hourly credit-escrow sweep, the daily waitlist sweep)
- **Frontend**: React + Vite, React Router, Recharts (admin/home charts)
- **Real-time**: raw WebSockets for chat, video signaling, presence, and
  notifications — one shared connection-manager abstraction, not separate
  systems per feature

## Prerequisites

- Python 3.11+ (developed against 3.14; if you're on something older and
  hit a `password cannot be longer than 72 bytes` error from passlib on
  login/signup, reinstall the exact `bcrypt==4.0.1` pin in
  `requirements.txt` — newer bcrypt breaks passlib's backend detection)
- Node.js + **pnpm** (not npm) — run `pnpm approve-builds` after
  `pnpm install` the first time, or Vite's `esbuild` postinstall script
  won't run
- PostgreSQL and Redis running locally (Docker is the easiest way)

## Quick start

**Backend:**

```bash
cd backend
python -m venv .venv
./.venv/Scripts/activate        # Windows; `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
cp .env.example .env            # fill in DATABASE_URL, JWT_SECRET_KEY, etc.
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Background workers (separate terminals, same venv):

```bash
celery -A app.celery_app worker --loglevel=info --pool=solo   # --pool=solo is Windows-friendly
celery -A app.celery_app beat --loglevel=info
```

API docs at `http://localhost:8000/docs` (auto-disabled when
`ENVIRONMENT=production`).

**Frontend:**

```bash
cd frontend
pnpm install
cp .env.example .env
pnpm dev
```

App at `http://localhost:5173`.

## Everyday startup (after a reboot / Docker stops)

Once everything's set up once, restarting after the machine slept or Docker
Desktop quit is just: get the containers back up, then the three
long-running processes.

```bash
# 1. Postgres + Redis (start Docker Desktop first if `docker ps` errors)
docker start skillswap-postgres skillswap-redis

# 2. Backend API (from backend/, venv activated)
uvicorn app.main:app --reload --port 8000

# 3. Celery worker + beat (from backend/, venv activated, separate terminals)
celery -A app.celery_app worker --loglevel=info --pool=solo
celery -A app.celery_app beat --loglevel=info

# 4. Frontend (from frontend/)
pnpm dev
```

Sanity check: `http://localhost:8000/docs` and `http://localhost:5173`
both load. A frontend "Failed to fetch" on any form almost always means
step 1 or 2 hasn't happened yet — check those before assuming it's a code
bug.

## Deployment

Frontend → Netlify (`netlify.toml`), backend → Render (`render.yaml`).
Netlify/Vercel can't host the backend itself — see **DEPLOYMENT.md** for
why, and the full walkthrough.

The default deploy path is fully free: Render has no free tier for
background workers, so `render.yaml` skips paying for one and instead runs
Celery tasks synchronously in the API process (`CELERY_TASK_ALWAYS_EAGER`),
with a free GitHub Actions cron (`.github/workflows/scheduled-sweeps.yml`)
standing in for Celery Beat's hourly/daily sweeps. The one feature that
doesn't work on this path is session-reminder emails (they rely on
scheduling a task for a specific future time, which eager execution can't
honor) — everything else, including OTP emails, badge awarding, and the
credit-escrow release, works the same as it does locally with a real
worker. DEPLOYMENT.md also documents the paid alternative (~$7/mo for a
real worker+beat process) if you want that feature back.

## Repo layout

```
backend/
  app/
    core/        settings, security (JWT/password/OTP), rate limiter, OAuth client
    db/          SQLAlchemy engine/session, declarative Base
    models/      one module per schema entity
    schemas/     Pydantic request/response models
    api/routes/  FastAPI routers (REST + WebSocket)
    services/    business logic kept out of route handlers (credits, booking,
                 matching, badges, attendance, analytics, ...)
    ws/          hand-rolled ConnectionManager (shared by chat/video/notifications)
    tasks/       Celery tasks (email, credit-escrow sweep, waitlist sweep)
  alembic/       migrations (hand-written to match models/ exactly)
frontend/
  src/
    api/         fetch wrapper with access-token injection + refresh rotation
    context/     Auth, Theme, Sidebar, Notifications, Call React contexts
    crypto/      E2E chat encryption (ECDH + AES-GCM)
    pages/       one file per route
    components/  shared UI (nav, video room, modals, ...)
    styles/      design tokens (tokens.css) + global styles
```
