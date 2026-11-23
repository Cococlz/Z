"""
TOC Service — 精准去噪与结构化目录大纲提取服务

设计理念与去噪原则：
1. 严禁将正文列表句误认为章节：
   - 标题绝不应以句号（。）、分号（；）、逗号（，）、冒号（：）等句子终结符结尾；
   - 过滤代码块（print、def、=、class、import 等代码特征）；
   - 过滤纯数字占位（如单独的 1.、#2 等无实质内容的行）。
2. 层级严谨区分：
   - Level 1（主章节）：篇/部/卷/章/回、大写中文数字（一、）、Markdown #、核心模块/任务大纲；
   - Level 2（分节）：节/条、多位点式（1.1、2.1）、括号小节（(一)）、Markdown ##；
   - Level 3（子项）：三位点式（1.1.1）、Markdown ###。
3. 原生与启发式协同：
   - PDF：优先利用 PyMuPDF 原生书签，若无书签则退化至精炼文本行检测；
   - TXT / MD / DOCX：基于清洗后的结构化标题模式进行高精度匹配。
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pymupdf

from app.database.models import Document, DocumentChunk


# 标点结尾过滤（标题绝不以句末标点符号结尾）
_TERMINAL_PUNCTUATION = (
    "。", "；", "，", "：", ":", ";", ",", "!", "?", "！", "？", "…", "”", '"', "、"
)

# 编程语言代码特征行过滤
_CODE_INDICATORS = (
    "print(", "=", "import ", "def ", "class ", "return ", "{", "}", "()", '"""', "'''", "//", "/*"
)


