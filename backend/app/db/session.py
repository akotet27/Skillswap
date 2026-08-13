"""
SQLAlchemy engine/session setup.

pool_pre_ping avoids the classic "server has gone away" error on the first
query after Postgres/Redis have been idle -- cheap insurance in local dev
where the DB container may nap.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def get_db():
    """FastAPI dependency: one DB session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
