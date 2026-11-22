"""
Summary Service — 长文档智能速读，支持单轮生成与 Map-Reduce 分治汇总，提供 3 种精读模式
"""
from __future__ import annotations

import json
import logging
from typing import AsyncIterator, Optional
from sqlalchemy.orm import Session

from app.database.models import Document, DocumentChunk, Summary
from app.services.llm_service import get_provider

logger = logging.getLogger(__name__)

# 单轮直接处理的最大字符阈值（超过则启用 Map-Reduce 分治策略）
MAP_REDUCE_THRESHOLD_CHARS = 15000

PROMPTS = {
    "overall": """你是一位资深的文献与行业分析专家。请根据提供的文档内容，撰写一份结构严谨、见解深刻的「全局综合摘要」。
要求：
1. 核心主题：用 1-2 句话阐述文档的核心议题与背景。
2. 关键发现与主旨：分点列出 3-5 个最重要的核心发现或观点。
3. 结论与价值：简要说明文档的实践意义或主要结论。
4. 使用中文，保持客观专业，采用 Markdown 格式排版。""",

    "outline": """你是一位擅长结构化思维的知识整理专家。请根据提供的文档内容，梳理出一份清晰完备的「思维导图式层级结构大纲」。
要求：
1. 使用 Markdown 多级标题与无序列表（如 # 核心主题, ## 一级章节, - 核心小节要点）。
2. 保留文档原有的逻辑递进关系与论述框架。
3. 结构清晰，重点突出，适合作为阅读导引。""",

    "keypoints": """你是一位敏锐的研究员。请根据提供的文档内容，提炼出「核心论点与关键知识点」。
要求：
1. 提取文档中最具实质性价值的观点、量化数据、重要定义或关键决策依据。
2. 每个要点使用【要点标题】+ 简明论述的形式。
3. 严格基于文档原文信息，杜绝推测与虚构。
4. 使用中文，Markdown 格式。""",
}


async def generate_summary_stream(
    doc_id: str,
    summary_type: str,
    db: Session,
    force_refresh: bool = False,
) -> AsyncIterator[str]:
    """
    流式生成或从缓存读取摘要。
    summary_type: "overall" | "outline" | "keypoints"
    yields: SSE data 字符串 token
    """
    if summary_type not in PROMPTS:
        raise ValueError(f"不支持的摘要类型：{summary_type}")

    # 1. 检查 SQLite 缓存（除非强制重新生成）
    if not force_refresh:
        cached = (
            db.query(Summary)
            .filter(Summary.document_id == doc_id, Summary.summary_type == summary_type)
            .order_by(Summary.created_at.desc())
            .first()
        )
        if cached and cached.content:
            logger.info("Found cached summary for doc=%s, type=%s", doc_id, summary_type)
            # 模拟逐块 yield
            chunk_size = 30
            for i in range(0, len(cached.content), chunk_size):
                token = cached.content[i : i + chunk_size]
                yield f"event: token\ndata: {json.dumps(token, ensure_ascii=False)}\n\n"
            yield f"event: done\ndata: {json.dumps({'cached': True})}\n\n"
            return

    # 2. 获取文档的所有切片文本
    chunks: list[DocumentChunk] = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == doc_id)
        .order_by(DocumentChunk.chunk_index)
        .all()
    )

    if not chunks:
        raise ValueError("该文档尚未解析或内容为空")

    total_chars = sum(c.char_length or len(c.content) for c in chunks)
    provider = get_provider()
    system_instruction = PROMPTS[summary_type]
    full_output = []

    # 3. 策略判定：短文档直接单轮处理，超长文档 Map-Reduce
    if total_chars <= MAP_REDUCE_THRESHOLD_CHARS:
        # 单轮策略
        doc_text = "\n\n".join(
            f"--- 第 {c.page_number} 页 (章节: {c.section_title or '正文'}) ---\n{c.content}"
            for c in chunks
        )
        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": f"以下是文档完整正文：\n\n{doc_text}\n\n请按照要求生成分析结果。"},
        ]
        async for token in provider.chat_stream(messages, temperature=0.2):
            full_output.append(token)
            yield f"event: token\ndata: {json.dumps(token, ensure_ascii=False)}\n\n"

    else:
        # Map-Reduce 策略
        yield f"event: token\ndata: {json.dumps('> *文档篇幅较长（共计约 ' + str(total_chars) + ' 字），已自动启动 Map-Reduce 分段汇总引擎...*\\n\\n', ensure_ascii=False)}\n\n"
        
        # Map 阶段：按每 3 个 chunk 聚合成一个批次
        batch_size = 3
        batch_summaries = []
        batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]

        for b_idx, batch in enumerate(batches, 1):
            batch_text = "\n\n".join(c.content for c in batch)
            map_messages = [
                {
                    "role": "system",
                    "content": "请简明扼要地总结以下文段的核心论述、事实与数据，保留关键信息，篇幅在 150 字以内。",
                },
                {"role": "user", "content": batch_text},
            ]
            map_tokens = []
            async for tok in provider.chat_stream(map_messages, temperature=0.1):
                map_tokens.append(tok)
            batch_summary = "".join(map_tokens).strip()
            batch_summaries.append(f"【分段 {b_idx} 核心】{batch_summary}")

        # Reduce 阶段：汇聚所有分段要点，生成最终目标结构
        aggregated_context = "\n\n".join(batch_summaries)
        reduce_messages = [
            {"role": "system", "content": system_instruction},
            {
                "role": "user",
                "content": f"以下是全文各章节分段提炼的核心要点汇编：\n\n{aggregated_context}\n\n请根据上述全篇核心信息，综合生成最终内容。",
            },
        ]

        async for token in provider.chat_stream(reduce_messages, temperature=0.2):
            full_output.append(token)
            yield f"event: token\ndata: {json.dumps(token, ensure_ascii=False)}\n\n"

    final_content = "".join(full_output)

    # 4. 持久化缓存到 SQLite summaries 表
    try:
        # 删除旧缓存（若有）
        db.query(Summary).filter(
            Summary.document_id == doc_id, Summary.summary_type == summary_type
        ).delete()

        import uuid as _uuid
        new_summary = Summary(
            id=str(_uuid.uuid4()),
            document_id=doc_id,
            summary_type=summary_type,
            content=final_content,
        )
        db.add(new_summary)
        db.commit()
    except Exception as e:
        logger.warning("Failed to save summary cache: %s", e)

    yield f"event: done\ndata: {json.dumps({'cached': False})}\n\n"
