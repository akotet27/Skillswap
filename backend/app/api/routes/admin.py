"""Cross-cutting requirement #19: admin-only user list + login/session audit
log. Deliberately minimal -- a table view over existing data, not a
separate analytics system."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.user import User, LoginAudit
from app.schemas.user import UserOut
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
