"""
Reader API — 双栏阅读正文分段读取、Map-Reduce 结构化摘要与大纲生成
"""
from __future__ import annotations

import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import Document, DocumentChunk, Summary
from app.services.summary_service import generate_summary_stream

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/reader", tags=["reader"])


class SummarizeRequest(BaseModel):
    summary_type: str = "overall"  # overall | outline | keypoints
    force_refresh: bool = False


class InlineActionRequest(BaseModel):
    text: str
    action: str = "explain"  # explain | translate | summarize
    target_lang: Optional[str] = None  # zh-CN | en | ja | ko | fr | de | es | ru
    context: Optional[str] = None


@router.get("/{doc_id}/content")
def get_document_content(doc_id: str, db: Session = Depends(get_db)):
    """获取文档详情及其所有分页正文切片"""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档未找到")

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == doc_id)
        .order_by(DocumentChunk.chunk_index)
        .all()
    )

    pages = [
        {
            "chunk_index": c.chunk_index,
            "page_number": c.page_number or (c.chunk_index + 1),
            "section_title": c.section_title or "",
            "content": c.content,
            "char_length": c.char_length or len(c.content),
        }
        for c in chunks
    ]

    return {
        "id": doc.id,
        "name": doc.name,
        "file_type": doc.file_type,
        "page_count": doc.page_count,
        "char_count": doc.char_count,
        "status": doc.status,
        "pages": pages,
    }


@router.get("/{doc_id}/summaries")
def get_cached_summaries(doc_id: str, db: Session = Depends(get_db)):
    """获取该文档所有已缓存的摘要类型和内容"""
    summaries = (
        db.query(Summary)
        .filter(Summary.document_id == doc_id)
        .order_by(Summary.created_at.desc())
        .all()
    )
    result = {}
    for s in summaries:
        if s.summary_type not in result:
            result[s.summary_type] = {
                "id": s.id,
                "content": s.content,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
    return result


@router.post("/{doc_id}/summarize/stream")
async def summarize_stream(
    doc_id: str,
    req: SummarizeRequest,
    db: Session = Depends(get_db),
):
    """SSE 流式生成长文速读结果（支持 overall / outline / keypoints）"""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档未找到")

    async def _event_generator():
        try:
            async for sse_chunk in generate_summary_stream(
                doc_id=doc_id,
                summary_type=req.summary_type,
                db=db,
                force_refresh=req.force_refresh,
            ):
                yield sse_chunk
        except Exception as e:
            logger.exception("Summarize error")
            yield f"event: error\ndata: {json.dumps(str(e), ensure_ascii=False)}\n\n"

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{doc_id}/file-info")
def get_doc_file_info(doc_id: str, db: Session = Depends(get_db)):
    """获取文档本地物理文件存储路径与类型"""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档未找到")
    return {
        "id": doc.id,
        "name": doc.name,
        "file_type": doc.file_type,
        "storage_path": doc.storage_path,
        "file_url": f"file://{doc.storage_path}",
    }


@router.post("/inline-action/stream")
async def inline_action_stream(req: InlineActionRequest):
    """划词轻量提问接口：深度解释、语境翻译、一句话提炼"""
    from app.services.llm_service import get_provider

    if not req.text.strip():
        raise HTTPException(status_code=400, detail="选中文本不能为空")

    # 解析目标翻译语言（优先采用请求显式指定的语言，否则读取偏好设置）
    lang_name_map = {
        "zh-CN": "现代中文",
        "en": "自然地道的现代英文",
        "ja": "自然地道的现代日文",
        "ko": "地道自然的现代韩文",
        "fr": "优美标准的法文",
        "de": "严谨精练的德文",
        "es": "规范标准的西班牙文",
        "ru": "标准现代俄文",
    }
    
    req_lang_code = req.target_lang
    if not req_lang_code:
        try:
            from app.database.session import SessionLocal
            from app.database.models import AppSetting
            with SessionLocal() as db:
                row = db.query(AppSetting).filter(AppSetting.key == "reader_target_lang").first()
                if row and row.value:
                    req_lang_code = row.value
        except Exception:
            pass

    target_lang = lang_name_map.get(req_lang_code or "zh-CN", "现代中文")

    action_prompts = {
        "explain": "你是一位学识渊博的导师。请深入浅出地解释用户在阅读时选中的这段文字或专业术语，结合上下文说明其通俗含义、背景或应用场景，语言精练生动。",
        "translate": (
            f"你是一位精通多语言互译的专业翻译家。请将用户选中的文本精准翻译为【{target_lang}】。\n"
            "【输出规范】：\n"
            "1. 严禁任何客套前缀或解释（绝不要输出'The selected text is...'、'好的'或'翻译如下：'）；\n"
            "2. 第一行直接呈现最准确、专业、地道的【{target_lang}】译文；\n"
            "3. 如有重要专业词汇、生僻词或特殊语境用法，可空一行后附带简短精炼的「核心词汇与语境解析」；\n"
            "4. 符合目标语言的母语地道表达习惯。"
        ),
        "summarize": "你是一位提炼专家。请用极简短的 1-2 句话概括提取选中文字的核心观点或结论，不加任何冗余修饰词。",
    }
    sys_prompt = action_prompts.get(req.action, action_prompts["explain"])

    context_hint = f"\n所在文段上下文：\n{req.context}\n" if req.context else ""
    user_prompt = f"{context_hint}选中划词文本：\n「{req.text}」\n\n请针对选中文本给出你的解读："

    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_prompt},
    ]

    async def _generator():
        try:
            provider = get_provider()
            async for token in provider.chat_stream(messages, temperature=0.3):
                yield f"event: token\ndata: {json.dumps(token, ensure_ascii=False)}\n\n"
            yield f"event: done\ndata: \"\"\n\n"
        except Exception as e:
            logger.exception("Inline action error")
            yield f"event: error\ndata: {json.dumps(str(e), ensure_ascii=False)}\n\n"

    return StreamingResponse(
        _generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
