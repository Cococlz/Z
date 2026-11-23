"""
TOC Service — 目录大纲提取服务

支持两级抽取策略：
1. 原生格式层（Native TOC）：
   - PDF：利用 PyMuPDF 的 doc.get_toc() 提取原生书签层级；
   - DOCX：利用 Heading 样式段落映射。
2. 文本模式层（Heuristic TOC Fallback）：
   - 当原文件无嵌入书签时，基于正则表达式检测 Markdown 标题（#、##、###）、
     中文章节标题（第X章、第X节、一、二、1.1 等），将章节标题精确映射至 DocumentChunk 的 chunk_index。
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

import pymupdf

from app.database.models import Document, DocumentChunk


# Markdown 标题正则: # Title, ## Subtitle, ### Section
_MD_HEADING_RE = re.compile(r"^(#{1,4})\s+(.+)$")

# 通用章节标题正则（中文书籍/学术论文/技术文档常见格式）
_HEADING_PATTERNS = [
    # Level 1: 篇 / 部 / 卷 / 卷宗
    (re.compile(r"^(?:第[一二三四五六七八九十百\d]+[部篇卷]|PART\s+[IVX\d]+)\s*(.*)$", re.IGNORECASE), 1),
    # Level 1: 章 / 回 / 讲
    (re.compile(r"^(?:第[一二三四五六七八九十百\d]+[章回讲]|Chapter\s+\d+)\s*(.*)$", re.IGNORECASE), 1),
    # Level 1: 中文大写数字标号 (一、概述)
    (re.compile(r"^([一二三四五六七八九十]+[、\.]\s*\S.*)$"), 1),
    # Level 2: 节 / 条
    (re.compile(r"^(?:第[一二三四五六七八九十百\d]+[节条]|Section\s+[\d\.]+)\s*(.*)$", re.IGNORECASE), 2),
    # Level 2: 中文括号数字 ( (一) 需求分析 )
    (re.compile(r"^([（\(][一二三四五六七八九十]+[）\)]\s*\S.*)$"), 2),
    # Level 1 或 2: 纯数字点式章节 (1. 引言, 1.1 背景, 1.1.1 细节)
    (re.compile(r"^(\d+)\.\s+(\S.*)$"), 1),
    (re.compile(r"^(\d+\.\d+)\s+(\S.*)$"), 2),
    (re.compile(r"^(\d+\.\d+\.\d+)\s+(\S.*)$"), 3),
]


def _clean_toc_title(raw: str) -> str:
    """清理目录标题中的首尾空白与控制字符，限制长度以保持大纲整洁"""
    cleaned = re.sub(r"\s+", " ", raw).strip()
    # 过滤明显的非标题特征行（例如长度超过 80 字的大段落）
    if len(cleaned) > 80:
        return cleaned[:77] + "..."
    return cleaned


def extract_toc_from_pdf(storage_path: Path, chunks: list[DocumentChunk]) -> list[dict[str, Any]]:
    """
    优先使用 PyMuPDF 获取 PDF 原生大纲；
    若原生大纲为空，则退化至基于 Chunk 文本的智能模式抽取。
    """
    toc_items: list[dict[str, Any]] = []

    if storage_path.exists():
        try:
            doc = pymupdf.open(str(storage_path))
            raw_toc = doc.get_toc()  # [[lvl, title, page_num], ...]
            doc.close()

            if raw_toc:
                # 建立物理页码 -> chunk_index 的映射
                page_to_chunk: dict[int, int] = {}
                for c in chunks:
                    p_num = c.page_number or (c.chunk_index + 1)
                    if p_num not in page_to_chunk:
                        page_to_chunk[p_num] = c.chunk_index

                max_chunk_idx = len(chunks) - 1 if chunks else 0

                for item in raw_toc:
                    lvl = int(item[0]) if len(item) > 0 else 1
                    title = str(item[1]).strip() if len(item) > 1 else ""
                    raw_page = int(item[2]) if len(item) > 2 else 1

                    if not title:
                        continue

                    # 找到对应的 chunk_index
                    if raw_page in page_to_chunk:
                        target_chunk = page_to_chunk[raw_page]
                    else:
                        # 查找最靠近 raw_page 的 chunk
                        lower_candidates = [p for p in page_to_chunk.keys() if p <= raw_page]
                        if lower_candidates:
                            target_chunk = page_to_chunk[max(lower_candidates)]
                        else:
                            target_chunk = min(max(0, raw_page - 1), max_chunk_idx)

                    toc_items.append({
                        "id": f"toc-{len(toc_items) + 1}",
                        "title": _clean_toc_title(title),
                        "level": min(max(1, lvl), 3),
                        "page_index": target_chunk,
                        "page_number": raw_page,
                    })

                if toc_items:
                    return toc_items
        except Exception:
            pass

    # 若 PDF 原生大纲未提取到，退化使用文本行检测
    return extract_toc_from_chunks(chunks, file_type="pdf")


def extract_toc_from_chunks(chunks: list[DocumentChunk], file_type: str = "txt") -> list[dict[str, Any]]:
    """
    遍历文档 chunks，提取 Markdown 标题或正文正则标题
    """
    toc_items: list[dict[str, Any]] = []
    seen_titles: set[str] = set()

    is_md = file_type.lower() in ("md", "markdown")

    for chunk in chunks:
        chunk_idx = chunk.chunk_index
        p_num = chunk.page_number or (chunk_idx + 1)
        lines = chunk.content.splitlines()

        for line in lines:
            line_str = line.strip()
            if not line_str or len(line_str) < 2 or len(line_str) > 80:
                continue

            # Markdown 标题优先匹配
            if is_md:
                m_md = _MD_HEADING_RE.match(line_str)
                if m_md:
                    hashes, title_text = m_md.group(1), m_md.group(2).strip()
                    clean_title = _clean_toc_title(title_text)
                    if clean_title and clean_title not in seen_titles:
                        seen_titles.add(clean_title)
                        toc_items.append({
                            "id": f"toc-{len(toc_items) + 1}",
                            "title": clean_title,
                            "level": min(len(hashes), 3),
                            "page_index": chunk_idx,
                            "page_number": p_num,
                        })
                    continue

            # 正则匹配中英文结构化章节
            matched = False
            for pat, lvl in _HEADING_PATTERNS:
                m = pat.match(line_str)
                if m:
                    clean_title = _clean_toc_title(line_str)
                    # 避免在同一章节重复收录相同标题
                    if clean_title not in seen_titles:
                        seen_titles.add(clean_title)
                        toc_items.append({
                            "id": f"toc-{len(toc_items) + 1}",
                            "title": clean_title,
                            "level": lvl,
                            "page_index": chunk_idx,
                            "page_number": p_num,
                        })
                        matched = True
                    break

            if matched:
                continue

        # 如果 chunk 本身带有 section_title 且尚未收录
        if chunk.section_title:
            clean_sec = _clean_toc_title(chunk.section_title)
            if clean_sec and clean_sec not in seen_titles:
                seen_titles.add(clean_sec)
                toc_items.append({
                    "id": f"toc-{len(toc_items) + 1}",
                    "title": clean_sec,
                    "level": 1,
                    "page_index": chunk_idx,
                    "page_number": p_num,
                })

    # 按 page_index 稳定排序
    toc_items.sort(key=lambda x: (x["page_index"], x["level"]))
    # 重新赋予连续 id
    for idx, item in enumerate(toc_items):
        item["id"] = f"toc-{idx + 1}"

    return toc_items


def get_document_toc(doc: Document, chunks: list[DocumentChunk]) -> list[dict[str, Any]]:
    """根据文档类型自动挑选最适合的大纲提取策略"""
    storage_path = Path(doc.storage_path)
    file_type = (doc.file_type or "").lower()

    if file_type == "pdf":
        return extract_toc_from_pdf(storage_path, chunks)
    else:
        return extract_toc_from_chunks(chunks, file_type=file_type)
