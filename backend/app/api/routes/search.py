"""
Search API — 全局聚焦搜索（混合检索：向量语义检索 + 关键词精准匹配 + 文档标题匹配）
"""
from __future__ import annotations

import logging
import re
from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import Document, DocumentChunk
from app.services import rag_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/search", tags=["search"])


class SearchResultItem(BaseModel):
    id: str
    doc_id: str
    doc_name: str
    file_type: str
    chunk_index: int
    page_number: int
    section_title: str
    snippet: str
    score: float
    match_type: str  # semantic | keyword | document_title


class SearchResponse(BaseModel):
    query: str
    total: int
    results: list[SearchResultItem]


def _extract_snippet(content: str, query: str, max_chars: int = 160) -> str:
    """提取包含关键词上下文的精炼摘要片段"""
    if not content:
        return ""
    
    clean_content = " ".join(content.split())
    if not query:
        return clean_content[:max_chars] + ("..." if len(clean_content) > max_chars else "")

    match = re.search(re.escape(query), clean_content, re.IGNORECASE)
    if not match:
        return clean_content[:max_chars] + ("..." if len(clean_content) > max_chars else "")

    start_idx = match.start()
    half = max_chars // 2
    left = max(0, start_idx - half)
    right = min(len(clean_content), start_idx + len(query) + half)

    prefix = "..." if left > 0 else ""
    suffix = "..." if right < len(clean_content) else ""
    return prefix + clean_content[left:right] + suffix


@router.get("", response_model=SearchResponse)
def global_search(
    q: str = Query(..., min_length=1, description="搜索关键词或自然语言问题"),
    limit: int = Query(10, ge=1, le=30),
    db: Session = Depends(get_db),
):
    query = q.strip()
    if not query:
        return SearchResponse(query=query, total=0, results=[])

    seen_keys: set[tuple[str, int]] = set()
    results: list[SearchResultItem] = []

    # 1. 标题直接匹配的文档 (Document Title Match)
    title_matching_docs = (
        db.query(Document)
        .filter(Document.status == "indexed", Document.name.ilike(f"%{query}%"))
        .limit(3)
        .all()
    )
    for doc in title_matching_docs:
        first_chunk = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.document_id == doc.id)
            .order_by(DocumentChunk.chunk_index)
            .first()
        )
        if first_chunk:
            key = (doc.id, first_chunk.chunk_index)
            seen_keys.add(key)
            results.append(
                SearchResultItem(
                    id=f"{doc.id}_{first_chunk.chunk_index}",
                    doc_id=doc.id,
                    doc_name=doc.name,
                    file_type=doc.file_type,
                    chunk_index=first_chunk.chunk_index,
                    page_number=first_chunk.page_number or 1,
                    section_title=first_chunk.section_title or "文档开头",
                    snippet=_extract_snippet(first_chunk.content, query),
                    score=1.0,
                    match_type="document_title",
                )
            )

    # 2. 向量语义检索 (Semantic Vector Search)
    try:
        semantic_hits = rag_service.search(query=query, top_k=limit)
        # 获取涉及到的文档信息以加速组装
        doc_ids = {h["doc_id"] for h in semantic_hits if h.get("doc_id")}
        docs_map = {
            d.id: d for d in db.query(Document).filter(Document.id.in_(doc_ids)).all()
        } if doc_ids else {}

        for hit in semantic_hits:
            doc_id = hit.get("doc_id")
            chunk_idx = hit.get("chunk_index", 0)
            if not doc_id or (doc_id, chunk_idx) in seen_keys:
                continue

            doc = docs_map.get(doc_id)
            if not doc:
                continue

            seen_keys.add((doc_id, chunk_idx))
            results.append(
                SearchResultItem(
                    id=f"{doc_id}_{chunk_idx}",
                    doc_id=doc_id,
                    doc_name=doc.name,
                    file_type=doc.file_type,
                    chunk_index=chunk_idx,
                    page_number=hit.get("page_number") or 1,
                    section_title=hit.get("section_title") or f"第 {hit.get('page_number') or 1} 页",
                    snippet=_extract_snippet(hit.get("text", ""), query),
                    score=hit.get("score", 0.8),
                    match_type="semantic",
                )
            )
    except Exception as e:
        logger.warning("向量语义搜索失败，降级为文本关键词检索: %s", e)

    # 3. 关键词精准文本检索 (Exact Keyword Search on Chunks)
    if len(results) < limit:
        remaining = limit - len(results)
        keyword_chunks = (
            db.query(DocumentChunk, Document)
            .join(Document, DocumentChunk.document_id == Document.id)
            .filter(Document.status == "indexed", DocumentChunk.content.ilike(f"%{query}%"))
            .limit(remaining * 2)
            .all()
        )
        for chunk, doc in keyword_chunks:
            key = (doc.id, chunk.chunk_index)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            results.append(
                SearchResultItem(
                    id=f"{doc.id}_{chunk.chunk_index}",
                    doc_id=doc.id,
                    doc_name=doc.name,
                    file_type=doc.file_type,
                    chunk_index=chunk.chunk_index,
                    page_number=chunk.page_number or 1,
                    section_title=chunk.section_title or f"第 {chunk.page_number or 1} 页",
                    snippet=_extract_snippet(chunk.content, query),
                    score=0.85,
                    match_type="keyword",
                )
            )
            if len(results) >= limit:
                break

    # 最终按相关度得分从高到低排序
    results.sort(key=lambda x: x.score, reverse=True)

    return SearchResponse(
        query=query,
        total=len(results),
        results=results[:limit],
    )
