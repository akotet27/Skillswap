"""Shared datetime helper -- used anywhere a DB-loaded timestamp gets
compared against `datetime.now(timezone.utc)`."""
from datetime import datetime, timezone


def as_utc(value: datetime) -> datetime:
    """Postgres's TIMESTAMPTZ round-trips tz-aware datetimes correctly, but
    SQLite (used for quick local testing) silently drops tzinfo on
    read-back -- so a value written as UTC comes back naive. Treat a naive
    value as already-UTC rather than letting a comparison against an
    aware `datetime.now(timezone.utc)` raise TypeError on that backend."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
