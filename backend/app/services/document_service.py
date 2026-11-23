"""
Document Service — handles import, dedup, storage, parsing and deletion.

Design decisions:
- SHA-256 based deduplication: same file can never be imported twice.
- Managed storage: files are copied into the app's data dir so the original
  can be moved/deleted without breaking the knowledge base.
- Parsing runs in a background thread to avoid blocking the event loop.
"""
from __future__ import annotations

import hashlib
import shutil
import uuid
from pathlib import Path
from threading import Thread

from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.models import AsyncTask, Document, DocumentChunk
from app.parsers.registry import SUPPORTED_EXTENSIONS, parse_document


# ── Helpers ──────────────────────────────────────────────────────────────────

def _sha256(path: Path, chunk_size: int = 65536) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            block = f.read(chunk_size)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def _safe_filename(original_name: str, file_hash: str) -> str:
    """Generate a unique, safe filename for managed storage."""
    suffix = Path(original_name).suffix.lower()
    return f"{file_hash[:16]}_{uuid.uuid4().hex[:8]}{suffix}"


# ── Public API ────────────────────────────────────────────────────────────────

def list_documents(db: Session) -> list[Document]:
    return db.query(Document).order_by(Document.is_favorite.desc(), Document.created_at.desc()).all()


def get_document(db: Session, doc_id: str) -> Document | None:
    return db.query(Document).filter(Document.id == doc_id).first()


def get_document_chunks(db: Session, doc_id: str) -> list[DocumentChunk]:
    return (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == doc_id)
        .order_by(DocumentChunk.chunk_index)
        .all()
    )


def import_document(
    db: Session,
    source_path: Path,
    original_name: str,
) -> tuple[Document, AsyncTask]:
    """
    Import a document into the managed library.

    Steps:
      1. Validate extension.
      2. Compute SHA-256 — reject duplicates.
      3. Copy file into managed storage directory.
      4. Create Document record (status=pending).
      5. Create AsyncTask record.
      6. Launch background thread to parse + chunk.

    Returns (Document, AsyncTask).
    Raises ValueError on duplicate or unsupported format.
    """
    ext = source_path.suffix.lower().lstrip(".")
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"不支持的文件格式：.{ext}")

    # Dedup check
    file_hash = _sha256(source_path)
    existing = db.query(Document).filter(Document.file_hash == file_hash).first()
    if existing:
        raise ValueError(f"该文件已经导入过（文档 ID：{existing.id}）")

    # Copy to managed storage
    settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    managed_name = _safe_filename(original_name, file_hash)
    dest_path = settings.STORAGE_DIR / managed_name
    shutil.copy2(source_path, dest_path)

    file_size = dest_path.stat().st_size

    # Create DB records
    doc = Document(
        id=str(uuid.uuid4()),
        name=original_name,
        file_type=ext,
        file_size=file_size,
        file_hash=file_hash,
        storage_path=str(dest_path),
        status="pending",
    )
    db.add(doc)

    task = AsyncTask(
        id=str(uuid.uuid4()),
        task_type="doc_parse",
        target_id=doc.id,
        status="pending",
        progress=0,
    )
    db.add(task)
    db.commit()
    db.refresh(doc)
    db.refresh(task)

    # Launch background parsing thread
    Thread(
        target=_parse_in_background,
        args=(doc.id, task.id, dest_path),
        daemon=True,
    ).start()

    return doc, task


def delete_document(db: Session, doc_id: str) -> bool:
    """
    Delete a document and all associated data:
      - DocumentChunk rows (cascade via FK)
      - Managed file on disk
      - Document row
    Returns True if found and deleted, False if not found.
    """
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        return False

    # Remove managed file
    managed_path = Path(doc.storage_path)
    if managed_path.exists():
        try:
            managed_path.unlink()
        except OSError:
            pass  # Best-effort; don't block the deletion

    db.delete(doc)
    db.commit()
    return True


def get_task(db: Session, task_id: str) -> AsyncTask | None:
    return db.query(AsyncTask).filter(AsyncTask.id == task_id).first()


# ── Background Parsing ────────────────────────────────────────────────────────

def _parse_in_background(doc_id: str, task_id: str, file_path: Path) -> None:
    """
    Runs in a daemon thread.
    Parses the document, writes chunks to DB, updates task progress.
    """
    from app.database.session import SessionLocal

    db: Session = SessionLocal()
    try:
        # Mark as running
        _update_task(db, task_id, status="running", progress=10)
        _update_doc_status(db, doc_id, "parsing")

        # Parse
        parsed = parse_document(file_path)
        _update_task(db, task_id, progress=50)

        # Write chunks
        chunks = []
        for idx, page in enumerate(parsed.pages):
            chunk = DocumentChunk(
                id=str(uuid.uuid4()),
                document_id=doc_id,
                chunk_index=idx,
                page_number=page.page_number,
                section_title=page.section_title,
                content=page.text,
                char_length=len(page.text),
            )
            chunks.append(chunk)

        db.bulk_save_objects(chunks)

        # Update document metadata
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc:
            doc.page_count = parsed.page_count
            doc.char_count = parsed.char_count
            doc.status = "indexed"      # Phase 2: indexed means parsed (no vector yet)
            db.add(doc)

        _update_task(db, task_id, status="success", progress=100)
        db.commit()

        # Phase 3: 向量索引（在 commit 之后，DB 已持久化 chunks）
        try:
            from app.services import rag_service
            rag_service.index_document(doc_id)
        except Exception as rag_exc:
            # RAG 索引失败不影响文档可用性，只记录日志
            import logging
            logging.getLogger(__name__).warning("RAG indexing failed for doc %s: %s", doc_id, rag_exc)

    except Exception as exc:
        db.rollback()
        err_msg = str(exc)
        _update_task(db, task_id, status="failed", progress=0, error=err_msg)
        _update_doc_status(db, doc_id, "failed", error_message=err_msg)
        db.commit()
    finally:
        db.close()


def _update_task(
    db: Session,
    task_id: str,
    status: str | None = None,
    progress: int | None = None,
    error: str | None = None,
) -> None:
    task = db.query(AsyncTask).filter(AsyncTask.id == task_id).first()
    if not task:
        return
    if status is not None:
        task.status = status
    if progress is not None:
        task.progress = progress
    if error is not None:
        task.error_message = error
    db.add(task)
    # Don't commit here — caller decides when to commit


def _update_doc_status(
    db: Session,
    doc_id: str,
    status: str,
    error_message: str | None = None,
) -> None:
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        return
    doc.status = status
    if error_message is not None:
        doc.error_message = error_message
    db.add(doc)
