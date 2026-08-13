# SkillSwap

Peer-to-peer skill mentorship marketplace: trade time, not money — teach an
hour, earn a credit; spend a credit to learn from someone else. Built for
local development only.

Full spec: see `CLAUDE_CODE_PROMPT (1).md` in the repo root.

## Status

Build order is followed phase-by-phase, confirming each works before moving
on (per the spec). Current state:

- [x] **Project scaffold** — backend (FastAPI + SQLAlchemy + Alembic +
      Postgres + Redis + Celery wired up), frontend (Vite + React), env
      config, full-schema Alembic migration (verified: applies and
      downgrades cleanly against a throwaway DB).
- [x] **Phase 1 — Auth & Profiles** — email/password signup with alphanumeric
      OTP verification, Google OAuth, TOTP 2FA, JWT access + rotating
      refresh tokens (with reuse detection), password reset via emailed
      link, profile editor (photo/name/timezone), skills-I-have/want tags,
      weekly availability editor.
- [x] **Phase 2 — Matching & Booking** — mutual-match algorithm (both sides'
      have/want sets must complement) ranked by weekly availability overlap
      in minutes (DST-aware via `zoneinfo`), Redis-cached browse endpoint,
      booking flow (view a match's availability, pick a slot, send a
      `SwapRequest`), accept/decline, `.ics` calendar invite emails +
      scheduled reminder emails on acceptance, cancellation with credit
      refund. Verified with an end-to-end functional test (matching →
      credit-gated booking → accept → cancel/refund) against a throwaway
      DB, not just an import check.
