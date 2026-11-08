"""SQLite engine, sessions, IDs, and mirroring static config into tables."""
from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app import config
from app.models import Asset, Person

ID_PREFIXES = {
    "Handoff": "H", "Statement": "S", "Item": "I", "Fact": "F", "FollowUp": "FU",
    "ClarificationQuestion": "Q", "Acknowledgment": "A", "VerificationCheck": "V", "AuditEvent": "E",
}

_engine = None


def get_engine(url: str | None = None):
    """Create the engine once. Pass `url` (e.g. "sqlite://") to replace it in tests."""
    global _engine
    if url is not None or _engine is None:
        url = url or config.database_url()
        if url.startswith("sqlite:///"):
            Path(url[len("sqlite:///"):]).parent.mkdir(parents=True, exist_ok=True)
        if url == "sqlite://":  # in-memory (tests): one shared connection
            _engine = create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
        else:
            _engine = create_engine(url, connect_args={"check_same_thread": False})
    return _engine


def init_db(url: str | None = None, drop: bool = False) -> None:
    engine = get_engine(url)
    if drop:
        SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    with Session(get_engine()) as session:
        yield session


def _num(id_: str) -> int:
    try:
        return int(id_.rsplit("-", 1)[1])
    except (IndexError, ValueError):
        return 0


def next_id(session: Session, model: type[SQLModel]) -> str:
    """Sequential ids like H-0001, FU-0002: one above the highest stored or pending id."""
    prefix = ID_PREFIXES[model.__name__]
    with session.no_autoflush:
        stored = session.exec(select(model.id)).all()
    pending = [obj.id for obj in session.new if isinstance(obj, model) and obj.id]
    top = max((_num(i) for i in [*stored, *pending]), default=0)
    return f"{prefix}-{top + 1:04d}"


def id_sequence(session: Session, model: type[SQLModel]):
    """Callable that hands out consecutive ids, for creating several rows before adding them."""
    prefix = ID_PREFIXES[model.__name__]
    start = int(next_id(session, model).split("-")[1])
    counter = iter(range(start, start + 10_000))
    return lambda: f"{prefix}-{next(counter):04d}"


def load_static(session: Session) -> None:
    """Mirror roster and assets from config/*.yaml into tables (upsert)."""
    for p in config.people().values():
        session.merge(Person(id=p["id"], name=p["name"], role=p["role"],
                             team=p.get("team"), phone=p.get("phone")))
    for a in config.assets().values():
        session.merge(Asset(id=a["id"], name=a["name"], type=a["type"],
                            location=a.get("hall"), aliases=a.get("aliases", [])))
    session.commit()
