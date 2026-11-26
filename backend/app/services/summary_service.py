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

# 统一标点与简洁排版规范
_STYLE_RULES = """
标点与排版铁律（必须严格遵守）：
1. 标点规范：严格使用中文全角标点（`，。：；？！`），严禁中英文标点混用；少用破折号、感叹号与多层括号嵌套。
2. 简洁断句：单句尽量不超过 30 字，严禁一逗到底的长难句；每条要点只讲一个核心意思，句末标点干脆利落。
3. 分区留白：严禁输出密密麻麻的大段纯文本，模块之间空行清晰，核心概念、关键数据与代码使用 **粗体** 或 `反引号` 突出。"""

PROMPTS = {
    "overall": f"""你是一位资深的文献与行业分析专家。请根据提供的文档内容，撰写一份结构严谨、见解深刻的「全局综合摘要」。
结构要求：
1. 顶级标题：以 `# 全局综合摘要` 开头。
2. 模块划分：必须使用 `## 一、核心主题`、`## 二、关键发现与主旨`、`## 三、实践价值与结论` 形成清晰的三段式结构。
{_STYLE_RULES}""",

    "outline": f"""你是一位擅长结构化思维与知识工程的专家。请根据提供的文档内容，输出一份具有清晰视觉层级与导读价值的「思维导图式层级大纲」。
结构要求：
1. 顶级标题：以单个 `# 全局文档主题或核心架构` 开头。
2. 一级大章：必须使用 `## 一、章名`、`## 二、章名`，保持大写中文序号。
3. 二级模块：使用 `### 1. 模块名` 或 `### 模块名`，切分具体知识块。
4. 核心要点：使用无序列表 `- `，关键词干练简洁，避免长句堆砌。
{_STYLE_RULES}""",

    "keypoints": f"""你是一位敏锐的研究员与知识架构师。请根据提供的文档内容，提炼出文档中最关键的「核心知识要点与认知突破点」。
结构要求：
1. 顶级标题：以 `# 核心知识要点提炼` 开头。
2. 模块分类：使用 `## 模块分类或核心维度`。
3. 具体要点：每个要点使用 `- **【要点标题】**：简明阐述` 的格式，严格基于文档原文信息。
{_STYLE_RULES}""",

    "optimize": f"""你是一位资深的总编审稿人与写作指导专家。用户希望了解这份文档**有哪些地方可以优化、如何改得更专业清晰**。请站在“作者的写作顾问”视角，给出客观、犀利、可直接落地的审阅与修改建议。
结构要求：
1. 顶级标题：以 `# 文档审阅与优化建议` 开头。
2. 第一部分：`## 一、整体诊断与核心短板`，从**结构逻辑、表达精炼度、论据支撑、排版可读性** 4 个维度简明评估，指出最主要的 2~3 个问题。
3. 第二部分：`## 二、具体修改建议与改写示范`，挑出文档中最值得优化的 3~5 处具体内容，按以下结构分条列出：
   - **【问题定位】**：指出所在段落或问题类型（如：逻辑跳跃 / 表述啰嗦 / 缺乏数据支撑）。
   - **【原句摘录】**：简短引用原文关键句。
   - **【优化改写】**：给出更精炼、更有说服力的改写示范。
   - **【修改理由】**：一句话点明为什么这样改更好。
4. 第三部分：`## 三、下一步精修清单`，给出 3 条可立即动手的修改优先级建议。
{_STYLE_RULES}""",
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
