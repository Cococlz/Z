"""
Convert Service — 本地纯 Python 格式转换与文档素材提取（无需 LibreOffice/Pandoc）
- PDF -> Markdown
- DOCX -> Markdown
- 一键提取文档内所有嵌入式高清图片
"""
from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from app.core.config import settings

def convert_pdf_to_markdown(source_path: Path) -> str:
    """提取 PDF 文本并格式化为标准 Markdown 结构"""
    import pymupdf  # type: ignore

    doc = pymupdf.open(source_path)
    md_lines: list[str] = [f"# {source_path.stem}\n"]

    for page_idx, page in enumerate(doc, 1):
        md_lines.append(f"\n<!-- Page {page_idx} -->\n")
        blocks = page.get_text("blocks")
        # blocks: (x0, y0, x1, y1, text, block_no, block_type)
        for b in blocks:
            if b[6] == 0:  # text block
                text = b[4].strip()
                if not text:
                    continue
                # 简单根据字数和断行判断是否为标题
                if len(text) < 40 and "\n" not in text:
                    md_lines.append(f"### {text}\n")
                else:
                    md_lines.append(f"{text}\n")

    doc.close()
    return "\n".join(md_lines)


def convert_docx_to_markdown(source_path: Path) -> str:
    """提取 DOCX 文本并按段落样式格式化为 Markdown"""
    import docx  # type: ignore

    doc = docx.Document(source_path)
    md_lines: list[str] = [f"# {source_path.stem}\n"]

    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue
        style_name = p.style.name.lower()
        if "heading 1" in style_name:
            md_lines.append(f"\n## {text}\n")
        elif "heading 2" in style_name:
            md_lines.append(f"\n### {text}\n")
        elif "heading 3" in style_name:
            md_lines.append(f"\n#### {text}\n")
        else:
            md_lines.append(f"{text}\n")

    return "\n".join(md_lines)


def extract_document_images(source_path: Path, output_dir: Optional[Path] = None) -> list[str]:
    """
    提取 PDF 或 DOCX 中所有的内嵌图片，保存到指定目录，返回相对/绝对路径列表
    """
    ext = source_path.suffix.lower()
    if output_dir is None:
        target_dir = settings.STORAGE_DIR / "extracted_images" / f"{source_path.stem}_{uuid.uuid4().hex[:6]}"
    else:
        target_dir = output_dir

    target_dir.mkdir(parents=True, exist_ok=True)
    saved_images: list[str] = []

    if ext == ".pdf":
        import pymupdf  # type: ignore
        doc = pymupdf.open(source_path)
        img_count = 0
        for page_idx, page in enumerate(doc, 1):
            image_list = page.get_images(full=True)
            for img_info in image_list:
                xref = img_info[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                img_count += 1
                img_name = f"page_{page_idx}_img_{img_count}.{image_ext}"
                img_path = target_dir / img_name
                img_path.write_bytes(image_bytes)
                saved_images.append(str(img_path))
        doc.close()

    elif ext == ".docx":
        import docx  # type: ignore
        doc = docx.Document(source_path)
        img_count = 0
        for rel in doc.part.rels.values():
            if "image" in rel.target_ref:
                img_part = rel.target_part
                img_bytes = img_part.blob
                # 从 content_type 判断后缀，默认 png
                ext_name = "png"
                if "jpeg" in img_part.content_type:
                    ext_name = "jpg"
                elif "gif" in img_part.content_type:
                    ext_name = "gif"
                img_count += 1
                img_name = f"image_{img_count}.{ext_name}"
                img_path = target_dir / img_name
                img_path.write_bytes(img_bytes)
                saved_images.append(str(img_path))

    return saved_images
