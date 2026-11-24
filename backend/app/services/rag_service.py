"""
RAG Service — FastEmbed 本地向量化 + ChromaDB 相似检索
"""
from __future__ import annotations

import logging
import re
from typing import Optional, List, Dict, Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.models import DocumentChunk
from app.database.session import SessionLocal

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 懒加载单例：ChromaDB client + collection / FastEmbed model
# ---------------------------------------------------------------------------
_chroma_client = None
_collection = None
_embed_model = None

COLLECTION_NAME = "zhiyue_knowledge_base"


def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        import os
        import sys
        from pathlib import Path
        from fastembed import TextEmbedding  # type: ignore

        # 优先读取预置模型路径，实现 100% 离线脱网运行
        bundled_cache = None
        if getattr(sys, "frozen", False):
            exe_dir = Path(sys.executable).resolve().parent
            candidates = [
                exe_dir / "bundled_models" / "fastembed_cache",
                exe_dir / "_internal" / "bundled_models" / "fastembed_cache",
                Path(getattr(sys, "_MEIPASS", exe_dir)) / "bundled_models" / "fastembed_cache",
            ]
            for c in candidates:
                if c.exists():
                    bundled_cache = c
                    break
        else:
            backend_dir = Path(__file__).resolve().parent.parent.parent
            cand = backend_dir / "bundled_models" / "fastembed_cache"
            if cand.exists():
                bundled_cache = cand

        cache_dir = str(bundled_cache) if bundled_cache and bundled_cache.exists() else None

        logger.info("Loading FastEmbed model: BAAI/bge-small-zh-v1.5 (cache_dir=%s)", cache_dir)
        _embed_model = TextEmbedding("BAAI/bge-small-zh-v1.5", cache_dir=cache_dir)
        logger.info("FastEmbed model loaded")
    return _embed_model


def _get_collection():
    global _chroma_client, _collection
    if _collection is None:
        import chromadb  # type: ignore
        settings.ensure_directories()
        _chroma_client = chromadb.PersistentClient(path=str(settings.VECTOR_DIR))
        _collection = _chroma_client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("ChromaDB collection ready: %s", COLLECTION_NAME)
    return _collection


# ---------------------------------------------------------------------------
# 公共 API
# ---------------------------------------------------------------------------

def embed_texts(texts: list[str]) -> list[list[float]]:
    """批量嵌入文本，返回向量列表"""
    model = _get_embed_model()
    embeddings = list(model.embed(texts))
    return [e.tolist() for e in embeddings]


def index_document(doc_id: str) -> int:
    """
    将 SQLite 中该文档的所有 chunk 嵌入并写入 ChromaDB。
    已存在的向量跳过（幂等）。doc_id 为 UUID 字符串。
    返回写入的 chunk 数。
    """
    collection = _get_collection()

    # 检查是否已索引（通过 doc_id 过滤）
    existing = collection.get(where={"doc_id": doc_id}, limit=1)
    if existing["ids"]:
        logger.info("Document %s already indexed, skipping", doc_id)
        return 0

    db: Session = SessionLocal()
    try:
        chunks: list[DocumentChunk] = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.document_id == doc_id)
            .order_by(DocumentChunk.chunk_index)
            .all()
        )
        if not chunks:
            logger.warning("No chunks found for doc_id=%s", doc_id)
            return 0

        texts = [c.content for c in chunks]
        embeddings = embed_texts(texts)

        ids = [f"{doc_id}_chunk{c.chunk_index}" for c in chunks]
        metadatas = [
            {
                "doc_id": doc_id,
                "chunk_index": c.chunk_index,
                "page_number": c.page_number or 0,
                "section_title": c.section_title or "",
            }
            for c in chunks
        ]

        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
        )
        logger.info("Indexed %d chunks for doc_id=%s", len(chunks), doc_id)
        return len(chunks)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 混合检索：ChromaDB 语义向量 + SQLite 稀疏关键词精确匹配 + RRF 融合
