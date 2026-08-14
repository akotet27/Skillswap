"""Tracks how long each real (non-guest) participant was actually connected
to a session's video room -- feeds the duration-based partial-credit
calculation in services/credits.py. Written from the join/disconnect
handlers in api/routes/signaling_ws.py; read from booking.py at session
completion. Guests never get rows here (they never affect credits)."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models.session import CallAttendance


def record_join(db: DbSession, session_id: int, user_id: int) -> int:
    row = CallAttendance(session_id=session_id, user_id=user_id)
    db.add(row)
    db.flush()
    return row.id


def record_leave(db: DbSession, attendance_id: int) -> None:
    row = db.get(CallAttendance, attendance_id)
    if row is not None and row.left_at is None:
        row.left_at = datetime.now(timezone.utc)
        db.flush()


def close_open_attendance(db: DbSession, session_id: int) -> None:
    """Best-effort finalization at completion time: if a participant's
    socket is still open when the session gets marked complete (e.g. the
    learner hits "Mark complete" mid-call, or the app crashed without a
    clean disconnect), close their attendance span as of now rather than
    leaving it open forever and undercounting them by excluding it."""
    now = datetime.now(timezone.utc)
    rows = db.scalars(
        select(CallAttendance).where(CallAttendance.session_id == session_id, CallAttendance.left_at.is_(None))
    ).all()
    for row in rows:
        row.left_at = now
    if rows:
        db.flush()


def connected_minutes(db: DbSession, session_id: int, user_id: int) -> float:
    """Total minutes this user was connected to this session's video room,
    summed across every join/leave span (reconnects included). Call
    close_open_attendance() first if any span might still be open."""
    rows = db.scalars(
        select(CallAttendance).where(
            CallAttendance.session_id == session_id,
            CallAttendance.user_id == user_id,
            CallAttendance.left_at.isnot(None),
        )
    ).all()
    total_seconds = sum((row.left_at - row.joined_at).total_seconds() for row in rows)
    return total_seconds / 60
