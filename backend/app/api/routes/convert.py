"""
Convert API — 本地轻量格式转换与素材抽取
支持矩阵：
- PDF -> TXT / Markdown / Word (.docx)
- PPTX -> Word 讲义大纲 (.docx) / TXT / Markdown
- DOCX -> TXT / Markdown
- Markdown -> Word (.docx)
- 内嵌图片素材批量提取 (PDF / DOCX / PPTX)
"""
from __future__ import annotations

import os
import platform
import subprocess
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.database.models import Document
from app.services import convert_service

router = APIRouter(prefix="/api/v1/convert", tags=["convert"])


class ConvertDocRequest(BaseModel):
    doc_id: str


class TransformRequest(BaseModel):
    doc_id: Optional[str] = None
    file_path: Optional[str] = None
    target_format: str = "txt"  # txt | markdown | docx | images


class RevealFileRequest(BaseModel):
    file_path: str


def _resolve_source_path(doc_id: Optional[str], file_path: Optional[str], db: Session) -> tuple[Path, str]:
    """解析源文件路径和原始文件名"""
    if doc_id:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="文档未找到")
        p = Path(doc.storage_path)
        if not p.exists():
            raise HTTPException(status_code=404, detail="本地原始文件已丢失")
        return p, doc.name
    elif file_path:
        p = Path(file_path)
        if not p.exists():
            raise HTTPException(status_code=404, detail="指定的本地文件不存在")
        return p, p.name
    else:
        raise HTTPException(status_code=400, detail="必须提供 doc_id 或 file_path")


def _execute_transform(source_path: Path, source_name: str, target_format: str) -> dict:
    """执行转换主逻辑"""
    ext = source_path.suffix.lower().lstrip(".")
    target_format = target_format.lower().strip()

    # 1. 提取内嵌高清图片
    if target_format == "images":
        image_paths = convert_service.extract_document_images(source_path)
        image_items = []
        for p_str in image_paths:
            p = Path(p_str)
            image_items.append({
                "filename": p.name,
                "path": p_str,
                "size": p.stat().st_size if p.exists() else 0,
            })
        return {
            "ok": True,
            "source_name": source_name,
            "source_type": ext,
            "target_format": "images",
            "total_images": len(image_items),
            "images": image_items,
        }

    # 2. 目标为纯文本 (TXT)
    if target_format == "txt":
        if ext == "pdf":
            content = convert_service.convert_pdf_to_txt(source_path)
        elif ext in ["pptx", "ppt"]:
            content = convert_service.convert_pptx_to_txt(source_path)
        elif ext in ["docx", "doc"]:
            content = convert_service.convert_docx_to_txt(source_path)
        elif ext in ["txt", "md", "markdown"]:
            content = source_path.read_text(encoding="utf-8", errors="ignore")
        else:
            raise HTTPException(status_code=400, detail=f"不支持从 {ext} 转为 TXT")

        # 生成可供下载的临时 txt 文件
        target_dir = settings.STORAGE_DIR / "converted"
        target_dir.mkdir(parents=True, exist_ok=True)
        out_file = target_dir / f"{source_path.stem}.txt"
        out_file.write_text(content, encoding="utf-8")

        return {
            "ok": True,
            "source_name": source_name,
            "source_type": ext,
            "target_format": "txt",
            "content": content,
            "char_count": len(content),
            "output_file": str(out_file),
            "download_filename": out_file.name,
        }

    # 3. 目标为 Markdown (MD)
    if target_format in ["markdown", "md"]:
        if ext == "pdf":
            content = convert_service.convert_pdf_to_markdown(source_path)
        elif ext in ["pptx", "ppt"]:
            content = convert_service.convert_pptx_to_markdown(source_path)
        elif ext in ["docx", "doc"]:
            content = convert_service.convert_docx_to_markdown(source_path)
        elif ext in ["txt", "md", "markdown"]:
            content = source_path.read_text(encoding="utf-8", errors="ignore")
        else:
            raise HTTPException(status_code=400, detail=f"不支持从 {ext} 转为 Markdown")

        target_dir = settings.STORAGE_DIR / "converted"
        target_dir.mkdir(parents=True, exist_ok=True)
        out_file = target_dir / f"{source_path.stem}.md"
        out_file.write_text(content, encoding="utf-8")

        return {
            "ok": True,
            "source_name": source_name,
            "source_type": ext,
            "target_format": "markdown",
            "content": content,
            "char_count": len(content),
            "output_file": str(out_file),
            "download_filename": out_file.name,
        }

    # 4. 目标为 Word (.docx)
    if target_format == "docx":
        if ext in ["pptx", "ppt"]:
            out_path = convert_service.convert_pptx_to_docx(source_path)
        elif ext == "pdf":
            out_path = convert_service.convert_pdf_to_docx(source_path)
        elif ext in ["md", "markdown", "txt"]:
            md_text = source_path.read_text(encoding="utf-8", errors="ignore")
            out_path = convert_service.convert_markdown_to_docx(md_text, title=source_path.stem)
        elif ext in ["docx", "doc"]:
            out_path = source_path
        else:
            raise HTTPException(status_code=400, detail=f"不支持从 {ext} 转为 DOCX")

        return {
            "ok": True,
            "source_name": source_name,
            "source_type": ext,
            "target_format": "docx",
            "file_size": out_path.stat().st_size if out_path.exists() else 0,
            "output_file": str(out_path),
            "download_filename": out_path.name,
        }

    raise HTTPException(status_code=400, detail=f"未知目标格式: {target_format}")


