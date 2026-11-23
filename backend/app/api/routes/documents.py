"""
Documents API Router — file import, listing, detail, chunks and deletion.
"""
from __future__ import annotations

import json
import tempfile
from datetime import datetime
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
    ToggleFavoriteResponse,
    UpdateTagsRequest,
    UpdateTagsResponse,
    AllTagsResponse,
    TagStat,
    ExportNotesResponse,
)
from app.database.session import get_db
from app.database.models import Annotation
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
    "/tags/all",
    response_model=AllTagsResponse,
    summary="Get all unique tags across documents with frequency",
)
def get_all_tags(db: Session = Depends(get_db)):
    docs = document_service.list_documents(db)
    counts: dict[str, int] = {}
    for d in docs:
        if d.tags:
            try:
                t_list = json.loads(d.tags)
                if isinstance(t_list, list):
                    for t in t_list:
                        clean_t = str(t).strip()
                        if clean_t:
                            counts[clean_t] = counts.get(clean_t, 0) + 1
            except Exception:
                pass
    sorted_tags = [TagStat(name=k, count=v) for k, v in sorted(counts.items(), key=lambda x: (-x[1], x[0]))]
    return AllTagsResponse(tags=sorted_tags)


@router.get(
    "/notes/export-all",
    response_model=ExportNotesResponse,
    summary="Export all reading highlights and notes across library as Markdown",
)
def export_all_notes(db: Session = Depends(get_db)):
    docs = document_service.list_documents(db)
    total_notes = 0
    total_docs = 0

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    filename = f"智阅AI_全库读书笔记_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"

    md_lines = [
        f"# 📚 智阅 AI · 全知识库读书笔记资产总览",
        f"> 本地优先个人智能工作站 · 资产导出于 {now_str}",
        "",
        "---",
        "",
    ]

    for doc in docs:
        annotations = (
            db.query(Annotation)
            .filter(Annotation.document_id == doc.id)
            .order_by(Annotation.page_index.asc(), Annotation.created_at.asc())
            .all()
        )
        if not annotations:
            continue

        total_docs += 1
        total_notes += len(annotations)

        tag_str = ""
        if doc.tags:
            try:
                t_list = json.loads(doc.tags)
                if t_list:
                    tag_str = " · 标签: " + " ".join([f"`#{t}`" for t in t_list])
            except Exception:
                pass

        fav_str = " ⭐ [星标收藏]" if doc.is_favorite else ""
        md_lines.append(f"## 📖 《{doc.name}》{fav_str}")
        md_lines.append(f"- **格式**: {doc.file_type.upper()} · **总篇幅**: {doc.page_count} 页 / {doc.char_count} 字{tag_str}")
        md_lines.append(f"- **划线批注**: 共 {len(annotations)} 条")
        md_lines.append("")

        for i, a in enumerate(annotations, start=1):
            color_badge = {
                "yellow": "🟡 [重点]",
                "green": "🟢 [理解]",
                "purple": "🟣 [思考]",
                "blue": "🔵 [疑问]",
            }.get(a.color, "📌 [批注]")

            p_num = a.page_index + 1
            md_lines.append(f"### {i}. {color_badge} 第 {p_num} 页摘录")
            md_lines.append(f"> {a.selected_text.strip()}")
            md_lines.append("")

            if a.note:
                md_lines.append(f"- **✍️ 我的思考**: {a.note.strip()}")
            if a.ai_insight:
                md_lines.append(f"- **💡 AI 伴读洞察**: {a.ai_insight.strip()}")
            if a.created_at:
                md_lines.append(f"- *记录于: {a.created_at.strftime('%Y-%m-%d %H:%M')}*")
            md_lines.append("")

        md_lines.append("---")
        md_lines.append("")

    if total_notes == 0:
        md_lines.append("*暂无任何划线与批注笔记。在「深度阅读」中划选任意文字并选择颜色即可沉淀知识资产。*")

    content = "\n".join(md_lines)
    return ExportNotesResponse(
        filename=filename,
        content=content,
        total_notes=total_notes,
        total_docs=total_docs,
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


@router.post(
    "/{doc_id}/favorite",
    response_model=ToggleFavoriteResponse,
    summary="Toggle favorite star status for a document",
)
def toggle_favorite(doc_id: str, db: Session = Depends(get_db)):
    doc = document_service.get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.is_favorite = not bool(doc.is_favorite)
    db.add(doc)
    db.commit()
    return ToggleFavoriteResponse(id=doc.id, is_favorite=doc.is_favorite)


@router.post(
    "/{doc_id}/tags",
    response_model=UpdateTagsResponse,
    summary="Update document tags",
)
def update_tags(doc_id: str, req: UpdateTagsRequest, db: Session = Depends(get_db)):
    doc = document_service.get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    clean_tags = []
    seen = set()
    for t in req.tags:
        clean = t.strip().lstrip("#").strip()
        if clean and clean not in seen:
            seen.add(clean)
            clean_tags.append(clean)
    doc.tags = json.dumps(clean_tags, ensure_ascii=False)
    db.add(doc)
    db.commit()
    return UpdateTagsResponse(id=doc.id, tags=clean_tags)


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
