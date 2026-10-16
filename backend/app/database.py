import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgrespassword@localhost:5432/home_maintenance_db"
)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {"connect_timeout": 3}

try:
    engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)
    # Test connection
    with engine.connect() as conn:
        pass
except Exception as e:
    print(f"Notice: Connecting to primary DB failed ({str(e)[:80]}). Using self-contained SQLite.")
    DATABASE_URL = "sqlite:///./home_maintenance.db"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, echo=False)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