# ── API 路由 ──────────────────────────────────────────────────────────────────

@router.post("/transform")
def transform_document(req: TransformRequest, db: Session = Depends(get_db)):
    """通用格式转换入口（针对文档库或指定本地文件）"""
    source_path, source_name = _resolve_source_path(req.doc_id, req.file_path, db)
    return _execute_transform(source_path, source_name, req.target_format)


@router.post("/upload-and-transform")
async def upload_and_transform(
    file: UploadFile = File(...),
    target_format: str = Form("txt"),
):
    """支持直接上传任意本地文件进行即时转换"""
    upload_dir = settings.STORAGE_DIR / "temp_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    file_id = uuid.uuid4().hex[:8]
    ext = Path(file.filename or "file").suffix
    saved_path = upload_dir / f"{file_id}_{file.filename}"

    content_bytes = await file.read()
    saved_path.write_bytes(content_bytes)

    try:
        result = _execute_transform(saved_path, file.filename or "file", target_format)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"转换处理异常: {str(e)}")


@router.get("/download/{filename}")
def download_converted_file(filename: str):
    """下载或获取已转换的文件"""
    target_dir = settings.STORAGE_DIR / "converted"
    file_path = target_dir / filename
    if not file_path.exists():
        # 也可能是从原始 temp_uploads 里下载
        file_path = settings.STORAGE_DIR / "temp_uploads" / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在或已被清理")

    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/octet-stream",
    )


@router.post("/reveal-in-finder")
def reveal_in_finder(req: RevealFileRequest):
    """在 macOS Finder 中高亮定位指定已转换文件"""
    p = Path(req.file_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    if platform.system() == "Darwin":
        subprocess.run(["open", "-R", str(p)], check=False)
        return {"ok": True, "path": str(p)}
    return {"ok": False, "error": "当前操作系统非 macOS"}


# ── 历史旧接口兼容 ────────────────────────────────────────────────────────────

@router.post("/doc-to-markdown")
def convert_doc_to_markdown(req: ConvertDocRequest, db: Session = Depends(get_db)):
    """兼容旧接口：转 Markdown"""
    res = transform_document(TransformRequest(doc_id=req.doc_id, target_format="markdown"), db)
    return {
        "doc_id": req.doc_id,
        "name": res["source_name"],
        "markdown": res.get("content", ""),
        "char_count": res.get("char_count", 0),
    }


@router.post("/extract-images")
def extract_images_from_doc(req: ConvertDocRequest, db: Session = Depends(get_db)):
    """兼容旧接口：提取图片素材"""
    res = transform_document(TransformRequest(doc_id=req.doc_id, target_format="images"), db)
    return {
        "doc_id": req.doc_id,
        "name": res["source_name"],
        "total_images": res.get("total_images", 0),
        "images": res.get("images", []),
    }
