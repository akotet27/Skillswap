import enum
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, Text, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import str_enum


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    participants: Mapped[list["ConversationParticipant"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")


class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    # Unread-count tracking lives on the existing per-participant row
    # rather than a new table -- one already exists per (conversation,
    # user) pair. NULL means "never opened this conversation" (everything
    # unread); set to now() whenever the user views it (see
    # POST /{id}/read). A message is unread for a participant if its
    # created_at is after their last_read_at (or they have none at all).
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    conversation: Mapped["Conversation"] = relationship(back_populates="participants")


class MessageType(str, enum.Enum):
    TEXT = "text"
    VOICE = "voice"
    # A generic file attachment (anything other than a voice note) --
    # separate type from VOICE so the client can decide preview UI (inline
    # image thumbnail vs. a generic file chip) from `type` + `file_mime`
    # without guessing from the extension.
    FILE = "file"
    # System-generated, not authored by either participant (e.g. "X
    # joined the call") -- rendered as a centered muted pill, never a
    # left/right-aligned bubble. `sender_id` is meaningless for these
    # (still required by the column, so the participant who triggered the
    # event is stored there, but the UI never attributes it to them as if
    # they'd typed it).
    SYSTEM = "system"


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[MessageType] = mapped_column(str_enum(MessageType, "message_type"), default=MessageType.TEXT, nullable=False)
    # text body when type == TEXT -- plaintext if `iv` is null (legacy
    # messages, or either party hadn't set up E2E encryption yet at send
    # time), otherwise base64 AES-GCM ciphertext (see frontend/src/crypto/
    # e2e.js). The server never sees plaintext for an encrypted message and
    # can't decrypt it -- that's the point.
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_url: Mapped[str | None] = mapped_column(String(512), nullable=True)  # uploaded file, when type in (VOICE, FILE)
    # base64 AES-GCM IV (12 random bytes -> 16 base64 chars), one per
    # message since GCM requires a unique IV per encryption under the same
    # key. Null means `content` is plaintext, not encrypted.
    iv: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Only set for type == FILE -- original filename/size/mime, so the
    # chat UI can render a real download chip ("report.pdf, 240 KB")
    # instead of just a bare link, and decide image-preview vs. generic
    # icon from the mime type without sniffing the file itself again.
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int | None] = mapped_column(nullable=True)
    file_mime: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Set when the sender edits a TEXT message (see PATCH .../messages/{id}
    # in conversations.py) -- shown as "(edited)" in the UI. Never set for
    # any other type; editing a voice note or file attachment isn't a
    # supported concept, only deleting one is.
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Soft-delete: content/content_url/iv/file_* are cleared at delete time
    # (and the underlying upload removed from disk for voice/file
    # messages) rather than leaving stale ciphertext or an orphaned file
    # around -- the row itself stays so the transcript shows "This message
    # was deleted" in its original position instead of a gap.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
