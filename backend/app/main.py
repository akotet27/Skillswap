"""
App entrypoint. Wires together CORS, rate limiting, session middleware
(required by authlib's OAuth state handling), static file serving for
local-dev uploads, and every router.

Run with: uvicorn app.main:app --reload --port 8000
"""
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.sessions import SessionMiddleware

from app.api.routes import admin, auth, chat_ws, conversations, credits, internal, matches, sessions, signaling_ws, skills, swap_requests, users, video
from app.core.config import settings
from app.core.limiter import limiter

# Cross-cutting requirement #3: /docs and /redoc are only disabled when
# ENVIRONMENT=production; left on for local dev and staging.
docs_kwargs = {"docs_url": None, "redoc_url": None} if settings.is_production else {}

app = FastAPI(
    title="SkillSwap API",
    description="Peer-to-peer skill mentorship marketplace -- matching, booking, messaging, and custom WebRTC video.",
    version="0.1.0",
    **docs_kwargs,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Cross-cutting requirement #4: CORS locked to the frontend origin only,
# read from env -- never a wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# authlib's Starlette OAuth client stores the CSRF `state` param in the
# session between the /google/login redirect and the /google/callback hit.
app.add_middleware(SessionMiddleware, secret_key=settings.JWT_SECRET_KEY)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(skills.router)
app.include_router(admin.router)
app.include_router(matches.router)
app.include_router(swap_requests.router)
app.include_router(sessions.router)
app.include_router(credits.router)
app.include_router(conversations.router)
app.include_router(chat_ws.router)
app.include_router(video.router)
app.include_router(signaling_ws.router)
app.include_router(internal.router)


@app.get("/api/health", tags=["meta"])
def health_check():
    return {"status": "ok"}
