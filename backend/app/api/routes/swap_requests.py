"""Phase 2 booking flow: send/accept/decline a SwapRequest. Accepting one
creates a Session (see app/services/booking.py) and fires off the calendar
invite + reminder emails as Celery tasks -- never synchronously here."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select, or_
from sqlalchemy.orm import Session as DbSession

from app.core.deps import get_current_user
from app.core.limiter import limiter
from app.db.session import get_db
from app.models.skill import Skill
from app.models.swap_request import SwapRequest, SwapRequestStatus
from app.models.user import User
from app.schemas.session import SwapRequestCreate, SwapRequestOut, SessionOut
from app.services import booking, credits
from app.services.ics import build_session_ics
from app.tasks.email_tasks import send_calendar_invite_email, send_session_reminder_email
from app.ws.connection_manager import manager

router = APIRouter(prefix="/api/swap-requests", tags=["swap-requests"])

REMINDER_LEAD_TIME = timedelta(minutes=30)


def _pending_incoming_count(db: DbSession, user_id: int) -> int:
    return db.scalar(
        select(func.count(SwapRequest.id)).where(
            SwapRequest.recipient_id == user_id, SwapRequest.status == SwapRequestStatus.PENDING
        )
    ) or 0


def _notification_room(user_id: int) -> str:
    # Same second-namespace pattern used everywhere else in this codebase
    # (conversations.py, chat_ws.py) -- one shared ConnectionManager, a
    # per-user room any authenticated page keeps open, not a second
    # notification system.
    return f"user:{user_id}"


@router.get("/pending-count")
def get_pending_incoming_count(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    """How many incoming swap requests are still awaiting this user's
    decision -- backs the sidebar badge (see AppSidebar.jsx). No read-state
    tracking needed here, unlike unread messages: a request only leaves
    this count by actually being accepted or declined, not just viewed."""
    return {"pending_count": _pending_incoming_count(db, user.id)}


@router.post("", response_model=SwapRequestOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_swap_request(
    request: Request, payload: SwapRequestCreate, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    if payload.recipient_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "You can't send a swap request to yourself")
    recipient = db.get(User, payload.recipient_id)
    if recipient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipient not found")
    for skill_id in (payload.skill_taught_id, payload.skill_learned_id):
        if db.get(Skill, skill_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND,
                                f"Skill {skill_id} not found")

    # Fail fast, here, rather than only at accept time: the requester is
    # the learner who'll spend a credit if this gets accepted (see
    # app/services/booking.py's role convention), so they're the one who
    # can actually do something about a missing credit. Without this
    # check the request would still get created, and the credit gate
    # wouldn't bite until the *recipient* tried to accept -- surfacing a
    # confusing "not enough credits" error to someone whose credits were
    # never the issue.
    available = credits.get_balance(db, user.id)
    pending = credits.get_pending_balance(db, user.id)
    if available < 1:
        if pending > 0:
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                "You have a teaching credit pending escrow. It becomes available 24 hours after the session is marked complete.",
            )
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "You don't have an available credit yet -- teach a session first to earn one before booking.",
        )

    swap = SwapRequest(
        requester_id=user.id,
        recipient_id=payload.recipient_id,
        skill_taught_id=payload.skill_taught_id,
        skill_learned_id=payload.skill_learned_id,
        proposed_start_utc=payload.proposed_start_utc,
        proposed_end_utc=payload.proposed_end_utc,
    )
    db.add(swap)
    db.commit()
    db.refresh(swap)

    skill_learned = db.get(Skill, swap.skill_learned_id)
    await manager.broadcast(
        _notification_room(swap.recipient_id),
        {
            "type": "new-request-notification",
            "request_id": swap.id,
            "sender_name": user.name,
            "preview": f"wants to learn {skill_learned.name} from you",
            "pending_count": _pending_incoming_count(db, swap.recipient_id),
        },
    )
    return swap


@router.get("", response_model=list[SwapRequestOut])
def list_swap_requests(
    mode: str = "incoming", user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    if mode == "outgoing":
        query = select(SwapRequest).where(SwapRequest.requester_id == user.id)
    elif mode == "incoming":
        query = select(SwapRequest).where(SwapRequest.recipient_id == user.id)
    else:
        query = select(SwapRequest).where(
            or_(SwapRequest.requester_id == user.id,
                SwapRequest.recipient_id == user.id)
        )
    return db.scalars(query.order_by(SwapRequest.created_at.desc())).all()


def _get_request_or_404(db: DbSession, request_id: int) -> SwapRequest:
    swap = db.get(SwapRequest, request_id)
    if swap is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Swap request not found")
    return swap


@router.post("/{request_id}/accept", response_model=SessionOut)
def accept_swap_request(request_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    swap = _get_request_or_404(db, request_id)
    try:
        session = booking.accept_swap_request(db, swap, user)
    except booking.NotAuthorizedError as e:
        db.rollback()
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    except booking.InvalidStateError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    except booking.InsufficientCreditsError:
        db.rollback()
        # Should be rare now that create_swap_request checks the
        # requester's balance up front -- this only fires if it changed
        # in between (e.g. they spent their one credit on a different
        # request first). Attributed to the requester by name rather than
        # the generic message, since the person seeing this is the
        # *recipient* -- without a name it reads as if it's about their
        # own balance, which it never is (recipients don't spend credits
        # to accept).
        requester = db.get(User, swap.requester_id)
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"{requester.name} doesn't have an available credit for this session yet.",
        )

    db.commit()
    db.refresh(session)

    _dispatch_booking_emails(db, swap, session)
    return session


@router.post("/{request_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_swap_request(request_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    swap = _get_request_or_404(db, request_id)
    try:
        booking.decline_swap_request(db, swap, user)
    except booking.NotAuthorizedError as e:
        db.rollback()
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    except booking.InvalidStateError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    db.commit()


def _dispatch_booking_emails(db: DbSession, swap: SwapRequest, session) -> None:
    teacher = db.get(User, swap.recipient_id)
    learner = db.get(User, swap.requester_id)
    skill = db.get(Skill, swap.skill_learned_id)

    ics_content = build_session_ics(
        uid=session.video_room_id,
        summary=f"SkillSwap: {skill.name}",
        description=f"{teacher.name} teaches {learner.name} — {skill.name}",
        start_utc=session.scheduled_start_utc,
        end_utc=session.scheduled_end_utc,
        organizer_email=teacher.email,
    )
    when_iso = session.scheduled_start_utc.isoformat()

    send_calendar_invite_email.delay(
        learner.email, teacher.name, when_iso, ics_content)
    send_calendar_invite_email.delay(
        teacher.email, learner.name, when_iso, ics_content)

    # One-off reminder emails, scheduled at a fixed lead time before the
    # session -- not the hourly Beat schedule (that's only the credit
    # escrow sweep, see app/celery_app.py). `eta` tells Celery to hold the
    # task until that wall-clock time rather than running it immediately.
    reminder_time = session.scheduled_start_utc - REMINDER_LEAD_TIME
    send_session_reminder_email.apply_async(
        args=[learner.email, teacher.name, when_iso,
              ics_content], eta=reminder_time
    )
    send_session_reminder_email.apply_async(
        args=[teacher.email, learner.name, when_iso,
              ics_content], eta=reminder_time
    )
