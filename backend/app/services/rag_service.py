"""
RAG Service — FastEmbed 本地向量化 + ChromaDB 相似检索
"""
from __future__ import annotations

import logging
from typing import Optional

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
        from fastembed import TextEmbedding  # type: ignore
        logger.info("Loading FastEmbed model: BAAI/bge-small-zh-v1.5")
        _embed_model = TextEmbedding("BAAI/bge-small-zh-v1.5")
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


def search(
    query: str,
    doc_id: Optional[int] = None,
    top_k: int = 5,
) -> list[dict]:
    """
    查询最相似的 chunk，返回列表，每项含:
      text, doc_id, chunk_index, page_number, section_title, score
    """
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


def delete_document_vectors(doc_id: str) -> None:
    """删除该文档在 ChromaDB 中的所有向量"""
    collection = _get_collection()
    existing = collection.get(where={"doc_id": doc_id})
    if existing["ids"]:
        collection.delete(ids=existing["ids"])
        logger.info("Deleted %d vectors for doc_id=%s", len(existing["ids"]), doc_id)
