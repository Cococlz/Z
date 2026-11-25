"""
PDF Parser — uses PyMuPDF (pymupdf) for high-fidelity text extraction.

Extracts text page-by-page, preserving physical page numbers.
Automatically detects and labels heading-like lines as section titles.
"""
from __future__ import annotations
import re
from pathlib import Path

import pymupdf  # pymupdf >= 1.24 exposes itself as `pymupdf`

from app.parsers.base import BaseParser, ParsedDocument, ParsedPage


_HEADING_RE = re.compile(
    r"^(?:第[一二三四五六七八九十百\d]+[章节部篇]|"
    r"Chapter\s+\d+|Section\s+[\d.]+|"
    r"\d+[\.\u3001]\s+\S|"       # 1. Title  or  1、Title
    r"[一二三四五六七八九十]+[、\.]\s*\S)",
    re.MULTILINE,
)


def _detect_section_title(text: str) -> str | None:
    """Return first heading-like line found in page text, or None."""
    for line in text.splitlines():
        line = line.strip()
        if line and _HEADING_RE.match(line) and len(line) < 120:
            return line
    return None


def _clean_text(raw: str) -> str:
    """Remove excessive blank lines while preserving paragraph structure."""
    lines = raw.splitlines()
    cleaned: list[str] = []
    blank_streak = 0
    for line in lines:
        stripped = line.rstrip()
        if stripped:
            blank_streak = 0
            cleaned.append(stripped)
        else:
            blank_streak += 1
            if blank_streak <= 2:
                cleaned.append("")
    return "\n".join(cleaned).strip()


class PDFParser(BaseParser):
    supported_extensions = ("pdf",)

    def parse(self, path: Path) -> ParsedDocument:
        pages: list[ParsedPage] = []
        total_chars = 0

        with pymupdf.open(str(path)) as doc:
            page_count = len(doc)
            for page_index in range(page_count):
                page = doc[page_index]
                raw_text = page.get_text("text")          # plain text, layout-aware
                clean = _clean_text(raw_text)
                if not clean:
                    continue

                section_title = _detect_section_title(clean)
                total_chars += len(clean)
                pages.append(ParsedPage(
                    page_number=page_index + 1,
                    section_title=section_title,
                    text=clean,
                ))

        return ParsedDocument(
            name=path.name,
            file_type="pdf",
            page_count=page_count,
            char_count=total_chars,
            pages=pages,
        )
