# Deploying SkillSwap

Frontend on **Netlify**, backend on **Render**. They're split because the
backend needs things a serverless host can't give it — a persistent
WebSocket connection for chat/video signaling/presence, and a
continuously-running Celery worker + beat scheduler. Netlify and Vercel
only run short-lived serverless functions, so the backend can't live there
at all; the frontend is a static Vite build, which is exactly what they're
for.

## 1. Backend on Render

Render reads `render.yaml` at the repo root (a "Blueprint") and provisions
everything in it in one go:

- `skillswap-api` — the FastAPI app + Uvicorn, serving both REST and the
  WebSocket endpoints. Its start command runs `alembic upgrade head`
  before starting the server, so the schema is always current.
- `skillswap-worker` — a Celery worker (OTP/reset/reminder emails, badge
  awarding, waitlist notifications).
- `skillswap-beat` — Celery beat, firing the hourly credit-escrow release
  sweep and the daily skill-waitlist sweep on schedule.
- `skillswap-db` — a managed Postgres instance (free plan), wired to all
  three services via `fromDatabase`.

**Steps:**

1. In the Render dashboard: **New +** → **Blueprint**, point it at this
   repo. Render parses `render.yaml` and shows you the three services +
   database it's about to create.
2. **Create a Redis instance by hand first** (New + → Redis, a couple of
   clicks) — it's deliberately not in `render.yaml` because Render's
   managed-Redis blueprint syntax has changed over time and baking it in
   risked the file going stale. Copy its internal connection string.
3. Fill in the env vars marked `sync: false` in `render.yaml` (Render will
   prompt for these per-service in the dashboard):
   - `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` — the Redis
     connection string from step 2, same value in all three services.
   - `JWT_SECRET_KEY` — auto-generated for `skillswap-api`; copy that exact
     value into `skillswap-worker` and `skillswap-beat` too (all three
     processes must agree on it, or tokens signed by one won't verify on
     another).
   - `FRONTEND_ORIGIN` — your Netlify URL once you have it (step 2 below),
     e.g. `https://skillswap.netlify.app`. Needed for CORS.
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` —
     only if Google OAuth login is enabled; redirect URI is
     `https://<skillswap-api-url>.onrender.com/api/auth/google/callback`.
   - `MAIL_USERNAME` / `MAIL_PASSWORD` / `MAIL_FROM` / `MAIL_SERVER` — only
     needed once you flip `EMAIL_BACKEND` from `console` to `smtp` (see
     the note below).
   - `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` — a TURN server for
     WebRTC. Calls between peers on friendly networks work without one via
     STUN, but anyone behind a symmetric NAT/strict firewall won't connect
     without a real TURN relay in production.
4. Deploy. Watch the `skillswap-api` build logs — first deploy runs the
   full migration history from scratch against the fresh database.

**Email in production:** `render.yaml` ships `EMAIL_BACKEND=console` by
default, meaning OTP/reminder/notification emails are written to the
service's logs instead of actually sent — same "no real email in dev"
default the local backend uses. Flip it to `EMAIL_BACKEND=smtp` (and fill
in the `MAIL_*` vars) once you have real SMTP credentials, or nobody will
receive their signup OTP.

**File uploads (read before relying on this in production):** Render's
free/starter web services use ephemeral local disk — anything written to
`backend/uploads/` (profile photos, chat file attachments, voice notes)
is **wiped on every redeploy and on dyno restarts**. This wasn't fixed as
part of the Netlify/Render prep because it's a real architectural decision
(a paid Render Disk that's mounted read-write, vs. migrating the upload
code to S3/Cloudflare R2/Backblaze B2), not a config toggle. Fine for a
demo/staging deploy; needs one of those two before uploads can be trusted
to survive.

## 2. Frontend on Netlify

`netlify.toml` at the repo root has the build config: base directory
`frontend`, `pnpm install && pnpm run build`, publish directory
`frontend/dist`, plus the SPA fallback redirect so client-side routes
(`/sessions`, `/messages`, etc.) don't 404 on a hard refresh.

**Steps:**

1. In Netlify: **Add new site** → **Import an existing project**, point it
   at this repo. Netlify auto-detects `netlify.toml`.
2. Before the first deploy, set these in **Site configuration → Environment
   variables** (Vite only bakes in `VITE_`-prefixed vars at build time, so
   they must exist before you trigger a build, not after):
   - `VITE_API_BASE_URL` → `https://<skillswap-api-service>.onrender.com`
   - `VITE_WS_BASE_URL` → `wss://<skillswap-api-service>.onrender.com`
3. Deploy. Then go back to Render and set `skillswap-api`'s
   `FRONTEND_ORIGIN` to the Netlify URL you just got, and redeploy the
   backend so CORS allows it.

## 3. Smoke-test the deployed pair

- Sign up a new account → check the Render logs for the OTP (if still on
  `EMAIL_BACKEND=console`) or your inbox (if on `smtp`).
- Start a video call between two browser tabs/devices to confirm WebRTC
  signaling reaches the deployed `skillswap-api` over `wss://`.
- Send a chat message both ways to confirm the E2E key exchange completes
  against the deployed backend (it's the same protocol, but worth
  confirming CORS/WS didn't silently break it).

## Notes on `render.yaml`'s Python pin

`PYTHON_VERSION: 3.12.7` is pinned explicitly for all three Render
services — local development in this repo has been done against Python
3.14, but 3.12.7 is a known-good, widely-available version on Render's
runtime images. If a dependency in `requirements.txt` ever needs a newer
Python, bump this value in all three services in `render.yaml` (they must
all match — the worker and beat processes need to import the same `app`
package as the API).
