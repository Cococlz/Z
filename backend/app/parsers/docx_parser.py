"""
DOCX Parser — uses python-docx to extract paragraph text with heading detection.
"""
from __future__ import annotations
import re
from pathlib import Path

from docx import Document as DocxDocument
from docx.oxml.ns import qn

from app.parsers.base import BaseParser, ParsedDocument, ParsedPage


_SECTION_STYLES = {
    "heading 1", "heading 2", "heading 3",
    "标题 1", "标题 2", "标题 3",
    "Heading1", "Heading2", "Heading3",
}


def _is_heading(para) -> bool:
    return para.style and para.style.name.lower() in {s.lower() for s in _SECTION_STYLES}


class DOCXParser(BaseParser):
    supported_extensions = ("docx",)

    def parse(self, path: Path) -> ParsedDocument:
        docx = DocxDocument(str(path))

        # Group paragraphs into logical "pages" of ~1500 chars each
        # (DOCX has no concept of physical pages without rendering)
        CHUNK_SIZE = 1500

        pages: list[ParsedPage] = []
        current_lines: list[str] = []
        current_chars = 0
        current_title: str | None = None
        page_num = 1
        total_chars = 0

        def flush():
            nonlocal page_num, current_lines, current_chars, current_title
            text = "\n".join(current_lines).strip()
            if text:
                pages.append(ParsedPage(
                    page_number=page_num,
                    section_title=current_title,
                    text=text,
                ))
                page_num += 1
            current_lines = []
            current_chars = 0
            current_title = None

        for para in docx.paragraphs:
            text = para.text.strip()
            if not text:
                continue

            if _is_heading(para):
                # Flush current page before starting a new section
                if current_lines:
                    flush()
                current_title = text

            current_lines.append(text)
            current_chars += len(text)
            total_chars += len(text)

            if current_chars >= CHUNK_SIZE:
                flush()

        flush()  # Flush remainder

        return ParsedDocument(
            name=path.name,
            file_type="docx",
            page_count=len(pages),    # logical sections, not physical pages
            char_count=total_chars,
            pages=pages,
        )
