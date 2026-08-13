"""
Every user-facing email is a Celery task, never a synchronous send inside a
request handler (cross-cutting requirement #5). Each task takes plain
JSON-serializable args (never ORM objects -- Celery serializes the call,
and a detached SQLAlchemy instance doesn't survive that) and re-fetches
whatever it needs from the DB itself.
"""
from app.celery_app import celery_app
from app.services.email import send_email


@celery_app.task(name="app.tasks.email_tasks.send_otp_email")
def send_otp_email(to: str, code: str, purpose: str) -> None:
    subject = {
        "signup_verify": "Verify your SkillSwap email",
        "2fa": "Your SkillSwap sign-in code",
    }.get(purpose, "Your SkillSwap verification code")
    body = f"""
    <div style="font-family:sans-serif">
      <h2 style="color:#0d111b">SkillSwap</h2>
      <p>Your verification code is:</p>
      <p style="font-size:28px;font-weight:600;letter-spacing:4px">{code}</p>
      <p>This code expires shortly. If you didn't request this, you can ignore this email.</p>
    </div>
    """
    send_email(to, subject, body)


@celery_app.task(name="app.tasks.email_tasks.send_password_reset_email")
def send_password_reset_email(to: str, reset_link: str) -> None:
    body = f"""
    <div style="font-family:sans-serif">
      <h2 style="color:#0d111b">Reset your SkillSwap password</h2>
      <p><a href="{reset_link}" style="color:#0098f2">Click here to choose a new password</a>.
      This link is single-use and expires soon.</p>
      <p>If you didn't request this, you can ignore this email.</p>
    </div>
    """
    send_email(to, "Reset your SkillSwap password", body)


@celery_app.task(name="app.tasks.email_tasks.send_password_changed_email")
def send_password_changed_email(to: str) -> None:
    """Fired after *any* successful password change -- via the emailed
    reset link or the logged-in Settings form. Pure notification, no
    action link, so it's harmless to send even if the change was
    legitimate; if it wasn't, this is the account owner's one signal
    something happened without them (both flows already revoke every
    other refresh token, so this is "here's what happened", not "here's
    how to undo it")."""
    body = """
    <div style="font-family:sans-serif">
      <h2 style="color:#0d111b">Your SkillSwap password was changed</h2>
      <p>This is a confirmation that your password was just updated. You've been signed out
      everywhere else as a precaution.</p>
      <p>If this wasn't you, contact us right away at
      <a href="mailto:hello@skillswap.local" style="color:#0098f2">hello@skillswap.local</a>.</p>
    </div>
    """
    send_email(to, "Your SkillSwap password was changed", body)


@celery_app.task(name="app.tasks.email_tasks.send_session_reminder_email")
def send_session_reminder_email(to: str, other_party_name: str, when_iso: str, ics_content: str | None = None) -> None:
    body = f"""
    <div style="font-family:sans-serif">
      <h2 style="color:#0d111b">Upcoming SkillSwap session</h2>
      <p>Your session with <strong>{other_party_name}</strong> starts at {when_iso}.</p>
    </div>
    """
    attachments = [("session.ics", ics_content.encode("utf-8"), "calendar")] if ics_content else None
    send_email(to, "Reminder: upcoming SkillSwap session", body, attachments)


@celery_app.task(name="app.tasks.email_tasks.send_calendar_invite_email")
def send_calendar_invite_email(to: str, other_party_name: str, when_iso: str, ics_content: str) -> None:
    body = f"""
    <div style="font-family:sans-serif">
      <h2 style="color:#0d111b">Session confirmed</h2>
      <p>Your session with <strong>{other_party_name}</strong> is confirmed for {when_iso}.
      A calendar invite is attached.</p>
    </div>
    """
    send_email(to, "SkillSwap session confirmed", body, [("invite.ics", ics_content.encode("utf-8"), "calendar")])


@celery_app.task(name="app.tasks.email_tasks.send_cancellation_email")
def send_cancellation_email(to: str, other_party_name: str, when_iso: str) -> None:
    body = f"""
    <div style="font-family:sans-serif">
      <h2 style="color:#0d111b">Session cancelled</h2>
      <p><strong>{other_party_name}</strong> cancelled the session scheduled for {when_iso}.</p>
    </div>
    """
    send_email(to, "SkillSwap session cancelled", body)
