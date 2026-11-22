"""
Base parser interface — all format parsers must conform to this.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class ParsedPage:
    """Represents a single logical page or section of a document."""
    page_number: int          # 1-based
    section_title: Optional[str]
    text: str                 # cleaned plain text


@dataclass
class ParsedDocument:
    """Unified output of any parser."""
    name: str
    file_type: str
    page_count: int
    char_count: int
    pages: list[ParsedPage] = field(default_factory=list)

    @property
    def full_text(self) -> str:
        return "\n\n".join(p.text for p in self.pages if p.text.strip())


class BaseParser:
    """Abstract base class for all document parsers."""

    supported_extensions: tuple[str, ...] = ()

    def can_parse(self, path: Path) -> bool:
        return path.suffix.lower().lstrip(".") in self.supported_extensions

    def parse(self, path: Path) -> ParsedDocument:
        raise NotImplementedError
