"""
Redis-backed rate limiting (cross-cutting requirement #1), shared across
every router via the `limiter` instance + `@limiter.limit(...)` decorator.
Keyed by client IP by default; auth endpoints additionally key sensitive
actions (login, OTP requests) more tightly since those are the classic
brute-force/credential-stuffing targets. Also doubles as the "basic
anti-scraping" tier (#18): unauthenticated browse/match endpoints get a
stricter limit than authenticated ones.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(key_func=get_remote_address, storage_uri=settings.REDIS_URL)
