"""Daily sweep for the skill waitlist (see app/models/skill.py's
SkillWaitlist, app/api/routes/skills.py's join/leave endpoints). Runs once
a day rather than on every UserSkill write -- a new teacher showing up
doesn't need to notify waitlisted learners within seconds, and sweeping
avoids firing this query on every single skill-tag edit."""
from datetime import datetime, timezone

from sqlalchemy import select

from app.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.skill import Skill, SkillWaitlist, UserSkill, SkillType
from app.models.user import User
from app.services.email import send_email


@celery_app.task(name="app.tasks.waitlist_tasks.notify_waitlist_matches")
def notify_waitlist_matches() -> int:
    """For every unnotified waitlist row, check whether the skill now has a
    teacher; if so, email the waitlisted user and mark it notified. Rows
    are kept (not deleted) as the record of who was told and when."""
    db = SessionLocal()
    notified = 0
    try:
        rows = db.scalars(select(SkillWaitlist).where(SkillWaitlist.notified_at.is_(None))).all()
        for row in rows:
            has_teacher = db.scalar(
                select(UserSkill.id).where(
                    UserSkill.skill_id == row.skill_id,
                    UserSkill.type == SkillType.HAVE,
                    UserSkill.user_id != row.user_id,
                ).limit(1)
            )
            if not has_teacher:
                continue

            user = db.get(User, row.user_id)
            skill = db.get(Skill, row.skill_id)
            if user and skill:
                send_skill_available_email.delay(user.email, skill.name)
            row.notified_at = datetime.now(timezone.utc)
            notified += 1
        db.commit()
    finally:
        db.close()
    return notified


@celery_app.task(name="app.tasks.waitlist_tasks.send_skill_available_email")
def send_skill_available_email(to: str, skill_name: str) -> None:
    body = f"""
    <div style="font-family:sans-serif">
      <h2 style="color:#0d111b">Good news -- someone can teach {skill_name} now</h2>
      <p>You asked to be notified when a teacher for <strong>{skill_name}</strong> joined SkillSwap.
      Head back in and check the Browse page to find them and book a session.</p>
    </div>
    """
    send_email(to, f"Someone can teach {skill_name} now", body)
