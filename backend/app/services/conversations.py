"""
Phase 3 messaging business logic. v1 conversations are always exactly
two participants ("tied to a matched pair" per the spec) even though the
schema (ConversationParticipant as a join table) would support group
chat later without a migration -- get_or_create is what enforces the
1:1 assumption today.
"""
from datetime import datetime, timezone as tz

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models.messaging import Conversation, ConversationParticipant, Message
from app.models.session import Session, SessionParticipant, SessionStatus


class NotAParticipantError(Exception):
    pass


def get_or_create_conversation(db: DbSession, user_a_id: int, user_b_id: int) -> Conversation:
    # Find an existing 2-participant conversation containing exactly these
    # two users. Small subquery-per-candidate approach is fine at v1 scale
    # (a user has at most a handful of conversations); an intersect-based
    # query would be the next optimization if that stops being true.
    a_conv_ids = set(db.scalars(select(ConversationParticipant.conversation_id).where(ConversationParticipant.user_id == user_a_id)).all())
    b_conv_ids = set(db.scalars(select(ConversationParticipant.conversation_id).where(ConversationParticipant.user_id == user_b_id)).all())
    shared = a_conv_ids & b_conv_ids
    for conv_id in shared:
        count = len(db.scalars(select(ConversationParticipant).where(ConversationParticipant.conversation_id == conv_id)).all())
        if count == 2:
            return db.get(Conversation, conv_id)

    conv = Conversation()
    db.add(conv)
    db.flush()
    db.add_all(
        [
            ConversationParticipant(conversation_id=conv.id, user_id=user_a_id),
            ConversationParticipant(conversation_id=conv.id, user_id=user_b_id),
        ]
    )
    db.flush()
    return conv


def assert_participant(db: DbSession, conversation_id: int, user_id: int) -> Conversation:
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise NotAParticipantError("Conversation not found")
    is_member = db.scalar(
        select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id, ConversationParticipant.user_id == user_id
        )
    )
    if is_member is None:
        raise NotAParticipantError("Not a participant of this conversation")
    return conv


def other_participant_id(db: DbSession, conversation_id: int, user_id: int) -> int | None:
    return db.scalar(
        select(ConversationParticipant.user_id).where(
            ConversationParticipant.conversation_id == conversation_id, ConversationParticipant.user_id != user_id
        )
    )


def find_relevant_session(db: DbSession, user_a_id: int, user_b_id: int) -> Session | None:
    """The session the "Join session" button in a conversation should point
    at: the soonest upcoming (or currently in-progress) session between
    these two users. Not scoped to a specific SwapRequest -- either
    direction of the swap qualifies, since the conversation is between the
    people, not the request."""
    a_sessions = set(db.scalars(select(SessionParticipant.session_id).where(SessionParticipant.user_id == user_a_id)).all())
    b_sessions = set(db.scalars(select(SessionParticipant.session_id).where(SessionParticipant.user_id == user_b_id)).all())
    shared_ids = a_sessions & b_sessions
    if not shared_ids:
        return None

    candidates = db.scalars(
        select(Session).where(
            Session.id.in_(shared_ids), Session.status.in_([SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS])
        )
    ).all()
    if not candidates:
        return None
    return min(candidates, key=lambda s: s.scheduled_start_utc)


def list_conversations_for_user(db: DbSession, user_id: int) -> list[Conversation]:
    conv_ids = db.scalars(select(ConversationParticipant.conversation_id).where(ConversationParticipant.user_id == user_id)).all()
    if not conv_ids:
        return []
    convs = db.scalars(select(Conversation).where(Conversation.id.in_(conv_ids))).all()
    return convs


def last_message(db: DbSession, conversation_id: int) -> Message | None:
    return db.scalar(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at.desc()).limit(1)
    )
