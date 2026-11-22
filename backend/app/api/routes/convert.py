"""
Convert API — 本地轻量格式转换与素材抽取
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.database.models import Document
from app.services import convert_service

router = APIRouter(prefix="/api/v1/convert", tags=["convert"])


class ConvertDocRequest(BaseModel):
    doc_id: str


@router.post("/doc-to-markdown")
def convert_doc_to_markdown(req: ConvertDocRequest, db: Session = Depends(get_db)):
    """将文档库中的指定文档转换为 Markdown 格式文本"""
    doc = db.query(Document).filter(Document.id == req.doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档未找到")

    file_path = Path(doc.storage_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="本地原始文件已丢失")

    ext = doc.file_type.lower()
    if ext == "pdf":
        md_text = convert_service.convert_pdf_to_markdown(file_path)
    elif ext in ["docx", "doc"]:
        md_text = convert_service.convert_docx_to_markdown(file_path)
    elif ext in ["txt", "md", "markdown"]:
        md_text = file_path.read_text(encoding="utf-8", errors="ignore")
    else:
        raise HTTPException(status_code=400, detail=f"暂不支持该格式转换: {ext}")

    return {
        "doc_id": doc.id,
        "name": doc.name,
        "markdown": md_text,
        "char_count": len(md_text),
    }


@router.post("/extract-images")
def extract_images_from_doc(req: ConvertDocRequest, db: Session = Depends(get_db)):
    """提取文档库中文档的所有内嵌图片"""
    doc = db.query(Document).filter(Document.id == req.doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档未找到")

    file_path = Path(doc.storage_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="本地原始文件已丢失")

    image_paths = convert_service.extract_document_images(file_path)
    image_items = []
    for p_str in image_paths:
        p = Path(p_str)
        image_items.append({
            "filename": p.name,
            "path": p_str,
            "size": p.stat().st_size if p.exists() else 0,
        })

    return {
        "doc_id": doc.id,
        "name": doc.name,
        "total_images": len(image_items),
        "images": image_items,
    }
