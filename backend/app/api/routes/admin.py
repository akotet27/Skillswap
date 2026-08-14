"""Cross-cutting requirement #19: admin-only user list + login/session audit
log, plus the moderation queue (reports, suspend/ban, manual credit
adjustments) -- the honest fix for v1 having no automated dispute engine:
a human reviews and acts by hand, every action logged (reports stay in
the table as a record even once resolved; credit adjustments always
carry a reason). Deliberately minimal -- a table view + a few write
actions over existing data, not a separate moderation system."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.report import Report, ReportStatus
from app.models.user import User, LoginAudit
from app.schemas.report import ReportOut, CreditAdjustmentRequest
from app.schemas.user import UserOut
from app.services import analytics as analytics_service
from app.services import credits as credits_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


class DailyCountOut(BaseModel):
    date: str
    count: int


class SkillCountOut(BaseModel):
    skill_name: str
    count: int


class AnalyticsOut(BaseModel):
    signups_over_time: list[DailyCountOut]
    top_taught_skills: list[SkillCountOut]
    top_wanted_skills: list[SkillCountOut]
    avg_time_to_first_match_hours: float | None
    sessions_completed: int
    credits_in_circulation: float


class LoginAuditOut(BaseModel):
    id: int
    user_id: int | None
    email_attempted: str
    success: bool
    ip_address: str
    user_agent: str
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/users", response_model=list[UserOut], dependencies=[Depends(get_current_admin)])
def list_users(db: DbSession = Depends(get_db), limit: int = 100, offset: int = 0):
    return db.scalars(select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)).all()


@router.get("/login-audit", response_model=list[LoginAuditOut], dependencies=[Depends(get_current_admin)])
def list_login_audit(db: DbSession = Depends(get_db), limit: int = 100, offset: int = 0):
    return db.scalars(
        select(LoginAudit).order_by(LoginAudit.created_at.desc()).limit(limit).offset(offset)
    ).all()


@router.get("/analytics", response_model=AnalyticsOut, dependencies=[Depends(get_current_admin)])
def get_analytics(db: DbSession = Depends(get_db)):
    """A handful of GROUP BY queries (see app/services/analytics.py), not a
    real warehouse -- fine at v1's scale, and it means one fewer moving
    part (no separate analytics pipeline to keep in sync)."""
    return AnalyticsOut(
        signups_over_time=analytics_service.signups_over_time(db),
        top_taught_skills=analytics_service.top_taught_skills(db),
        top_wanted_skills=analytics_service.top_wanted_skills(db),
        avg_time_to_first_match_hours=analytics_service.avg_time_to_first_match_hours(db),
        sessions_completed=analytics_service.sessions_completed_count(db),
        credits_in_circulation=analytics_service.credits_in_circulation(db),
    )


# --- Moderation ---


@router.get("/reports", response_model=list[ReportOut], dependencies=[Depends(get_current_admin)])
def list_reports(db: DbSession = Depends(get_db), status_filter: str = "open"):
    """Oldest-first, per spec -- a queue, not a feed; the report that's
    been sitting longest surfaces first. `status_filter=all` to see
    resolved ones too (still kept, not deleted, as the record)."""
    query = select(Report)
    if status_filter != "all":
        query = query.where(Report.status == ReportStatus.OPEN)
    return db.scalars(query.order_by(Report.created_at.asc())).all()


@router.post("/reports/{report_id}/resolve", response_model=ReportOut, dependencies=[Depends(get_current_admin)])
def resolve_report(report_id: int, db: DbSession = Depends(get_db)):
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    report.status = ReportStatus.RESOLVED
    db.commit()
    db.refresh(report)
    return report


@router.post("/users/{user_id}/suspend", response_model=UserOut, dependencies=[Depends(get_current_admin)])
def suspend_user(user_id: int, db: DbSession = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.is_admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Can't suspend an admin account")
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/unsuspend", response_model=UserOut, dependencies=[Depends(get_current_admin)])
def unsuspend_user(user_id: int, db: DbSession = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.is_active = True
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/credit-adjustment", dependencies=[Depends(get_current_admin)])
def adjust_user_credits(user_id: int, payload: CreditAdjustmentRequest, db: DbSession = Depends(get_db)):
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    credits_service.apply_admin_adjustment(db, user_id, payload.amount, payload.reason)
    db.commit()
    return {
        "balance": credits_service.get_balance(db, user_id),
        "pending_balance": credits_service.get_pending_balance(db, user_id),
    }