def _clean_toc_title(raw: str) -> str:
    """清理标题首尾空格、Markdown 符号，限制合理长度，确保包含实质文字"""
    s = raw.strip()
    # 剥离首尾的 Markdown 标记符号 (如 #, *, _, `)
    s = re.sub(r"^[#\*\_\`\s]+", "", s)
    s = re.sub(r"[#\*\_\`\s]+$", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    # 标题必须包含至少两个有效汉字或英文字母（过滤纯数字标点如 '1.' 或 '#2'）
    if not re.search(r"[\u4e00-\u9fa5a-zA-Z]{2,}", s):
        return ""
    if len(s) > 42:
        return s[:40] + "..."
    return s


def extract_toc_from_pdf(storage_path: Path, chunks: list[DocumentChunk]) -> list[dict[str, Any]]:
    """
    优先使用 PyMuPDF 获取 PDF 原生大纲；
    若原生大纲为空，则退化至基于正文清洗后的模式抽取。
    """
    toc_items: list[dict[str, Any]] = []

    if storage_path.exists():
        try:
            doc = pymupdf.open(str(storage_path))
            raw_toc = doc.get_toc()  # [[lvl, title, page_num], ...]
            doc.close()

            if raw_toc:
                # 建立物理页码 -> chunk_index 映射
                page_to_chunk: dict[int, int] = {}
                for c in chunks:
                    p_num = c.page_number or (c.chunk_index + 1)
                    if p_num not in page_to_chunk:
                        page_to_chunk[p_num] = c.chunk_index

                max_chunk_idx = len(chunks) - 1 if chunks else 0

                for item in raw_toc:
                    lvl = int(item[0]) if len(item) > 0 else 1
                    raw_title = str(item[1]).strip() if len(item) > 1 else ""
                    raw_page = int(item[2]) if len(item) > 2 else 1

                    title = _clean_toc_title(raw_title)
                    if not title or len(title) < 2 or title.endswith(_TERMINAL_PUNCTUATION):
                        continue

                    # 找到对应的 chunk_index
                    if raw_page in page_to_chunk:
                        target_chunk = page_to_chunk[raw_page]
                    else:
                        lower_candidates = [p for p in page_to_chunk.keys() if p <= raw_page]
                        if lower_candidates:
                            target_chunk = page_to_chunk[max(lower_candidates)]
                        else:
                            target_chunk = min(max(0, raw_page - 1), max_chunk_idx)

                    toc_items.append({
                        "id": f"toc-{len(toc_items) + 1}",
                        "title": title,
                        "level": min(max(1, lvl), 3),
                        "page_index": target_chunk,
                        "page_number": raw_page,
                    })

                if toc_items:
                    return toc_items
        except Exception:
            pass

    return extract_toc_from_chunks(chunks, file_type="pdf")


def extract_toc_from_chunks(chunks: list[DocumentChunk], file_type: str = "txt") -> list[dict[str, Any]]:
    """
    遍历文档切片，以极低噪音提取高信噪比章节大纲
    """
    toc_items: list[dict[str, Any]] = []
    seen_titles: set[str] = set()

    is_md = file_type.lower() in ("md", "markdown")

    # 预判文档是否以中文大写章节或明确大纲格式书写
    has_cn_headers = any(
        re.search(r"^(?:[一二三四五六七八九十百]+[、]|第[一二三四五六七八九十百\d]+[章节回篇卷部])", line.strip())
        for c in chunks for line in c.content.splitlines()[:60]
    )

    for chunk in chunks:
        chunk_idx = chunk.chunk_index
        p_num = chunk.page_number or (chunk_idx + 1)
        lines = chunk.content.splitlines()

        for line in lines:
            s = line.strip()
            # 基础长度与有效性过滤
            if not s or len(s) < 2 or len(s) > 45:
                continue

            # 过滤代码特征
            if any(ci in s for ci in _CODE_INDICATORS):
                continue

            # 过滤以标点结尾的非标题行（正文句或列表段落）
            if s.endswith(_TERMINAL_PUNCTUATION):
                continue

            # 过滤纯数字占位行（如 "#1." 或 "2." 无实质标题文字）
            if re.match(r"^#*\s*\d+[\.、]?\s*$", s):
                continue

            # 1. Markdown 标题语法 (# Title, ## Subtitle, ### Section)
            m_md = re.match(r"^(#{1,3})\s+(.+)$", s)
            if m_md:
                lvl = len(m_md.group(1))
                clean_title = _clean_toc_title(m_md.group(2))
                if len(clean_title) >= 2 and clean_title not in seen_titles and not clean_title.endswith(_TERMINAL_PUNCTUATION):
                    seen_titles.add(clean_title)
                    toc_items.append({
                        "id": f"toc-{len(toc_items) + 1}",
                        "title": clean_title,
                        "level": lvl,
                        "page_index": chunk_idx,
                        "page_number": p_num,
                    })
                continue

            # 2. Level 1: 篇 / 部 / 卷 / 章 / 回 / 讲 / Chapter / PART
            m_cp = re.match(r"^(?:第[一二三四五六七八九十百\d]+[部篇卷章回讲]|Chapter\s+\d+|PART\s+[IVX\d]+)\s*(.*)$", s, re.IGNORECASE)
            if m_cp:
                clean_title = _clean_toc_title(s)
                if clean_title not in seen_titles:
                    seen_titles.add(clean_title)
                    toc_items.append({
                        "id": f"toc-{len(toc_items) + 1}",
                        "title": clean_title,
                        "level": 1,
                        "page_index": chunk_idx,
                        "page_number": p_num,
                    })
                continue

            # 3. Level 1: 中文大写数字章节 (一、项目概述)
            m_cn = re.match(r"^([一二三四五六七八九十百]+[、]\s*\S+.*)$", s)
            if m_cn:
                clean_title = _clean_toc_title(s)
                if clean_title not in seen_titles:
                    seen_titles.add(clean_title)
                    toc_items.append({
                        "id": f"toc-{len(toc_items) + 1}",
                        "title": clean_title,
                        "level": 1,
                        "page_index": chunk_idx,
                        "page_number": p_num,
                    })
                continue

            # 4. Level 1: 中文实训 / 任务 / 实验 / 模块大纲 (任务一：xxx)
            m_task = re.match(r"^(?:#*\s*)(任务[一二三四五六七八九十\d]+|实验[一二三四五六七八九十\d]+|模块[一二三四五六七八九十\d]+)\s*[:：]?\s*(.+)$", s)
            if m_task:
                clean_title = _clean_toc_title(f"{m_task.group(1)} {m_task.group(2)}")
                if clean_title not in seen_titles:
                    seen_titles.add(clean_title)
                    toc_items.append({
                        "id": f"toc-{len(toc_items) + 1}",
                        "title": clean_title,
                        "level": 1,
                        "page_index": chunk_idx,
                        "page_number": p_num,
                    })
                continue

            # 5. Level 3: 三级数字点式章节 (1.1.1 细节)
            m_d3 = re.match(r"^(\d+\.\d+\.\d+)\s+(\S+.*)$", s)
            if m_d3:
                clean_title = _clean_toc_title(s)
                if clean_title not in seen_titles:
                    seen_titles.add(clean_title)
                    toc_items.append({
                        "id": f"toc-{len(toc_items) + 1}",
                        "title": clean_title,
                        "level": 3,
                        "page_index": chunk_idx,
                        "page_number": p_num,
                    })
                continue

            # 6. Level 2: 二级数字点式章节 (1.1 背景, 2.1 架构)
            m_d2 = re.match(r"^(\d+\.\d+)\s+(\S+.*)$", s)
            if m_d2:
                clean_title = _clean_toc_title(s)
                if clean_title not in seen_titles:
                    seen_titles.add(clean_title)
                    toc_items.append({
                        "id": f"toc-{len(toc_items) + 1}",
                        "title": clean_title,
                        "level": 2,
                        "page_index": chunk_idx,
                        "page_number": p_num,
                    })
                continue

            # 7. Level 2: 节 / 条 / 中文括号小节 ( (一) 需求分析 )
            m_sec = re.match(r"^(?:第[一二三四五六七八九十百\d]+[节条]|Section\s+[\d\.]+)\s*(.*)$", s, re.IGNORECASE)
            if m_sec:
                clean_title = _clean_toc_title(s)
                if clean_title not in seen_titles:
                    seen_titles.add(clean_title)
                    toc_items.append({
                        "id": f"toc-{len(toc_items) + 1}",
                        "title": clean_title,
                        "level": 2,
                        "page_index": chunk_idx,
                        "page_number": p_num,
                    })
                continue

            m_cn_par = re.match(r"^([（\(][一二三四五六七八九十]+[）\)]\s*\S+.*)$", s)
            if m_cn_par:
                clean_title = _clean_toc_title(s)
                if clean_title not in seen_titles:
                    seen_titles.add(clean_title)
                    toc_items.append({
                        "id": f"toc-{len(toc_items) + 1}",
                        "title": clean_title,
                        "level": 2,
                        "page_index": chunk_idx,
                        "page_number": p_num,
                    })
                continue

            # 8. 仅当文档没有中文大纲且非 Markdown 时，谨慎采纳单数字点式标题 (1. 引言)
            if not has_cn_headers and not is_md:
                m_single = re.match(r"^(\d+)[\.、]\s+([^\s。，；：]{2,25})$", s)
                if m_single:
                    clean_title = _clean_toc_title(s)
                    if clean_title not in seen_titles:
                        seen_titles.add(clean_title)
                        toc_items.append({
                            "id": f"toc-{len(toc_items) + 1}",
                            "title": clean_title,
                            "level": 1,
                            "page_index": chunk_idx,
                            "page_number": p_num,
                        })

    # 按 page_index 与出现顺序稳定排序
    toc_items.sort(key=lambda x: x["page_index"])
    # 连续重置 id
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