# ---------------------------------------------------------------------------

STOP_WORDS = {
    "的", "了", "和", "是", "就", "都", "而", "及", "与", "着", "或", "一个", "没有", "我们", "你们", "他们",
    "什么", "怎么", "如何", "为什么", "请问", "解释", "一下", "帮我", "简述", "总结", "详细", "介绍",
    "分析", "这个", "那个", "这是", "那是", "这里", "那里", "文档", "内容", "问题", "回答", "区别", "含义", "作用"
}


def _extract_keywords(query: str) -> list[str]:
    """提取查询中的高权重关键词、英文标识符、代码函数名及中文核心词"""
    tokens = []
    # 1. 提取代码标识符、英文单词、数字混合词 (如 fruits.pop(10), len, Q3-2024, v1.0.0)
    code_tokens = re.findall(r'[a-zA-Z0-9_\.\-\(\)\:]{2,}', query)
    tokens.extend(code_tokens)

    # 2. 过滤停用词后提取纯净中文词组 (2个字以上)
    cleaned_query = query
    for sw in sorted(STOP_WORDS, key=len, reverse=True):
        cleaned_query = cleaned_query.replace(sw, " ")

    cn_tokens = re.findall(r'[\u4e00-\u9fa5]{2,}', cleaned_query)
    for t in cn_tokens:
        t_clean = t.strip()
        if len(t_clean) >= 2:
            tokens.append(t_clean)

    # 去重保留原有出现顺序
    seen = set()
    unique_tokens = []
    for t in tokens:
        tl = t.strip()
        if tl and tl.lower() not in seen:
            seen.add(tl.lower())
            unique_tokens.append(tl)
    return unique_tokens


def _search_keyword_chunks(
    query: str,
    doc_id: Optional[str] = None,
    limit: int = 15,
) -> list[dict]:
    """
    基于 SQLite 的稀疏关键词精确检索：
    精准命中代码标识符、函数名、具体数值、专有名词与章节标题。
    """
    keywords = _extract_keywords(query)
    raw_query = query.strip()
    if not keywords and raw_query:
        keywords = [raw_query]

    if not keywords:
        return []

    db: Session = SessionLocal()
    try:
        q = db.query(DocumentChunk)
        if doc_id:
            q = q.filter(DocumentChunk.document_id == doc_id)

        # 构建模糊匹配条件，至少命中一个关键词
        conditions = []
        for kw in keywords[:8]:  # 最多取前 8 个特征词
            conditions.append(DocumentChunk.content.ilike(f"%{kw}%"))
            conditions.append(DocumentChunk.section_title.ilike(f"%{kw}%"))

        chunks = q.filter(or_(*conditions)).all()
        if not chunks:
            return []

        scored_chunks = []
        for c in chunks:
            c_text = c.content or ""
            sec_title = c.section_title or ""
            score = 0.0

            # 1. 完整查询词直击命中高额奖励
            if raw_query.lower() in c_text.lower():
                score += 15.0
            if raw_query.lower() in sec_title.lower():
                score += 8.0

            # 2. 单个关键词命中计数与加权
            for kw in keywords:
                kw_lower = kw.lower()
                is_code = re.match(r'^[a-zA-Z0-9_\.]+$', kw) is not None
                weight = 3.5 if is_code else 1.5

                cnt = c_text.lower().count(kw_lower)
                if cnt > 0:
                    score += min(cnt, 5) * weight
                if kw_lower in sec_title.lower():
                    score += weight * 2.0

            if score > 0:
                scored_chunks.append((score, c))

        scored_chunks.sort(key=lambda x: x[0], reverse=True)

        results = []
        for score, c in scored_chunks[:limit]:
            results.append({
                "doc_id": c.document_id,
                "chunk_index": c.chunk_index,
                "page_number": c.page_number or 0,
                "section_title": c.section_title or "",
                "text": c.content,
                "sparse_score": score,
            })
        return results
    finally:
        db.close()


