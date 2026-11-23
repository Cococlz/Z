"""
Convert Service — 本地纯 Python 格式转换与文档素材提取（无需外部庞大转换器）
支持矩阵：
1. PDF -> TXT / Markdown / Word (.docx)
2. PPTX -> Word 讲义大纲 (.docx) / TXT / Markdown
3. DOCX -> TXT / Markdown
4. Markdown -> Word (.docx)
5. 提取 PDF / DOCX / PPTX 内部全部内嵌高清素材图片
"""
from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from app.core.config import settings


def _get_output_dir() -> Path:
    target_dir = settings.STORAGE_DIR / "converted"
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


# ── PDF 转换 ──────────────────────────────────────────────────────────────────

def convert_pdf_to_txt(source_path: Path) -> str:
    """提取 PDF 文本并格式化为纯净分段 TXT"""
    import pymupdf  # type: ignore

    doc = pymupdf.open(source_path)
    lines: list[str] = [f"=== {source_path.stem} ===\n"]

    for page_idx, page in enumerate(doc, 1):
        text = page.get_text("text").strip()
        if text:
            lines.append(f"\n--- 第 {page_idx} 页 ---\n\n{text}\n")

    doc.close()
    return "\n".join(lines)


def convert_pdf_to_markdown(source_path: Path) -> str:
    """提取 PDF 文本并格式化为标准 Markdown 结构"""
    import pymupdf  # type: ignore

    doc = pymupdf.open(source_path)
    md_lines: list[str] = [f"# {source_path.stem}\n"]

    for page_idx, page in enumerate(doc, 1):
        md_lines.append(f"\n<!-- Page {page_idx} -->\n")
        blocks = page.get_text("blocks")
        for b in blocks:
            if b[6] == 0:  # text block
                text = b[4].strip()
                if not text:
                    continue
                if len(text) < 40 and "\n" not in text:
                    md_lines.append(f"### {text}\n")
                else:
                    md_lines.append(f"{text}\n")

    doc.close()
    return "\n".join(md_lines)


def convert_pdf_to_docx(source_path: Path, output_path: Optional[Path] = None) -> Path:
    """提取 PDF 文本与段落结构转为标准 Word (.docx)"""
    import pymupdf  # type: ignore
    import docx  # type: ignore
    from docx.shared import Pt, RGBColor

    if output_path is None:
        output_path = _get_output_dir() / f"{source_path.stem}_{uuid.uuid4().hex[:6]}.docx"

    pdf = pymupdf.open(source_path)
    doc = docx.Document()
    doc.add_heading(source_path.stem, level=0)

    p_meta = doc.add_paragraph(f"由智阅 AI 格式工坊纯本地转换生成 · 共计 {len(pdf)} 页")
    p_meta.runs[0].font.size = Pt(9)
    p_meta.runs[0].font.color.rgb = RGBColor(128, 128, 128)

    for page_idx, page in enumerate(pdf, 1):
        doc.add_heading(f"第 {page_idx} 页", level=2)
        blocks = page.get_text("blocks")
        for b in blocks:
            if b[6] == 0:  # text block
                text = b[4].strip()
                if not text:
                    continue
                if len(text) < 40 and "\n" not in text:
                    doc.add_heading(text, level=3)
                else:
                    doc.add_paragraph(text)

    pdf.close()
    doc.save(str(output_path))
    return output_path


# ── PPTX 转换 ─────────────────────────────────────────────────────────────────

