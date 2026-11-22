"""
Documents API Router — file import, listing, detail, chunks and deletion.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.schemas import (
    DocumentChunksResponse,
    DocumentDetailOut,
    DocumentListResponse,
    DocumentOut,
    TaskResponse,
    TaskStatusOut,
    ChunkOut,
)
from app.database.session import get_db
from app.services import document_service

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post(
    "/import",
    response_model=TaskResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Import a document into the managed library",
)
async def import_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Accepts multipart/form-data with a single `file` field.
    Copies the file into managed storage, starts background parsing,
    and returns a task_id for progress polling.
    """
    original_name = file.filename or "unnamed_document"

    # Write upload to a temp file so we can compute SHA-256 without keeping
    # the entire content in memory.
    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=Path(original_name).suffix,
    ) as tmp:
        tmp_path = Path(tmp.name)
        content = await file.read()
        tmp.write(content)

    try:
        doc, task = document_service.import_document(
            db=db,
            source_path=tmp_path,
            original_name=original_name,
        )
    except ValueError as exc:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "IMPORT_ERROR", "message": str(exc)},
        )
    finally:
        tmp_path.unlink(missing_ok=True)

    return TaskResponse(
        task_id=task.id,
        document_id=doc.id,
        status=task.status,
    )


@router.get(
    "",
    response_model=DocumentListResponse,
    summary="List all imported documents",
)
def list_documents(db: Session = Depends(get_db)):
    docs = document_service.list_documents(db)
    return DocumentListResponse(
        total=len(docs),
        items=[DocumentOut.model_validate(d) for d in docs],
    )


@router.get(
    "/{doc_id}",
    response_model=DocumentDetailOut,
    summary="Get document detail with optional preview text",
)
def get_document(doc_id: str, db: Session = Depends(get_db)):
    doc = document_service.get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    out = DocumentDetailOut.model_validate(doc)

    # Attach a small preview from the first chunk
    chunks = document_service.get_document_chunks(db, doc_id)
    if chunks:
        out.preview_text = chunks[0].content[:500]

    return out


@router.delete(
    "/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document and all its associated data",
)
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    deleted = document_service.delete_document(db, doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")


@router.get(
    "/{doc_id}/chunks",
    response_model=DocumentChunksResponse,
    summary="Get parsed text chunks for a document",
)
def get_chunks(doc_id: str, db: Session = Depends(get_db)):
    doc = document_service.get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    chunks = document_service.get_document_chunks(db, doc_id)
    return DocumentChunksResponse(
        document_id=doc_id,
        total_chunks=len(chunks),
        chunks=[ChunkOut.model_validate(c) for c in chunks],
    )


@router.get(
    "/tasks/{task_id}",
    response_model=TaskStatusOut,
    summary="Poll background task status",
)
def get_task(task_id: str, db: Session = Depends(get_db)):
    task = document_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskStatusOut.model_validate(task)