def search_vector(
    query: str,
    doc_id: Optional[str] = None,
    top_k: int = 5,
) -> list[dict]:
    """ChromaDB 稠密向量相似度检索"""
    collection = _get_collection()

    query_embedding = embed_texts([query])[0]

    where = {"doc_id": doc_id} if doc_id is not None else None

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    hits = []
    if not results["ids"] or not results["ids"][0]:
        return hits

    for i, (doc_text, meta, dist) in enumerate(
        zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        )
    ):
        hits.append(
            {
                "text": doc_text,
                "doc_id": meta.get("doc_id"),
                "chunk_index": meta.get("chunk_index"),
                "page_number": meta.get("page_number"),
                "section_title": meta.get("section_title"),
                "score": round(1 - dist, 4),  # cosine distance → similarity
            }
        )
    return hits


def search_hybrid(
    query: str,
    doc_id: Optional[str] = None,
    top_k: int = 5,
    rrf_k: int = 60,
) -> list[dict]:
    """
    RAG 混合检索：
    融合 ChromaDB 密集语义向量检索 + SQLite 稀疏关键词精确检索。
    使用 Reciprocal Rank Fusion (RRF) 算法合并两路结果：
    RRF(d) = 1 / (k + rank_dense) + 1 / (k + rank_sparse)
    解决稠密向量检索在特定代码变量、函数名、数值及冷门专有名词上的检索盲区。
    """
    candidate_k = max(top_k * 3, 15)
    dense_hits = []
    try:
        dense_hits = search_vector(query, doc_id=doc_id, top_k=candidate_k)
    except Exception as e:
        logger.warning("Vector search failed in hybrid search: %s", e)

    sparse_hits = []
    try:
        sparse_hits = _search_keyword_chunks(query, doc_id=doc_id, limit=candidate_k)
    except Exception as e:
        logger.warning("Keyword search failed in hybrid search: %s", e)

    if not dense_hits and not sparse_hits:
        return []

    # RRF 倒数排名融合
    rrf_scores: dict[str, float] = {}
    chunk_meta: dict[str, dict] = {}

    for rank, item in enumerate(dense_hits, start=1):
        key = f"{item['doc_id']}_{item['chunk_index']}"
        rrf_scores[key] = rrf_scores.get(key, 0.0) + (1.0 / (rrf_k + rank))
        chunk_meta[key] = item

    for rank, item in enumerate(sparse_hits, start=1):
        key = f"{item['doc_id']}_{item['chunk_index']}"
        rrf_scores[key] = rrf_scores.get(key, 0.0) + (1.0 / (rrf_k + rank))
        if key not in chunk_meta:
            chunk_meta[key] = item

    sorted_keys = sorted(rrf_scores.keys(), key=lambda k: rrf_scores[k], reverse=True)

    results = []
    max_rrf = (1.0 / (rrf_k + 1)) * 2
    for k in sorted_keys[:top_k]:
        item = chunk_meta[k].copy()
        raw_score = rrf_scores[k]
        norm_score = round(min(1.0, raw_score / max_rrf * 1.2), 4)
        item["score"] = norm_score
        results.append(item)

    return results


def search(
    query: str,
    doc_id: Optional[str] = None,
    top_k: int = 5,
) -> list[dict]:
    """统一检索接口：默认采用混合检索以保证高召回率与高准确度"""
    return search_hybrid(query, doc_id=doc_id, top_k=top_k)


def delete_document_vectors(doc_id: str) -> None:
    """删除该文档在 ChromaDB 中的所有向量"""
    collection = _get_collection()
    existing = collection.get(where={"doc_id": doc_id})
    if existing["ids"]:
        collection.delete(ids=existing["ids"])
        logger.info("Deleted %d vectors for doc_id=%s", len(existing["ids"]), doc_id)