def convert_pptx_to_docx(source_path: Path, output_path: Optional[Path] = None) -> Path:
    """提取 PPTX 演示文稿各页标题、正文结构与演讲者备注，排版生成 Word 讲义"""
    import pptx  # type: ignore
    import docx  # type: ignore
    from docx.shared import Pt, RGBColor

    if output_path is None:
        output_path = _get_output_dir() / f"{source_path.stem}_讲义大纲_{uuid.uuid4().hex[:6]}.docx"

    prs = pptx.Presentation(source_path)
    doc = docx.Document()

    # 文档大标题与元信息
    doc.add_heading(f"{source_path.stem} · 演示文稿全量结构讲义", level=0)
    p_meta = doc.add_paragraph(f"由智阅 AI 格式工坊纯本地提取生成 · 包含 {len(prs.slides)} 页幻灯片要点与演讲备注")
    p_meta.runs[0].font.size = Pt(9.5)
    p_meta.runs[0].font.color.rgb = RGBColor(128, 128, 128)

    for idx, slide in enumerate(prs.slides, 1):
        title = ""
        if slide.shapes.title and slide.shapes.title.text.strip():
            title = slide.shapes.title.text.strip()

        doc.add_heading(f"第 {idx} 页：{title or '幻灯片'}", level=1)

        # 遍历该页所有形状提取文本与表格
        for shape in slide.shapes:
            if shape == slide.shapes.title:
                continue
            if shape.has_text_frame:
                for p in shape.text_frame.paragraphs:
                    t = p.text.strip()
                    if t:
                        doc.add_paragraph(t, style="List Bullet")
            elif shape.has_table:
                table = doc.add_table(rows=len(shape.table.rows), cols=len(shape.table.columns))
                table.style = "Table Grid"
                for r_i, row in enumerate(shape.table.rows):
                    for c_i, cell in enumerate(row.cells):
                        table.cell(r_i, c_i).text = cell.text.strip()
                doc.add_paragraph()

        # 演讲者备注 (Speaker Notes)
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip():
            note = slide.notes_slide.notes_text_frame.text.strip()
            p_note = doc.add_paragraph()
            p_note.paragraph_format.left_indent = Pt(18)
            run_lbl = p_note.add_run("🎙️ 演讲者备注：")
            run_lbl.bold = True
            run_lbl.font.color.rgb = RGBColor(79, 70, 229)
            run_note = p_note.add_run(note)
            run_note.italic = True

    doc.save(str(output_path))
    return output_path


def convert_pptx_to_txt(source_path: Path) -> str:
    """提取 PPTX 各页文本与演讲者备注为纯文本"""
    import pptx  # type: ignore

    prs = pptx.Presentation(source_path)
    lines: list[str] = [f"=== {source_path.stem} (演示文稿文本提炼) ===\n"]

    for idx, slide in enumerate(prs.slides, 1):
        title = ""
        if slide.shapes.title and slide.shapes.title.text.strip():
            title = slide.shapes.title.text.strip()
        lines.append(f"--- 第 {idx} 页: {title or '幻灯片'} ---")

        for shape in slide.shapes:
            if shape == slide.shapes.title:
                continue
            if shape.has_text_frame:
                for p in shape.text_frame.paragraphs:
                    t = p.text.strip()
                    if t:
                        lines.append(f"• {t}")
            elif shape.has_table:
                for row in shape.table.rows:
                    row_t = " | ".join(c.text.strip() for c in row.cells if c.text.strip())
                    if row_t:
                        lines.append(f"| {row_t} |")

        if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip():
            note = slide.notes_slide.notes_text_frame.text.strip()
            lines.append(f"[演讲者备注] {note}")
        lines.append("")

    return "\n".join(lines)


def convert_pptx_to_markdown(source_path: Path) -> str:
    """提取 PPTX 各页文本与备注为结构化 Markdown"""
    import pptx  # type: ignore

    prs = pptx.Presentation(source_path)
    md: list[str] = [f"# {source_path.stem}\n"]

    for idx, slide in enumerate(prs.slides, 1):
        title = ""
        if slide.shapes.title and slide.shapes.title.text.strip():
            title = slide.shapes.title.text.strip()
        md.append(f"\n## 第 {idx} 页：{title or '幻灯片'}\n")

        for shape in slide.shapes:
            if shape == slide.shapes.title:
                continue
            if shape.has_text_frame:
                for p in shape.text_frame.paragraphs:
                    t = p.text.strip()
                    if t:
                        md.append(f"- {t}")
            elif shape.has_table:
                for row in shape.table.rows:
                    row_t = " | ".join(c.text.strip() for c in row.cells if c.text.strip())
                    if row_t:
                        md.append(f"| {row_t} |")

        if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip():
            note = slide.notes_slide.notes_text_frame.text.strip()
            md.append(f"\n> 🎙️ **演讲者备注**：{note}\n")

    return "\n".join(md)


