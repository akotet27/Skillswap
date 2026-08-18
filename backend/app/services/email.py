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

The actual network call (SMTP or Resend) is wrapped in a try/except that
logs and swallows the error instead of raising. This matters specifically
on the free-tier deploy path (CELERY_TASK_ALWAYS_EAGER=true, see
app/celery_app.py): an email task there runs inline in the request that
queued it, so an unhandled exception here would crash an unrelated
user-facing action (signup, password reset, booking confirmation...) just
because the email provider rejected or hiccuped -- e.g. Resend's sandbox
mode (no verified domain) rejects any recipient other than the account's
own signup address, which would otherwise 500 every signup for anyone but
the developer. A failed send should degrade to "no email arrived", never
"the request failed."
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

    try:
        with smtplib.SMTP(settings.MAIL_SERVER, settings.MAIL_PORT) as server:
            if settings.MAIL_STARTTLS:
                server.starttls()
            if settings.MAIL_USERNAME:
                server.login(settings.MAIL_USERNAME, settings.MAIL_PASSWORD)
            server.sendmail(settings.MAIL_FROM, [to], msg.as_string())
    except Exception:
        logger.exception("Failed to send email via SMTP to=%s subject=%s", to, subject)


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

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json=payload,
            timeout=10.0,
        )
        response.raise_for_status()
    except Exception:
        # Swallowed on purpose -- see the module docstring. Most common
        # cause in practice: Resend's sandbox mode (no verified domain)
        # rejecting a recipient that isn't the account's own signup
        # address, which returns a 4xx here.
        logger.exception("Failed to send email via Resend API to=%s subject=%s", to, subject)
