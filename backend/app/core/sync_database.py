"""
Synchronous database configuration for background workers.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.core.config import settings

# Convert async URI to sync URI by removing asyncpg driver
SYNC_DATABASE_URI = settings.DATABASE_URL.replace("+asyncpg", "")

# Create sync engine
sync_engine = create_engine(
    SYNC_DATABASE_URI,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    echo=settings.DEBUG
)

# Create sync session factory
SyncSessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=sync_engine
)


def get_sync_db() -> Generator[Session, None, None]:
    """Get synchronous database session."""
    db = SyncSessionLocal()
    try:
        yield db
    finally:
        db.close()