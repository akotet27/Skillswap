"""
SQLAlchemy's `Enum(SomePyEnum, ...)` defaults to storing the Python
member's *name* (e.g. "SIGNUP_VERIFY"), not its `.value`
("signup_verify") -- a well-known gotcha with `str, enum.Enum` hybrid
classes, where it's easy to assume `.value` is what gets persisted since
that's what string comparisons/JSON serialization use everywhere else.

Every hand-written Alembic migration in this project defines the
Postgres ENUM type's labels as the lowercase `.value` strings (matching
what the frontend/API send and expect back), so every SQLAlchemy Enum
column needs `values_callable` pointed at `.value` to match -- otherwise
inserts/updates fail with "invalid input value for enum" as soon as they
hit a real Postgres database (SQLite's laxer enum handling let this slip
through earlier manual testing before it was caught against Postgres).

Use `str_enum(PyEnumClass, "pg_enum_type_name")` everywhere instead of
`sqlalchemy.Enum(...)` directly, so this is fixed in one place rather
than repeated (and potentially forgotten) at every call site.
"""
from sqlalchemy import Enum as SAEnum


def str_enum(enum_cls, name: str) -> SAEnum:
    return SAEnum(enum_cls, name=name, values_callable=lambda x: [e.value for e in x])
