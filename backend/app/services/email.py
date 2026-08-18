"""
Email sender with three interchangeable backends. Deliberately synchronous
and dependency-light -- it only ever runs inside a Celery worker (see
app/tasks/email_tasks.py), or inline in-process when CELERY_TASK_ALWAYS_EAGER
is set (the free-tier deploy path, see app/celery_app.py), never in a
request handler on a path that needs to stay fast regardless.

Backend is gated by EMAIL_BACKEND (see app/core/config.py):
  - "console" (the default, including in every test run) -- never touches
    the network, just logs the subject/recipient/body. This is
    deliberate: development and automated tests must never send a real
    email, so real sending requires explicitly opting in.
  - "smtp" -- sends via plain smtplib and the configured MAIL_* settings
    (per the original spec: "any SMTP-compatible provider ... or plain
    smtplib"). Works locally and on hosts that allow outbound SMTP.
  - "resend" -- sends via Resend's HTTPS API instead of raw SMTP. Needed
    on hosts that block outbound SMTP ports (Render's free web service
    tier does -- confirmed via a live `TimeoutError: [Errno 110]
    Connection timed out` connecting to smtp.resend.com:587 in
    production). HTTPS is never blocked the same way, since the app
    already makes outbound HTTPS calls elsewhere (Google OAuth). Needs
    RESEND_API_KEY, not the MAIL_* SMTP settings.
"""
import base64
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger("skillswap.email")


def send_email(to: str, subject: str, html_body: str, attachments: list[tuple[str, bytes, str]] | None = None) -> None:
    """attachments: list of (filename, content_bytes, mime_subtype), e.g. ('invite.ics', b'...', 'calendar')."""
    if settings.EMAIL_BACKEND == "resend":
        _send_via_resend_api(to, subject, html_body, attachments)
        return

    if settings.EMAIL_BACKEND != "smtp":
        attachment_names = [name for name, _content, _subtype in (attachments or [])]
        logger.info(
            "EMAIL (console backend, EMAIL_BACKEND=%s) to=%s subject=%s attachments=%s\n%s",
            settings.EMAIL_BACKEND,
            to,
            subject,
            attachment_names,
            html_body,
        )
        return

    import smtplib  # imported lazily: only needed on the real-SMTP path

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>"
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html"))

    for filename, content, subtype in attachments or []:
        part = MIMEText(content.decode("utf-8"), subtype)
        part.add_header("Content-Disposition", "attachment", filename=filename)
        msg.attach(part)

    with smtplib.SMTP(settings.MAIL_SERVER, settings.MAIL_PORT) as server:
        if settings.MAIL_STARTTLS:
            server.starttls()
        if settings.MAIL_USERNAME:
            server.login(settings.MAIL_USERNAME, settings.MAIL_PASSWORD)
        server.sendmail(settings.MAIL_FROM, [to], msg.as_string())


def _send_via_resend_api(to: str, subject: str, html_body: str, attachments: list[tuple[str, bytes, str]] | None) -> None:
    import httpx  # already a dependency (authlib's HTTP client); imported lazily like smtplib above

    payload = {
        "from": f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>",
        "to": [to],
        "subject": subject,
        "html": html_body,
    }
    if attachments:
        # Resend wants attachment content as base64 text, not raw bytes.
        payload["attachments"] = [
            {"filename": filename, "content": base64.b64encode(content).decode("ascii")}
            for filename, content, _subtype in attachments
        ]

    response = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        json=payload,
        timeout=10.0,
    )
    response.raise_for_status()
