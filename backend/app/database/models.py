"""
SQLAlchemy ORM Models — 智阅 AI 核心数据表定义
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Text, DateTime, ForeignKey, Boolean
)
from sqlalchemy.orm import DeclarativeBase, relationship


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class Base(DeclarativeBase):
    pass


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)                    # 原始文件名
    file_type = Column(String, nullable=False)               # pdf / docx / txt / md
    file_size = Column(Integer, nullable=False)              # 字节数
    file_hash = Column(String, nullable=False, unique=True)  # SHA-256，防重复
    storage_path = Column(String, nullable=False)            # 受管目录内的绝对路径
    page_count = Column(Integer, default=0)
    char_count = Column(Integer, default=0)
    # pending | parsing | indexed | failed
    status = Column(String, nullable=False, default="pending")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    chunks = relationship(
        "DocumentChunk", back_populates="document",
        cascade="all, delete-orphan", passive_deletes=True
    )
    summaries = relationship(
        "Summary", back_populates="document",
        cascade="all, delete-orphan", passive_deletes=True
    )
    conversations = relationship(
        "Conversation", back_populates="document",
        cascade="all, delete-orphan", passive_deletes=True
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(String, primary_key=True, default=_uuid)
    document_id = Column(
        String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=True
    )
    chunk_index = Column(Integer, nullable=False)   # 在文档中的序号（0-based）
    page_number = Column(Integer, nullable=True)    # 物理页码（PDF）
    section_title = Column(String, nullable=True)   # 所属章节标题
    content = Column(Text, nullable=False)          # 切块文本
    char_length = Column(Integer, nullable=False)   # 字符数
    created_at = Column(DateTime, default=_now)

    document = relationship("Document", back_populates="chunks")


class Summary(Base):
    __tablename__ = "summaries"

    id = Column(String, primary_key=True, default=_uuid)
    document_id = Column(
        String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=True
    )
    # overall | outline | keypoints
    summary_type = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=_now)

    document = relationship("Document", back_populates="summaries")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=_uuid)
    document_id = Column(
        String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=True
    )
    title = Column(String, nullable=False)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    document = relationship("Document", back_populates="conversations")
    messages = relationship(
        "Message", back_populates="conversation",
        cascade="all, delete-orphan", passive_deletes=True
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=_uuid)
    conversation_id = Column(
        String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role = Column(String, nullable=False)         # user | assistant | system
    content = Column(Text, nullable=False)
    citations_json = Column(Text, nullable=True)  # JSON array of citation objects
    created_at = Column(DateTime, default=_now)

    conversation = relationship("Conversation", back_populates="messages")


class AsyncTask(Base):
    __tablename__ = "async_tasks"

    id = Column(String, primary_key=True, default=_uuid)
    # doc_parse | doc_index | doc_summary | format_convert
    task_type = Column(String, nullable=False)
    target_id = Column(String, nullable=True)        # 关联 document.id 等
    # pending | running | success | failed
    status = Column(String, nullable=False, default="pending")
    progress = Column(Integer, default=0)            # 0-100
    result_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
    is_encrypted = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now)
