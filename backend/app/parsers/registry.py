"""
Parser Registry — selects the right parser for a given file.
"""
from pathlib import Path
from app.parsers.base import BaseParser, ParsedDocument
from app.parsers.pdf_parser import PDFParser
from app.parsers.docx_parser import DOCXParser
from app.parsers.txt_parser import TXTParser, MarkdownParser


_PARSERS: list[BaseParser] = [
    PDFParser(),
    DOCXParser(),
    MarkdownParser(),
    TXTParser(),
]

SUPPORTED_EXTENSIONS = {"pdf", "docx", "txt", "md", "markdown"}


def get_parser(path: Path) -> BaseParser | None:
    for parser in _PARSERS:
        if parser.can_parse(path):
            return parser
    return None


def parse_document(path: Path) -> ParsedDocument:
    parser = get_parser(path)
    if parser is None:
        ext = path.suffix.lower().lstrip(".")
        raise ValueError(f"Unsupported file format: .{ext}")
    return parser.parse(path)
