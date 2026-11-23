"""
SQLite 数据库会话管理 — 同步版本（FastAPI 后台任务使用）
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings
from app.database.models import Base


def _get_engine():
    db_path = settings.DATABASE_DIR / "zhiyue.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False, "timeout": 30.0},
        echo=False,
    )
    # Enable WAL mode for better concurrent read performance
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

    return engine


engine = _get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _migrate_db(engine) -> None:
    """自动检测并迁移已有表结构约束（保证向后兼容与自愈）"""
    with engine.connect() as conn:
        # 检查 conversations 表中 document_id 是否被限制为 NOT NULL
        cursor = conn.connection.cursor()
        try:
            cursor.execute("PRAGMA table_info(conversations)")
            columns = cursor.fetchall()
            # PRAGMA table_info returns: (cid, name, type, notnull, dflt_value, pk)
            for col in columns:
                if col[1] == "document_id" and col[3] == 1:  # notnull == 1
                    # 需要迁移以允许 NULL
                    cursor.execute("PRAGMA foreign_keys=OFF")
                    cursor.execute("""
                        CREATE TABLE conversations_tmp (
                            id VARCHAR NOT NULL PRIMARY KEY,
                            document_id VARCHAR,
                            title VARCHAR NOT NULL,
                            created_at DATETIME,
                            updated_at DATETIME,
                            FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE
                        )
                    """)
                    cursor.execute("INSERT INTO conversations_tmp SELECT id, document_id, title, created_at, updated_at FROM conversations")
                    cursor.execute("DROP TABLE conversations")
                    cursor.execute("ALTER TABLE conversations_tmp RENAME TO conversations")
                    cursor.execute("PRAGMA foreign_keys=ON")
                    conn.connection.commit()
                    break

            # 检查 documents 表是否包含阅读进度字段
            cursor.execute("PRAGMA table_info(documents)")
            doc_cols = {col[1] for col in cursor.fetchall()}
            if "last_read_page" not in doc_cols:
                cursor.execute("ALTER TABLE documents ADD COLUMN last_read_page INTEGER DEFAULT 0")
                conn.connection.commit()
            if "last_read_at" not in doc_cols:
                cursor.execute("ALTER TABLE documents ADD COLUMN last_read_at DATETIME")
                conn.connection.commit()
        except Exception as e:
            # 表可能尚不存在，create_all 会负责创建
            pass
        finally:
            cursor.close()


def init_db() -> None:
    """Create all tables if they don't already exist and apply migrations."""
    Base.metadata.create_all(bind=engine)
    _migrate_db(engine)


def get_db() -> Session:
    """FastAPI dependency — yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
