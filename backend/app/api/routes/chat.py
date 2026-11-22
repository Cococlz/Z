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

RAG_TOP_K = 5
SYSTEM_PROMPT = """你是智阅AI的智能问答助手。
你会收到用户上传文档的相关段落作为参考资料，请基于这些资料回答用户问题。
如果资料中没有相关信息，请如实告知，不要编造内容。
回答请使用中文，保持简洁准确。"""


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
        # 1. RAG 检索
        hits = rag_service.search(question, doc_id=doc_id, top_k=RAG_TOP_K)
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

        # 2. 构造 prompt
        context_parts = []
        for i, h in enumerate(hits, 1):
            title = h.get("section_title") or f"段落 {i}"
            context_parts.append(f"[参考{i}] {title}:\n{h['text']}")
        context_text = "\n\n".join(context_parts) if context_parts else "（无相关参考资料）"

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"参考资料：\n{context_text}\n\n问题：{question}"},
        ]

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
