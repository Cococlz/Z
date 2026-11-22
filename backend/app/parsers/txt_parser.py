"""
TXT / Markdown Parser — splits into logical pages by blank-line sections.
"""
from __future__ import annotations
import re
from pathlib import Path

from app.parsers.base import BaseParser, ParsedDocument, ParsedPage


_MD_HEADING_RE = re.compile(r"^(#{1,4})\s+(.+)", re.MULTILINE)
_ENCODINGS = ("utf-8", "utf-8-sig", "gb18030", "gbk", "latin-1")

CHUNK_SIZE = 3000   # 每个逻辑分页的目标字符数（避免页面过碎）


def _read_text(path: Path) -> str:
    for enc in _ENCODINGS:
        try:
            return path.read_text(encoding=enc)
        except (UnicodeDecodeError, ValueError):
            continue
    return path.read_bytes().decode("utf-8", errors="replace")


def _split_into_pages(text: str, file_type: str) -> list[ParsedPage]:
    """Split text into logical pages of ~CHUNK_SIZE characters."""
    pages: list[ParsedPage] = []
    page_num = 1
    current: list[str] = []
    current_chars = 0
    current_title: str | None = None

    def flush():
        nonlocal page_num, current, current_chars, current_title
        content = "\n".join(current).strip()
        if content:
            pages.append(ParsedPage(
                page_number=page_num,
                section_title=current_title,
                text=content,
            ))
            page_num += 1
        current = []
        current_chars = 0
        current_title = None

    for line in text.splitlines():
        # Detect Markdown headings for section titles
        if file_type == "md":
            m = _MD_HEADING_RE.match(line)
            # 仅当已累积足够内容 (>= 2200 字) 遇到新章节时才分页，防止短文被截成只有几句话的碎页
            if m and len(m.group(1)) <= 2:
                if current and current_chars >= 2200:
                    flush()
                if not current_title:
                    current_title = m.group(2).strip()

        current.append(line)
        current_chars += len(line)

        if current_chars >= CHUNK_SIZE:
            flush()

    flush()
    return pages


class TXTParser(BaseParser):
    supported_extensions = ("txt",)

    def parse(self, path: Path) -> ParsedDocument:
        text = _read_text(path)
        pages = _split_into_pages(text, "txt")
        return ParsedDocument(
            name=path.name,
            file_type="txt",
            page_count=len(pages),
            char_count=len(text),
            pages=pages,
        )


class MarkdownParser(BaseParser):
    supported_extensions = ("md", "markdown")

    def parse(self, path: Path) -> ParsedDocument:
        text = _read_text(path)
        pages = _split_into_pages(text, "md")
        return ParsedDocument(
            name=path.name,
            file_type="md",
            page_count=len(pages),
            char_count=len(text),
            pages=pages,
        )
