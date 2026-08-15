# Deploying SkillSwap

Frontend on **Netlify**, backend on **Render**. They're split because the
backend needs a persistent WebSocket connection for chat/video
signaling/presence — something Netlify and Vercel can't give it, since both
only run short-lived serverless functions. The frontend is a static Vite
build, which is exactly what those platforms are for.

This guide covers the **free path** (no Render Background Worker, no
monthly cost) that `render.yaml` is set up for by default. There's a note
at the end on the paid alternative if you'd rather have that instead.

## 1. Backend on Render

Render reads `render.yaml` at the repo root (a "Blueprint") and provisions
what's in it:

- `skillswap-api` — the FastAPI app + Uvicorn, serving both REST and the
  WebSocket endpoints. Its start command runs `alembic upgrade head`
  before starting the server, so the schema is always current. Runs on
  Render's **free** web-service tier (spins down after 15 min idle,
  cold-starts on the next request — the first request after a quiet
  period can take up to ~50 seconds).
- `skillswap-db` — a managed Postgres instance (free plan).

**No Celery worker.** Render's Background Worker service type has no free
tier at all — the cheapest option is ~$7/mo, billed regardless of how
little it's actually doing. Instead, `render.yaml` sets
`CELERY_TASK_ALWAYS_EAGER=true` on `skillswap-api`, which makes every
`.delay()`/`.apply_async()` call in the codebase (OTP emails, badge
awarding, calendar invites, etc.) execute synchronously in the same
request instead of being queued to a worker that doesn't exist. The two
things Celery Beat would normally fire on a schedule — the hourly
credit-escrow release and the daily skill-waitlist sweep — are instead
triggered by a **free GitHub Actions workflow**
(`.github/workflows/scheduled-sweeps.yml`) hitting two secret-protected
endpoints (`backend/app/api/routes/internal.py`) on the same cadence.

