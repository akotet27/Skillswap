"""
Plain smtplib sender (per the spec: "any SMTP-compatible provider ... or
plain smtplib"). Deliberately synchronous and dependency-light -- it only
ever runs inside a Celery worker (see app/tasks/email_tasks.py), never in
a request handler, so blocking I/O here doesn't stall the API.

Backend is gated by EMAIL_BACKEND (see app/core/config.py):
  - "console" (the default, including in every test run) -- never touches
    the network, just logs the subject/recipient/body. This is
    deliberate: development and automated tests must never send a real
    email, so real SMTP sending requires explicitly opting in.
  - "smtp" -- actually sends via the configured MAIL_* settings. Only set
    this in an environment where sending real mail is intended.
"""
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger("skillswap.email")


def send_email(to: str, subject: str, html_body: str, attachments: list[tuple[str, bytes, str]] | None = None) -> None:
    """attachments: list of (filename, content_bytes, mime_subtype), e.g. ('invite.ics', b'...', 'calendar')."""
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
