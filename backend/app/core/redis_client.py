"""
Single shared Redis connection pool, reused for: slowapi's rate-limit
counters, the browse/match-results cache, and anywhere else we need a fast
shared store. One client, not one-per-feature, so we don't juggle multiple
pools against the same Redis instance for no reason.
"""
import redis

from app.core.config import settings

redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