**The one real tradeoff:** session-reminder emails (sent at a fixed lead
time before a session, scheduled via Celery's `eta=` at booking time) are
skipped entirely on this path — see the comment in
`app/api/routes/swap_requests.py`. Eager mode runs a task the instant it's
queued, so there's no way to honor "hold this until 30 minutes before the
session," and firing it immediately instead (often hours or days early)
would be worse than not sending it. Calendar-invite emails, which send
immediately at booking time regardless, are unaffected.

### Steps

1. **Create the Postgres database first**, by hand: **New +** →
   **PostgreSQL**. Name `skillswap-db`, database `skillswap`, user
   `skillswap`, region **Oregon (US West)**, plan **Free**. (Or let the
   Blueprint step below create it — either order works, but having it
   ready first means step 3's `DATABASE_URL` is one less thing to
   backfill.)
2. **Create a Redis instance by hand too**: **New +** → **Key Value**
   (Render's current name for what's still Redis under the hood). Same
   region (**Oregon**), plan **Free**. Needed even on this free/eager
   path — Redis also backs rate limiting, caching, and pending-signup OTP
   storage, not just Celery. Not in `render.yaml` because Render's
   managed-Redis blueprint syntax has changed over time and baking it in
   risked the file going stale.
3. In the Render dashboard: **New +** → **Blueprint**, point it at this
   repo. Render parses `render.yaml` and creates `skillswap-api` (and
   `skillswap-db` if you skipped step 1).
4. Fill in the env vars marked `sync: false` on `skillswap-api`:
   - `DATABASE_URL` — copy the **Internal Database URL** from
     `skillswap-db`'s Info/Connect page, then change the scheme prefix
     from `postgresql://` (or `postgres://`) to `postgresql+psycopg://` —
     this app's Postgres driver is `psycopg` v3, not the `psycopg2` that
     scheme implies by default, and SQLAlchemy won't auto-detect that for
     you. Only the scheme changes; leave the user/password/host/dbname
     exactly as Render gave them to you.
   - `REDIS_URL` — the Internal URL from the Key Value instance in step 2,
     used as-is, no prefix changes needed.
   - `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` — same Redis URL again.
     Effectively unused while `CELERY_TASK_ALWAYS_EAGER=true`, but Celery's
     constructor still wants a syntactically valid value.
   - `FRONTEND_ORIGIN` — your Netlify URL once you have it (section 2
     below), e.g. `https://your-site.netlify.app`. **No trailing slash** —
     this is an exact-match CORS check, and even a trailing `/` makes it
     fail silently (shows up in the browser as a CORS error, not an
     obviously-related one).
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` —
     only if Google OAuth login is enabled; redirect URI is
     `https://<skillswap-api-service>.onrender.com/api/auth/google/callback`.
   - `MAIL_USERNAME` / `MAIL_PASSWORD` / `MAIL_FROM` / `MAIL_SERVER` — only
     needed once you flip `EMAIL_BACKEND` from `console` to `smtp` (see
     below).
   - `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` — a TURN server for
     WebRTC. Calls between peers on friendly networks work without one via
     STUN, but anyone behind a symmetric NAT/strict firewall won't connect
     without a real TURN relay in production.
   - `JWT_SECRET_KEY` and `INTERNAL_SWEEP_SECRET` are both
     `generateValue: true` in `render.yaml`, so Render generates them for
     you automatically — you don't need to fill these in. You will need to
     **copy `INTERNAL_SWEEP_SECRET`'s generated value** into a GitHub
     Actions secret in the next section.
5. Deploy. Watch the build/deploy logs — first deploy runs the full
   migration history from scratch against the fresh database.

### Wire up the GitHub Actions sweep scheduler

In this repo on GitHub: **Settings → Secrets and variables → Actions →
New repository secret**, add two:

- `RENDER_API_URL` — your live backend URL, e.g.
  `https://skillswap-dunf.onrender.com` (no trailing slash).
- `SWEEP_SECRET` — the exact value Render generated for
  `INTERNAL_SWEEP_SECRET` on `skillswap-api` (Environment tab, copy it
  from there).

`.github/workflows/scheduled-sweeps.yml` is already in the repo and picks
these up automatically once they're set — nothing else to configure. You
can trigger either job manually from the repo's **Actions** tab
(`workflow_dispatch`) to confirm it's wired up correctly before waiting
for the real schedule.

One caveat: GitHub disables scheduled workflows automatically after 60
days with no commits to the repo. If the sweeps quietly stop firing after
a long quiet period, push anything (or re-enable the workflow manually
from the Actions tab) to restart them.

**Email in production:** `render.yaml` ships `EMAIL_BACKEND=console` by
default, meaning OTP/reminder/notification emails are written to the
service's logs instead of actually sent — same "no real email in dev"
default the local backend uses. Flip it to `EMAIL_BACKEND=smtp` (and fill
in the `MAIL_*` vars) once you have real SMTP credentials, or nobody will
receive their signup OTP.

**File uploads (read before relying on this in production):** Render's
free web services use ephemeral local disk — anything written to
`backend/uploads/` (profile photos, chat file attachments, voice notes)
is **wiped on every redeploy and on dyno restarts**. This wasn't fixed as
part of the Netlify/Render prep because it's a real architectural decision
(a paid Render Disk that's mounted read-write, vs. migrating the upload
code to S3/Cloudflare R2/Backblaze B2), not a config toggle. Fine for a
demo/staging deploy; needs one of those two before uploads can be trusted
to survive.

## 2. Frontend on Netlify

`netlify.toml` at the repo root has the build config: base directory
`frontend`, `pnpm install && pnpm run build`, publish directory `dist`
(relative to that base directory — worth calling out, since it's an easy
place to accidentally double up the path if you ever hand-edit this;
`frontend/dist` here would resolve to a nonexistent `frontend/frontend/dist`
and fail the deploy with "Deploy directory ... does not exist"), plus the
SPA fallback redirect so client-side routes (`/sessions`, `/messages`,
etc.) don't 404 on a hard refresh.

Note: if you also set Base/Publish directory fields by hand in Netlify's
**Build settings** dashboard (separate from this toml file), that UI
resolves **Publish directory relative to the repo root**, not relative to
Base directory — so the dashboard field should say `frontend/dist`, the
opposite of the toml file's `dist`. Netlify's toml settings take
precedence when both exist, but it's worth keeping them consistent to
avoid confusing yourself later.

**Steps:**

1. In Netlify: **Add new site** → **Import an existing project**, point it
   at this repo. Netlify auto-detects `netlify.toml`.
2. Before the first deploy, set these in **Site configuration → Environment
   variables** (Vite only bakes in `VITE_`-prefixed vars at build time, so
   they must exist before you trigger a build, not after):
   - `VITE_API_BASE_URL` → `https://<skillswap-api-service>.onrender.com`
   - `VITE_WS_BASE_URL` → `wss://<skillswap-api-service>.onrender.com`
3. Deploy. Then go back to Render and set `skillswap-api`'s
   `FRONTEND_ORIGIN` to the Netlify URL you just got (no trailing slash),
   and redeploy the backend so CORS allows it.

## 3. Smoke-test the deployed pair

- Sign up a new account → check the Render logs for the OTP (if still on
  `EMAIL_BACKEND=console`) or your inbox (if on `smtp`).
- Start a video call between two browser tabs/devices to confirm WebRTC
  signaling reaches the deployed `skillswap-api` over `wss://`.
- Send a chat message both ways to confirm the E2E key exchange completes
  against the deployed backend (it's the same protocol, but worth
  confirming CORS/WS didn't silently break it).
- From the repo's **Actions** tab, manually trigger both jobs in
  "Scheduled sweeps" once to confirm the internal endpoints respond
  `200 {"released": ...}` / `200 {"notified": ...}` rather than a `401`
  (wrong/missing `SWEEP_SECRET`) or connection error.

## If you'd rather pay for a real worker instead

`render.yaml` has the `skillswap-worker` service definition kept as a
commented-out block at the bottom, ready to uncomment. If you switch to
it:

1. Uncomment that block (Render Blueprint → Background Worker, Starter
   plan, ~$7/mo — no free tier exists for this service type).
2. Set `skillswap-api`'s `CELERY_TASK_ALWAYS_EAGER` back to `"false"`.
3. Disable or delete `.github/workflows/scheduled-sweeps.yml` — Celery
   Beat (bundled into that worker via its `--beat` flag) now handles the
   same schedule on its own.
4. Session-reminder emails start working again automatically — no code
   change needed, since `app/api/routes/swap_requests.py` already checks
   `CELERY_TASK_ALWAYS_EAGER` to decide whether to schedule them.

## Notes on `render.yaml`'s Python pin

`PYTHON_VERSION: 3.12.7` is pinned explicitly — local development in this
repo has been done against Python 3.14, but 3.12.7 is a known-good,
widely-available version on Render's runtime images. If a dependency in
`requirements.txt` ever needs a newer Python, bump this value in
`render.yaml` (and in the commented-out worker block too, if you've
switched to that path — both must match, since the worker imports the
same `app` package as the API).
