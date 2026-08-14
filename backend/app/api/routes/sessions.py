"""Session listing, cancellation (Phase 2), and completion (Phase 5).
Video-call join/signaling lives in a separate router added in Phase 4."""
from datetime import datetime, timezone as tz

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.timeutils import as_utc
from app.db.session import get_db
from app.models.report import Report
from app.models.session import Session, SessionParticipant, ParticipantRole, SessionStatus
from app.models.user import User
from app.schemas.report import ReportCreate, ReportOut
from app.schemas.session import SessionOut
from app.schemas.video import GuestInviteOut
from app.services import booking, video as video_service
from app.tasks.badge_tasks import award_session_badges
from app.tasks.email_tasks import send_cancellation_email

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


#  /me must be registered before /{session_id} -- FastAPI/Starlette match
# routes in registration order, and "me" is a syntactically valid match
# for {session_id} too. If the dynamic route came first, GET
# /api/sessions/me would be captured by get_session(session_id="me") and
# 422 trying to parse "me" as an int, instead of ever reaching
# list_my_sessions. (Same bug, same fix, as /api/users/me/skills vs.
# /api/users/{user_id}/skills -- see the comment there.)
@router.get("/me", response_model=list[SessionOut])
def list_my_sessions(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    session_ids = db.scalars(select(SessionParticipant.session_id).where(SessionParticipant.user_id == user.id)).all()
    if not session_ids:
        return []
    return db.scalars(
        select(Session).where(Session.id.in_(session_ids)).order_by(Session.scheduled_start_utc.desc())
    ).all()


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    session = db.get(Session, session_id)
    if session is None or user.id not in {p.user_id for p in session.participants}:
        # 404 either way -- a non-participant shouldn't be able to tell
        # the difference between "doesn't exist" and "not yours".
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session


@router.post("/{session_id}/cancel", response_model=SessionOut)
def cancel_session(session_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    session = db.get(Session, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    other_participants = [p for p in session.participants if p.user_id != user.id]

    try:
        booking.cancel_session(db, session, user)
    except booking.NotAuthorizedError as e:
        db.rollback()
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    except booking.InvalidStateError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))

    db.commit()
    db.refresh(session)

    when_iso = session.scheduled_start_utc.isoformat()
    for p in other_participants:
        other_user = db.get(User, p.user_id)
        if other_user:
            send_cancellation_email.delay(other_user.email, user.name, when_iso)

    return session


@router.post("/{session_id}/complete", response_model=SessionOut)
def complete_session(session_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    """Phase 5, step 1's manual path: the learner can confirm a session is
    done (the automatic path is both peers disconnecting from the video
    room after the scheduled end time -- see app/api/routes/signaling_ws.py).
    Only the learner, per the spec ("manually confirmed by the learner") --
    not the teacher, since they're the one who'd be credited, and not a
    guest, who never affects credits at all."""
    session = db.get(Session, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    learner = next((p for p in session.participants if p.role == ParticipantRole.LEARNER), None)
    if learner is None or learner.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the learner can confirm a session as complete")
    if session.status not in (SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Session is already {session.status.value}")
    if as_utc(session.scheduled_start_utc) > datetime.now(tz.utc):
        raise HTTPException(status.HTTP_409_CONFLICT, "Session hasn't started yet")

    booking.complete_session(db, session_id)
    db.commit()
    db.refresh(session)
    award_session_badges.delay(session.id)
    return session


@router.post("/{session_id}/report", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def report_session_participant(
    session_id: int, payload: ReportCreate, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    """Available after a completed session -- reports the *other* real
    participant (never a guest, never yourself). Lands in the admin
    moderation queue (see app/api/routes/admin.py); this endpoint only
    ever creates the Report, resolving it is an admin action."""
    session = db.get(Session, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status != SessionStatus.COMPLETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "You can only report a session after it's completed")

    my_participation = next((p for p in session.participants if p.user_id == user.id), None)
    if my_participation is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You weren't part of this session")

    other = next(
        (p for p in session.participants if p.user_id != user.id and p.role != ParticipantRole.GUEST), None
    )
    if other is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No one to report in this session")

    report = Report(
        session_id=session_id, reporter_id=user.id, reported_user_id=other.user_id,
        reason=payload.reason, note=payload.note,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.post("/{session_id}/guest-invite", response_model=GuestInviteOut)
def create_guest_invite(session_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    """A guest joins via a shareable link, no account required (Phase 4).
    Only an existing participant (teacher/learner) can mint an invite --
    guests can't invite further guests, and a stranger can't generate
    their own link without one of the real participants sharing it. The
    guest picks their own display name when they actually join (see
    services/video.py) -- the link itself only encodes room access."""
    session = db.get(Session, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if user.id not in {p.user_id for p in session.participants}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a session participant can invite guests")

    token = video_service.create_guest_token(session.video_room_id)
    # The room id travels in the URL unencrypted alongside the signed
    # token -- that's fine, it's not the secret. A guest (or anyone else)
    # knowing the room id grants nothing on its own; app/api/routes/
    # signaling_ws.py only admits a guest connection whose guest_token
    # verifies against *that exact* room id.
    join_url = f"{settings.FRONTEND_ORIGIN}/session/{session.id}?guest_token={token}&room={session.video_room_id}"
    return GuestInviteOut(join_url=join_url, expires_in_minutes=video_service.GUEST_TOKEN_MAX_AGE_SECONDS // 60)
