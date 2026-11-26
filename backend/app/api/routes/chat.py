"""
Chat API — SSE 流式问答，RAG 检索 + DeepSeek 生成
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import Conversation, Message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

RAG_TOP_K = 8
SYSTEM_PROMPT = """你是「光笺 (Lumen)」的智能文档伴读与写作审阅助手。

你的双重核心能力：
1. **深度答疑**：结合参考资料与上下文，精准解答文档中的概念、逻辑与细节疑点。
2. **写作优化顾问**：当用户询问“文档哪里需要优化 / 怎么修改 / 如何润色 / 逻辑有什么问题”时，请站在资深审稿人的角度，从**结构逻辑、表达精炼度、论据支撑、排版可读性**给出具体可落地的改进建议，并尽量给出**「原句 → 建议改法」**示范。

防拒答与诚实原则：
- 优先依据参考资料与前文对话作答；若遇到宏观总结、延伸追问或局部检索未命中的情况，请结合文档概览与专业知识给出有价值的分析和建议，并清晰区分「文档原文依据」与「AI 分析建议」，不要生硬回复“无法回答”。

排版与标点铁律（必须严格遵守）：
1. **强制分区**：回答必须使用清晰的 Markdown 二级/三级标题分块（例如 `### 📌 核心结论`、`### 🔍 分点解析`、`### 💡 优化与延伸建议`，按问题复杂度灵活选用 2~3 个模块），严禁输出密密麻麻的一大段纯文本。
2. **标点规范与简洁**：严格使用中文全角标点（`，。：；？！`），严禁中英文标点混用；少用破折号、感叹号与多层括号嵌套。
3. **短句分点**：单句尽量不超过 30 字，避免一逗到底的长难句；超过 3 句话必须拆成带加粗关键词的短列表，句末标点干脆利落。"""


class ChatRequest(BaseModel):
    question: str
    doc_id: Optional[str] = None          # 限定检索范围（可选）
    conversation_id: Optional[str] = None # 续接对话（可选）


async def _stream_chat(
    question: str,
    doc_id: Optional[str],
    conversation_id: Optional[str],
    db: Session,
):
    """
    Generator: yields SSE lines.
    Events:
      event: citations  data: [{doc_id, chunk_index, page_number, section_title, score, text_preview}]
      event: token      data: "..."
      event: done       data: ""
      event: error      data: "error message"
    """
    from app.services import rag_service
    from app.services.llm_service import get_provider
    import uuid as _uuid

    try:
        # 0. 多轮对话历史读取与滑动窗口保护
        recent_history = []
        if conversation_id:
            all_history = (
                db.query(Message)
                .filter(Message.conversation_id == conversation_id)
                .order_by(Message.created_at.asc())
                .all()
            )
            # 截取最近 6 条（即 3 轮问答），防止长对话超出上下文窗口
            recent_history = all_history[-6:] if len(all_history) > 6 else all_history

        # 针对代词追问与短问题进行检索词自适应关联（让 RAG 准确定位）
        search_query = question.strip()
        if recent_history:
            last_user_msgs = [m for m in recent_history if m.role == "user"]
            pronoun_kws = ["它", "刚才", "那", "这个", "这", "其", "第二", "第三", "前一个", "后一个", "区别", "怎么写", "为什么"]
            if last_user_msgs and (len(search_query) < 18 or any(kw in search_query for kw in pronoun_kws)):
                search_query = f"{last_user_msgs[-1].content} {search_query}"

        # 1. RAG 检索
        hits = rag_service.search(search_query, doc_id=doc_id, top_k=RAG_TOP_K)
        citations = [
            {
                "doc_id": h["doc_id"],
                "chunk_index": h["chunk_index"],
                "page_number": h["page_number"],
                "section_title": h["section_title"],
                "score": h["score"],
                "text_preview": h["text"][:200],
            }
            for h in hits
        ]
        yield f"event: citations\ndata: {json.dumps(citations, ensure_ascii=False)}\n\n"

        # 2. 构造携带历史会话记忆与文档全局概览的 messages prompt
        context_parts = []
        if doc_id:
            from app.database.models import Summary, DocumentChunk
            overall_cache = (
                db.query(Summary)
                .filter(Summary.document_id == doc_id, Summary.summary_type == "overall")
                .order_by(Summary.created_at.desc())
                .first()
            )
            if overall_cache and overall_cache.content:
                context_parts.append(f"[文档全局概览]\n{overall_cache.content[:1200]}")
            else:
                lead_chunks = (
                    db.query(DocumentChunk)
                    .filter(DocumentChunk.document_id == doc_id)
                    .order_by(DocumentChunk.chunk_index.asc())
                    .limit(2)
                    .all()
                )
                if lead_chunks:
                    lead_text = "\n".join(c.content[:500] for c in lead_chunks)
                    context_parts.append(f"[文档开篇概览]\n{lead_text}")

        for i, h in enumerate(hits, 1):
            title = h.get("section_title") or f"段落 {i}"
            context_parts.append(f"[参考{i}] {title}:\n{h['text']}")
        context_text = "\n\n".join(context_parts) if context_parts else "（无相关参考资料）"

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]
        # 注入历史多轮对话上下文
        for m in recent_history:
            messages.append({"role": m.role, "content": m.content})

        # 注入当前轮问题及对应 RAG 资料
        current_content = f"参考资料：\n{context_text}\n\n问题：{question}"
        messages.append({"role": "user", "content": current_content})

        # 3. 流式调用 LLM
        provider = get_provider()
        full_answer = []
        async for token in provider.chat_stream(messages):
            full_answer.append(token)
            yield f"event: token\ndata: {json.dumps(token, ensure_ascii=False)}\n\n"

        answer_text = "".join(full_answer)

        # 4. 持久化对话
        if not conversation_id:
            conversation_id = str(_uuid.uuid4())
            conv = Conversation(
                id=conversation_id,
                title=question[:50],
                document_id=doc_id,
            )
            db.add(conv)

        db.add(Message(
            id=str(_uuid.uuid4()),
            conversation_id=conversation_id,
            role="user",
            content=question,
        ))
        db.add(Message(
            id=str(_uuid.uuid4()),
            conversation_id=conversation_id,
            role="assistant",
            content=answer_text,
            citations_json=json.dumps(citations, ensure_ascii=False),
        ))
        db.commit()

        yield f"event: done\ndata: {json.dumps({'conversation_id': conversation_id})}\n\n"

    except ValueError as e:
        yield f"event: error\ndata: {json.dumps(str(e), ensure_ascii=False)}\n\n"
    except Exception as e:
        logger.exception("Chat stream error")
        yield f"event: error\ndata: {json.dumps(f'服务器错误：{e}', ensure_ascii=False)}\n\n"


@router.post("/stream")
async def chat_stream(req: ChatRequest, db: Session = Depends(get_db)):
    """SSE 流式问答入口"""
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="问题不能为空")

    return StreamingResponse(
        _stream_chat(req.question, req.doc_id, req.conversation_id, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations")
def list_conversations(doc_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Conversation).order_by(Conversation.created_at.desc())
    if doc_id:
        q = q.filter(Conversation.document_id == doc_id)
    return [
        {
            "id": c.id,
            "title": c.title,
            "doc_id": c.document_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in q.limit(50).all()
    ]


@router.get("/conversations/{conv_id}/messages")
def get_messages(conv_id: str, db: Session = Depends(get_db)):
    msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conv_id)
        .order_by(Message.created_at)
        .all()
    )
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "source_chunks": json.loads(m.citations_json) if m.citations_json else [],
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in msgs
    ]


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: str, db: Session = Depends(get_db)):
    """删除指定会话及所有关联消息"""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    db.delete(conv)
    db.commit()
    return {"ok": True, "message": "会话已删除"}


class RenameConvRequest(BaseModel):
    title: str


@router.patch("/conversations/{conv_id}")
def rename_conversation(conv_id: str, req: RenameConvRequest, db: Session = Depends(get_db)):
    """重命名会话标题"""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    conv.title = req.title.strip() or "未命名会话"
    db.commit()
    return {"ok": True, "title": conv.title}