# ── DOCX 转换 ─────────────────────────────────────────────────────────────────

def convert_docx_to_txt(source_path: Path) -> str:
    """提取 Word DOCX 文本并格式化为纯文本"""
    import docx  # type: ignore

    doc = docx.Document(source_path)
    lines: list[str] = [f"=== {source_path.stem} ===\n"]

    for p in doc.paragraphs:
        txt = p.text.strip()
        if txt:
            lines.append(txt)

    for table in doc.tables:
        for row in table.rows:
            row_txt = " | ".join(cell.text.strip() for cell in row.cells)
            if row_txt.strip():
                lines.append(row_txt)

    return "\n\n".join(lines)


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


# ── Markdown -> Word 转换 ─────────────────────────────────────────────────────

def convert_markdown_to_docx(md_text: str, output_path: Optional[Path] = None, title: str = "文档导出") -> Path:
    """将 Markdown 文本结构化解析并生成 Word (.docx) 文件"""
    import docx  # type: ignore

    if output_path is None:
        output_path = _get_output_dir() / f"{title}_{uuid.uuid4().hex[:6]}.docx"

    doc = docx.Document()
    for line in md_text.splitlines():
        line_s = line.strip()
        if not line_s:
            continue
        if line_s.startswith("# "):
            doc.add_heading(line_s[2:], level=1)
        elif line_s.startswith("## "):
            doc.add_heading(line_s[3:], level=2)
        elif line_s.startswith("### "):
            doc.add_heading(line_s[4:], level=3)
        elif line_s.startswith("#### "):
            doc.add_heading(line_s[5:], level=4)
        elif line_s.startswith("- ") or line_s.startswith("* "):
            doc.add_paragraph(line_s[2:], style="List Bullet")
        elif line_s.startswith("> "):
            p = doc.add_paragraph(line_s[2:])
            p.italic = True
        else:
            doc.add_paragraph(line)

    doc.save(str(output_path))
    return output_path


# ── 图片素材抽取 ──────────────────────────────────────────────────────────────

def extract_document_images(source_path: Path, output_dir: Optional[Path] = None) -> list[str]:
    """
    提取 PDF, DOCX 或 PPTX 中所有的内嵌图片，保存到指定目录，返回相对/绝对路径列表
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

    elif ext in [".docx", ".doc"]:
        import docx  # type: ignore
        doc = docx.Document(source_path)
        img_count = 0
        for rel in doc.part.rels.values():
            if "image" in rel.target_ref:
                img_part = rel.target_part
                img_bytes = img_part.blob
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

    elif ext in [".pptx", ".ppt"]:
        import pptx  # type: ignore
        prs = pptx.Presentation(source_path)
        img_count = 0
        for page_idx, slide in enumerate(prs.slides, 1):
            for rel in slide.part.rels.values():
                if "image" in rel.target_ref:
                    img_part = rel.target_part
                    img_bytes = img_part.blob
                    ext_name = "png"
                    if "jpeg" in img_part.content_type:
                        ext_name = "jpg"
                    elif "gif" in img_part.content_type:
                        ext_name = "gif"
                    img_count += 1
                    img_name = f"slide_{page_idx}_img_{img_count}.{ext_name}"
                    img_path = target_dir / img_name
                    img_path.write_bytes(img_bytes)
                    saved_images.append(str(img_path))

    return saved_images
