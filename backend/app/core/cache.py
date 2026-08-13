"""
Small Redis JSON cache helper (cross-cutting requirement #17). Used first
by the browse/match-results endpoint, the spec's explicit "clearest
candidate" for backend caching.
"""
import json
from typing import Any, Callable

from app.core.redis_client import redis_client

DEFAULT_TTL_SECONDS = 120


def cache_get_or_set(key: str, compute: Callable[[], Any], ttl: int = DEFAULT_TTL_SECONDS) -> Any:
    cached = redis_client.get(key)
    if cached is not None:
        return json.loads(cached)
    value = compute()
    redis_client.set(key, json.dumps(value), ex=ttl)
    return value


def cache_invalidate(key: str) -> None:
    redis_client.delete(key)


def match_cache_key(user_id: int) -> str:
    return f"matches:v1:{user_id}"