- [x] **Phase 3 — Messaging** — real-time text chat over a FastAPI
      `WebSocket` (`/ws/conversations/{id}`, token passed as a query param
      since browsers can't set custom WS handshake headers), backed by the
      same hand-rolled `ConnectionManager` that Phase 4's signaling will
      reuse; voice notes via `MediaRecorder` → upload → inline `<audio>`
      player; a "Join session" link that activates 5 minutes before
      `scheduled_start_utc`. Verified against a **real running uvicorn
      server with two genuine WebSocket clients** (not a mocked test
      harness) — this caught and fixed a real bug (message history could
      return out of order when two messages landed in the same
      one-second timestamp tick; fixed by adding `id` as a tiebreaker).
- [ ] Phase 4 — Signaling server + custom WebRTC video
- [ ] Phase 5 — Credit/Escrow system (ledger + service layer scaffolded
      already, in `backend/app/services/credits.py`, since the schema and
      Celery Beat sweep needed to exist from the start — wiring it into the
      booking/session flow is still Phase 5's job)
- [ ] Phase 6 — Ratings
- [ ] Cross-cutting hardening pass

### Deviations from the spec so far

- **Email backend defaults to console/log, not real SMTP** — added an
  `EMAIL_BACKEND` setting (`console` default, `smtp` to actually send) so
  dev/testing never sends real mail unless explicitly opted in. Not in the
  original spec but requested mid-build; kept as a permanent safety default
  rather than a one-off.
- Rate limiting (`slowapi`) and the login audit log are applied to the auth
  router now (signup/login/OTP/refresh endpoints) since they're
  security-critical from day one, rather than being deferred entirely to
  the final hardening pass — the rest of the cross-cutting checklist
  (full Redis caching, security headers, PWA/SEO polish across every page,
  anti-scraping tiers) is still deferred to that pass as planned.
- **A `GET /api/credits/me` read-only balance/history endpoint was pulled
  forward from Phase 5** — Phase 2's booking flow can fail with 402 when
  the learner has no available credit, and the UI needs somewhere to show
  *why*. Phase 5 proper (the escrow sweep, session-completion crediting)
  is still unbuilt; only the read path exists so far, all writes still go
  through `app/services/credits.py` called from booking/cancellation.
- **v1's credit system has a known cold-start gap, left unfixed on
  purpose**: a brand-new install has zero credits in circulation, so the
  very first session anyone books *as a learner* is blocked by the credit
  gate until someone has taught (and had a credit clear escrow) first.
  The spec explicitly rules out a starting bonus balance, so this is
  intentional — documented in `app/services/booking.py` — but worth
  knowing about before a real demo (seed one user with a manual
  `CreditTransaction` if you need to demo booking immediately).
- **Role convention for who teaches vs. learns** wasn't fully spelled out
  in the schema, so I picked one and documented it in
  `app/services/booking.py`: the `SwapRequest` *recipient* (whose
  availability you booked against) is the teacher; the *requester* is the
  learner who spends a credit. `skill_taught_id` records what the
  requester offers in return for a *separate future* session — v1 doesn't
  auto-create that reverse session.
- **The visual design system was replaced mid-build**, twice. What's live
  now: white flat header, brand blue (`#2f7cf6`) as the primary
  interactive color (filled buttons, links, "mine" chat bubbles), a soft
  blue-tinted page canvas, and a mocked "live session" card on the
  homepage instead of stock photography — adapted from a reference the
  user shared, not copied pixel-for-pixel (e.g. button hierarchy is
  SkillSwap's own filled/outline convention, not the reference's). This
  **supersedes** the original spec's "Acctual-derived, 90% achromatic,
  Midnight-only buttons, floating pill nav" system — all tokens live in
  `frontend/src/styles/tokens.css`, all shared component styles in
  `frontend/src/styles/global.css`, so this cascades automatically to
  every page. The teach/learn tag pair (green/violet) is unchanged
  throughout, since the new reference has no equivalent concept.
- **Icons are `lucide-react` throughout, never emoji** — added mid-build
  per explicit instruction; check before reaching for an emoji in any new
  UI (Phase 4's call controls, Phase 6's rating stars, etc.).

## Prerequisites

- Python 3.11+ (dev/testing here used 3.14 — very new, so a couple of
  packages needed a pin: `passlib`'s bcrypt backend detection breaks on
  `bcrypt>=4.1`, hence the `bcrypt==4.0.1` pin in `requirements.txt`; if
  you hit a `password cannot be longer than 72 bytes` error from passlib
  on login/signup, that pin didn't take — reinstall it explicitly)
- Node.js + **pnpm** (not npm) — run `pnpm approve-builds` after
  `pnpm install` the first time, or Vite's `esbuild` postinstall script
  won't run and `pnpm build`/`pnpm dev` will fail
- PostgreSQL running locally, Redis running locally

## Backend setup

```bash
cd backend
python -m venv .venv
./.venv/Scripts/activate        # Windows; `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
cp .env.example .env            # fill in DATABASE_URL etc.
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Background workers (separate terminals, same venv):

```bash
celery -A app.celery_app worker --loglevel=info --pool=solo   # --pool=solo is Windows-friendly
celery -A app.celery_app beat --loglevel=info
```

API docs at `http://localhost:8000/docs` (disabled automatically when
`ENVIRONMENT=production`).

## Frontend setup

```bash
cd frontend
pnpm install
cp .env.example .env
pnpm dev
```

App at `http://localhost:5173`.

## Everyday startup (after a reboot / Docker stops)

Once everything's already set up once (venv created, `pnpm install` done,
`.env` filled in), restarting after the machine slept or Docker Desktop
quit is just: get Docker's containers back up, then the three long-running
processes. Four separate terminals (or four background jobs):

```bash
# 1. Postgres + Redis (Docker Desktop must be running first -- start it
#    from the Start menu if `docker ps` errors with "cannot connect to
#    the Docker daemon"). These containers already exist from the first
#    setup, so `docker start` (not `docker run`) is all that's needed:
docker start skillswap-postgres skillswap-redis

# 2. Backend API (from backend/, venv activated)
uvicorn app.main:app --reload --port 8000

# 3. Celery worker + beat (from backend/, venv activated, separate terminals)
celery -A app.celery_app worker --loglevel=info --pool=solo
celery -A app.celery_app beat --loglevel=info

# 4. Frontend (from frontend/)
pnpm dev
```

Sanity check it's all actually up: `http://localhost:8000/docs` loads and
`http://localhost:5173` loads. A frontend error like "Failed to fetch" on
any form almost always means step 1 or 2 didn't happen (Docker not
running yet is the most common cause) -- check those first before
assuming it's a code bug.

## Repo layout

```
backend/
  app/
    core/        settings, security (JWT/password/OTP), rate limiter, OAuth client
    db/          SQLAlchemy engine/session, declarative Base
    models/      one module per schema entity (see the spec's Database Schema)
    schemas/     Pydantic request/response models
    api/routes/  FastAPI routers
    services/    business logic (auth, credits, ...) kept out of route handlers
    ws/          hand-rolled ConnectionManager (WebSocket rooms)
    tasks/       Celery tasks (email sends, credit-escrow sweep)
  alembic/       migrations (hand-written to match models/ exactly)
frontend/
  src/
    api/         fetch wrapper with access-token injection + refresh rotation
    context/     Auth + Theme (dark mode) React contexts
    pages/       one file per route
    styles/      design tokens (tokens.css) + global styles
```
