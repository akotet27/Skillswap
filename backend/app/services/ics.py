"""Calendar invite (.ics) generation for booking confirmations (Phase 2)
and reminders. One small wrapper around the `ics` library so callers never
touch the iCalendar format directly."""
from datetime import datetime

from ics import Calendar, Event


def build_session_ics(
    *, uid: str, summary: str, description: str, start_utc: datetime, end_utc: datetime, organizer_email: str
) -> str:
    cal = Calendar()
    event = Event()
    event.uid = f"{uid}@skillswap.local"
    event.name = summary
    event.description = description
    event.begin = start_utc
    event.end = end_utc
    event.organizer = f"mailto:{organizer_email}"
    cal.events.add(event)
    return str(cal)
