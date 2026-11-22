"""
Pydantic Schemas — 文档管理模块的请求与响应模型
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── 通用 ────────────────────────────────────────────────────────────────────

class TaskResponse(BaseModel):
    task_id: str
    document_id: str
    status: str


class ErrorResponse(BaseModel):
    code: str
    message: str


# ── 文档 ────────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: str
    name: str
    file_type: str
    file_size: int
    page_count: int
    char_count: int
    status: str                        # pending | parsing | indexed | failed
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    total: int
    items: list[DocumentOut]


class DocumentDetailOut(DocumentOut):
    """Full document info, potentially with preview text."""
    preview_text: Optional[str] = None


# ── 切块 ────────────────────────────────────────────────────────────────────

class ChunkOut(BaseModel):
    id: str
    chunk_index: int
    page_number: Optional[int]
    section_title: Optional[str]
    content: str
    char_length: int

    model_config = {"from_attributes": True}


class DocumentChunksResponse(BaseModel):
    document_id: str
    total_chunks: int
    chunks: list[ChunkOut]


# ── 异步任务 ─────────────────────────────────────────────────────────────────

class TaskStatusOut(BaseModel):
    id: str
    task_type: str
    target_id: Optional[str]
    status: str
    progress: int
    result_json: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
