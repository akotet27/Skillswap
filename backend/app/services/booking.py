"""
Phase 2 booking business logic: turning an accepted SwapRequest into a
Session (+ spending the learner's credit), and cancellation (+ refund).
Kept out of the route layer for the same reason as auth_service.py /
credits.py -- one place enforces the rules, routes just handle HTTP shape.

Role convention (not explicit in the schema, so documented here): the
SwapRequest *recipient* is the teacher and the *requester* is the learner
for the resulting Session. This falls out of the booking flow itself --
you browse a match's availability (their free time, because *they* teach
the skill you want) and send them a request for a slot they offered, so
the person whose calendar you booked against is the one teaching.
`skill_taught_id` on the request records what the requester offers in
return, for a *future* session in the other direction -- v1 does not
auto-create that reverse session, the other person books it separately
via their own SwapRequest.
"""
from datetime import datetime, timezone as tz

from sqlalchemy import update
from sqlalchemy.orm import Session as DbSession

from app.core.timeutils import as_utc
from app.models.session import Session, SessionParticipant, ParticipantRole, SessionStatus
from app.models.swap_request import SwapRequest, SwapRequestStatus
from app.models.user import User
from app.services import credits
from app.services.credits import spend_credit, refund_credit, InsufficientCreditsError

__all__ = [
    "InsufficientCreditsError",
    "accept_swap_request",
    "decline_swap_request",
    "cancel_session",
    "mark_in_progress",
    "complete_session",
]


class NotAuthorizedError(Exception):
    pass


class InvalidStateError(Exception):
    pass


def accept_swap_request(db: DbSession, request: SwapRequest, acting_user: User) -> Session:
    if acting_user.id != request.recipient_id:
        raise NotAuthorizedError("Only the recipient can accept a swap request")
    if request.status != SwapRequestStatus.PENDING:
        raise InvalidStateError("This request has already been responded to")

    # Check-then-spend: we need a session_id to attach the ledger row to
    # (the immutable-ledger design always ties a spend to the session it
    # paid for), so the Session row is created first and the credit check
    # happens second. If the learner doesn't have a credit, spend_credit
    # raises and the caller (the route) rolls back the whole transaction
    # -- the Session row created here never gets committed.
    session = Session(
        request_id=request.id,
        scheduled_start_utc=request.proposed_start_utc,
        scheduled_end_utc=request.proposed_end_utc,
        status=SessionStatus.SCHEDULED,
    )
    db.add(session)
    db.flush()  # assigns session.id without committing

    # Learner (requester) must have an available credit -- this is the v1
    # cold-start limitation called out in the spec: a brand-new platform
    # has no credits in circulation yet, so the very first session anyone
    # ever books *as a learner* is impossible until someone has taught
    # (and had a credit clear escrow) first. Deliberately not "fixed" with
    # an unrequested starting bonus -- see Phase 5 in the spec.
    spend_credit(db, user_id=request.requester_id, session_id=session.id)

    db.add(SessionParticipant(session_id=session.id, user_id=request.recipient_id, role=ParticipantRole.TEACHER))
    db.add(SessionParticipant(session_id=session.id, user_id=request.requester_id, role=ParticipantRole.LEARNER))

    request.status = SwapRequestStatus.ACCEPTED
    db.flush()
    return session


def decline_swap_request(db: DbSession, request: SwapRequest, acting_user: User) -> None:
    if acting_user.id != request.recipient_id:
        raise NotAuthorizedError("Only the recipient can decline a swap request")
    if request.status != SwapRequestStatus.PENDING:
        raise InvalidStateError("This request has already been responded to")
    request.status = SwapRequestStatus.DECLINED
    db.flush()


def cancel_session(db: DbSession, session: Session, acting_user: User) -> None:
    participant_ids = {p.user_id for p in session.participants}
    if acting_user.id not in participant_ids:
        raise NotAuthorizedError("Only a participant can cancel this session")
    if session.status not in (SessionStatus.SCHEDULED,):
        raise InvalidStateError("Only a scheduled session can be cancelled")
    if as_utc(session.scheduled_start_utc) <= datetime.now(tz.utc):
        raise InvalidStateError("Cannot cancel a session that has already started")

    session.status = SessionStatus.CANCELLED

    # Refund the learner's credit -- it was spent at booking confirmation
    # (not held in escrow the way the *teacher's* earning is), so
    # cancellation must explicitly give it back rather than just leaving
    # the session in a cancelled state with the credit still gone.
    learner = next((p for p in session.participants if p.role == ParticipantRole.LEARNER), None)
    if learner is not None:
        refund_credit(db, user_id=learner.user_id, session_id=session.id)

    db.flush()


def mark_in_progress(db: DbSession, session_id: int) -> None:
    """Called when the first real (non-guest) participant joins the video
    room -- see app/api/routes/signaling_ws.py. Plain conditional UPDATE,
    not the atomic-with-side-effect pattern complete_session() below needs:
    two people joining "at the same instant" both flipping
    scheduled -> in_progress is harmless either way (no side effect
    depends on which one "won"), so a simple guard is enough here."""
    db.execute(
        update(Session)
        .where(Session.id == session_id, Session.status == SessionStatus.SCHEDULED)
        .values(status=SessionStatus.IN_PROGRESS)
    )


def complete_session(db: DbSession, session_id: int) -> bool:
    """Phase 5, step 1->2: flips a session to 'completed' and starts the
    teacher's 24h credit-escrow hold (step 2). Two triggers call this
    (see app/api/routes/signaling_ws.py's disconnect handler for the
    automatic path, app/api/routes/sessions.py's /complete endpoint for
    the learner's manual-confirm path per the spec) and they can race --
    both peers disconnecting around the same moment, or an auto-trigger
    landing right as the learner manually confirms. The atomic conditional
    UPDATE (not a read-then-write check) makes only the *first* caller to
    reach the database actually perform the transition; `rowcount == 0`
    tells every other caller "someone else already did this", so the
    teacher is never credited twice for one session.

    Returns True if this call performed the transition (and thus earned
    the credit), False if the session was already completed/cancelled/
    no-show (a no-op).
    """
    result = db.execute(
        update(Session)
        .where(Session.id == session_id, Session.status.in_([SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS]))
        .values(status=SessionStatus.COMPLETED)
    )
    if result.rowcount == 0:
        return False

    session = db.get(Session, session_id)
    teacher = next((p for p in session.participants if p.role == ParticipantRole.TEACHER), None)
    if teacher is not None:
        credits.earn_pending_credit(db, teacher.user_id, session_id)
    db.flush()
    return True
