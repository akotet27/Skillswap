"""
Declarative base + a single import point that pulls in every model module,
so Alembic's autogenerate (and `Base.metadata.create_all` in tests) sees the
full schema. Import `Base` from here, never re-declare it elsewhere.
"""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Import order doesn't matter for SQLAlchemy resolution (string-based
# relationship() targets are resolved lazily), but every model module must
# be imported somewhere before Base.metadata is used -- this is that place.
from app.models import (  # noqa: E402,F401
    user,
    skill,
    availability,
    swap_request,
    session as session_model,
    messaging,
    credit,
    rating,
    auth as auth_model,
    report,
)
