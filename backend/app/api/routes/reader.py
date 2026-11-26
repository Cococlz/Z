"""
Reader API — 双栏阅读正文分段读取、Map-Reduce 结构化摘要与大纲生成
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import Document, DocumentChunk, Summary, Annotation
from app.services.summary_service import generate_summary_stream
from app.services.toc_service import get_document_toc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/reader", tags=["reader"])


class SummarizeRequest(BaseModel):
    summary_type: str = "overall"  # overall | outline | keypoints
    force_refresh: bool = False


class CreateAnnotationRequest(BaseModel):
    document_id: str
    page_index: int = 0
    selected_text: str
    color: str = "yellow"  # yellow | green | purple | blue
    tags: Optional[list[str]] = []
    note: Optional[str] = None
    ai_insight: Optional[str] = None


class UpdateAnnotationRequest(BaseModel):
    color: Optional[str] = None
    tags: Optional[list[str]] = None
    note: Optional[str] = None


class InlineActionRequest(BaseModel):
    text: str
    action: str = "explain"  # explain | translate | summarize
    target_lang: Optional[str] = None  # zh-CN | en | ja | ko | fr | de | es | ru
    context: Optional[str] = None
    doc_title: Optional[str] = None
    section_title: Optional[str] = None


class UpdateProgressRequest(BaseModel):
    page_index: int = 0


@router.get("/{doc_id}/content")
def get_document_content(doc_id: str, db: Session = Depends(get_db)):
    """获取文档详情、分页正文切片、原生/启发式大纲树与最后阅读进度"""
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

    # 提取文档原生大纲目录树
    toc = get_document_toc(doc, chunks)

    return {
        "id": doc.id,
        "name": doc.name,
        "file_type": doc.file_type,
        "page_count": doc.page_count,
        "char_count": doc.char_count,
        "status": doc.status,
        "last_read_page": doc.last_read_page or 0,
        "last_read_at": doc.last_read_at.isoformat() if doc.last_read_at else None,
        "toc": toc,
        "pages": pages,
    }


@router.get("/{doc_id}/toc")
def get_document_toc_endpoint(doc_id: str, db: Session = Depends(get_db)):
    """获取文档大纲树（包含层级与对应分块页码）"""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档未找到")

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == doc_id)
        .order_by(DocumentChunk.chunk_index)
        .all()
    )
    return get_document_toc(doc, chunks)


@router.post("/{doc_id}/progress")
def update_reading_progress(
    doc_id: str,
    req: UpdateProgressRequest,
    db: Session = Depends(get_db),
):
    """记录并保存用户对该文档的最新阅读页码进度"""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档未找到")

    doc.last_read_page = max(0, req.page_index)
    doc.last_read_at = datetime.utcnow()
    db.commit()
    return {
        "success": True,
        "document_id": doc.id,
        "last_read_page": doc.last_read_page,
        "last_read_at": doc.last_read_at.isoformat(),
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
        "explain": (
            "你是一位学识渊博的导师。请深入浅出地解释用户在阅读时选中的这段文字或专业术语，结合上下文说明其通俗含义、背景或应用场景。\n"
            "排版与标点要求：分点说明（2~3条即可），使用规范中文全角标点，单句简练不超过30字，避免密密麻麻的长段落。"
        ),
        "translate": (
            f"你是一位精通多语言互译的专业翻译家。请将用户选中的文本精准翻译为【{target_lang}】。\n"
            "【输出规范】：\n"
            "1. 严禁任何客套前缀或解释（绝不要输出'The selected text is...'、'好的'或'翻译如下：'）；\n"
            "2. 第一行直接呈现最准确、专业、地道的【{target_lang}】译文；\n"
            "3. 如有重要专业词汇、生僻词或特殊语境用法，可空一行后附带简短精炼的「核心词汇与语境解析」；\n"
            "4. 符合目标语言的母语地道表达习惯。"
        ),
        "summarize": "你是一位提炼专家。请用极简短的 1~2 句话概括选中文字的核心观点或结论，标点简洁准确，不加冗余修饰词。",
        "polish": (
            "你是一位资深文字编辑与写作审阅专家。请针对用户选中的段落，给出诊断与优化改写建议。\n"
            "请严格按以下 3 个简洁分区输出：\n"
            "### 🔍 问题诊断\n（1~2 句话指出逻辑、精炼度或表达上的不足）\n\n"
            "### ✨ 优化改写\n（直接给出更专业、流畅、简练的改写版本）\n\n"
            "### 💡 修改理由\n（简述改动带来的提升）\n"
            "要求：严格使用规范中文全角标点，短句为主，排版留白清晰。"
        ),
    }
    sys_prompt = action_prompts.get(req.action, action_prompts["explain"])

    macro_parts = []
    if req.doc_title:
        macro_parts.append(f"所属文档：《{req.doc_title}》")
    if req.section_title:
        macro_parts.append(f"所在章节/标题：{req.section_title}")
    macro_hint = f"【宏观文档语境】：{' · '.join(macro_parts)}\n" if macro_parts else ""

    context_hint = f"【文段临近上下文】：\n{req.context}\n" if req.context else ""
    user_prompt = f"{macro_hint}{context_hint}【选中划词文本】：\n「{req.text}」\n\n请针对选中文本给出你的解读："

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


# ── 高亮划线与批注笔记 API ───────────────────────────────────────────────────

@router.get("/{doc_id}/annotations")
def get_document_annotations(doc_id: str, db: Session = Depends(get_db)):
    """获取指定文档的所有高亮划线与批注列表"""
    notes = (
        db.query(Annotation)
        .filter(Annotation.document_id == doc_id)
        .order_by(Annotation.page_index.asc(), Annotation.created_at.asc())
        .all()
    )
    result = []
    for a in notes:
        try:
            parsed_tags = json.loads(a.tags) if a.tags else []
        except Exception:
            parsed_tags = []
        result.append({
            "id": a.id,
            "document_id": a.document_id,
            "page_index": a.page_index,
            "selected_text": a.selected_text,
            "color": a.color,
            "tags": parsed_tags,
            "note": a.note,
            "ai_insight": a.ai_insight,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        })
    return result


@router.post("/annotations")
def create_annotation(req: CreateAnnotationRequest, db: Session = Depends(get_db)):
    """创建新的高亮划线或批注笔记"""
    doc = db.query(Document).filter(Document.id == req.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档未找到")

    clean_tags = [t.strip().lstrip("#") for t in (req.tags or []) if t.strip()]
    anno = Annotation(
        document_id=req.document_id,
        page_index=req.page_index,
        selected_text=req.selected_text.strip(),
        color=req.color,
        tags=json.dumps(clean_tags, ensure_ascii=False),
        note=req.note.strip() if req.note else None,
        ai_insight=req.ai_insight.strip() if req.ai_insight else None,
    )
    db.add(anno)
    db.commit()
    db.refresh(anno)
    return {
        "ok": True,
        "annotation": {
            "id": anno.id,
            "document_id": anno.document_id,
            "page_index": anno.page_index,
            "selected_text": anno.selected_text,
            "color": anno.color,
            "tags": clean_tags,
            "note": anno.note,
            "ai_insight": anno.ai_insight,
            "created_at": anno.created_at.isoformat() if anno.created_at else None,
        }
    }


@router.put("/annotations/{annotation_id}")
def update_annotation(annotation_id: str, req: UpdateAnnotationRequest, db: Session = Depends(get_db)):
    """修改高亮批注笔记内容、标签或更换颜色"""
    anno = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not anno:
        raise HTTPException(status_code=404, detail="批注未找到")

    if req.color is not None:
        anno.color = req.color
    if req.tags is not None:
        clean_tags = [t.strip().lstrip("#") for t in req.tags if t.strip()]
        anno.tags = json.dumps(clean_tags, ensure_ascii=False)
    if req.note is not None:
        anno.note = req.note.strip() if req.note else None

    db.commit()
    return {"ok": True, "message": "批注已更新"}


@router.delete("/annotations/{annotation_id}")
def delete_annotation(annotation_id: str, db: Session = Depends(get_db)):
    """删除指定高亮划线批注"""
    anno = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not anno:
        raise HTTPException(status_code=404, detail="批注未找到")
    db.delete(anno)
    db.commit()
    return {"ok": True, "message": "批注已删除"}


@router.get("/{doc_id}/annotations/export")
def export_annotations_markdown(doc_id: str, db: Session = Depends(get_db)):
    """将文档的所有划线与读书笔记结构化导出为 Markdown 笔记本"""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档未找到")

    notes = (
        db.query(Annotation)
        .filter(Annotation.document_id == doc_id)
        .order_by(Annotation.page_index.asc(), Annotation.created_at.asc())
        .all()
    )

    color_emoji = {
        "yellow": "🟡",
        "green": "🟢",
        "purple": "🟣",
        "blue": "🔵",
    }

    lines = [
        f"# 《{doc.name}》读书笔记与高亮摘录\n",
        f"> 智阅 AI 纯本地读书笔记本 · 共收集 {len(notes)} 条高亮划线与思考\n",
    ]

    current_page = -1
    for a in notes:
        if a.page_index != current_page:
            current_page = a.page_index
            lines.append(f"\n## 第 {current_page + 1} 页摘录\n")

        emoji = color_emoji.get(a.color, "🟡")
        tag_str = ""
        try:
            ts = json.loads(a.tags) if a.tags else []
            if ts:
                tag_str = " " + " ".join([f"#{t}" for t in ts])
        except Exception:
            pass
        lines.append(f"> {emoji} **原文摘录**{tag_str}：{a.selected_text}\n")
        if a.note:
            lines.append(f"✍️ **我的思考笔记**：{a.note}\n")
        if a.ai_insight:
            lines.append(f"💡 **AI 伴读解析**：\n```\n{a.ai_insight}\n```\n")
        lines.append("---\n")

    md_content = "\n".join(lines)
    return {
        "doc_id": doc.id,
        "name": doc.name,
        "total_count": len(notes),
        "markdown": md_content,
    }


@router.post("/{doc_id}/synthesize-notes/stream")
async def synthesize_notes_stream(doc_id: str, db: Session = Depends(get_db)):
    """
    AI 伴读与四色划线深度联动：
    对用户在阅读该文档时做出的黄色(重点)、绿色(理解)、紫色(思考)、蓝色(疑问)进行深度串联与定制攻坚解读。
    """
    from app.services.llm_service import get_provider

    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档未找到")

    notes = (
        db.query(Annotation)
        .filter(Annotation.document_id == doc_id)
        .order_by(Annotation.page_index.asc(), Annotation.created_at.asc())
        .all()
    )

    if not notes:
        raise HTTPException(
            status_code=400,
            detail="该文档暂无划线与批注笔记，请先划选文字后再进行 AI 串联解读。",
        )

    # 结构化组织用户的四色划线
    yellow_notes = [a for a in notes if a.color == "yellow"]
    green_notes = [a for a in notes if a.color == "green"]
    purple_notes = [a for a in notes if a.color == "purple"]
    blue_notes = [a for a in notes if a.color == "blue"]

    def _format_group(title: str, items: list[Annotation]) -> str:
        if not items:
            return f"### {title} (0 处)\n（暂无标注）\n"
        out = [f"### {title} (共 {len(items)} 处)"]
        for idx, a in enumerate(items, 1):
            line = f"{idx}. [第 {a.page_index + 1} 页] 原文：「{a.selected_text}」"
            try:
                ts = json.loads(a.tags) if a.tags else []
                if ts:
                    line += f" [标签: {', '.join(ts)}]"
            except Exception:
                pass
            if a.note:
                line += f"\n   ✍️ 个人思考/批注：{a.note}"
            if a.ai_insight:
                line += f"\n   💡 先前 AI 解析：{a.ai_insight.strip()}"
            out.append(line)
        return "\n".join(out) + "\n"

    sections = [
        _format_group("🟡 核心重点 (Key Concepts)", yellow_notes),
        _format_group("🟢 认知理解 (Comprehension)", green_notes),
        _format_group("🟣 个人思考与反思 (Reflections)", purple_notes),
        _format_group("🔵 疑难困惑与待解问题 (Doubts & Questions)", blue_notes),
    ]
    notes_payload = "\n".join(sections)

    sys_instruction = (
        "你是一位博学的学术伴读导师与认知科学专家。用户在研读文档时，通过智阅 AI 的「四色高亮笔记系统」"
        "细致记录了不同维度的划线与思考（🟡重点、🟢理解、🟣思考、🔵疑问）。\n"
        "请结合文档背景，对用户的划线资产进行一次结构化、有深度、直击痛点的【全篇划线串联攻坚解读】。\n\n"
        "【报告输出规范】：\n"
        "1. **🧭 知识脉络全景串联**：将分散在不同页面的【重点 🟡】与【理解 🟢】融会贯通，梳理成连贯的知识演进逻辑线；\n"
        "2. **🎯 核心疑难攻坚破局**：重点针对用户标记的【疑问 🔵】，深入浅出地剖析原理，消除认知盲区；如无疑问标注，则指出该领域最容易踩坑的隐形陷阱；\n"
        "3. **💡 思想共鸣与实践进阶**：点评用户的【思考 🟣】，并给出在实际项目或深度学习中的延伸应用建议；\n"
        "4. **排版质感**：采用清晰的 Markdown 结构，标题分明，关键要点与代码使用粗体或代码块高亮，语言充满启发性与导师亲和力。"
    )

    user_prompt = (
        f"文档名称：《{doc.name}》\n"
        f"用户累计划线批注：{len(notes)} 条\n\n"
        f"以下是用户在阅读过程中留下的全部高亮划线与思考笔记：\n\n"
        f"{notes_payload}\n\n"
        "请立即为我生成本篇文档的【全篇划线深度串联与攻坚解读报告】："
    )

    messages = [
        {"role": "system", "content": sys_instruction},
        {"role": "user", "content": user_prompt},
    ]

    async def _generator():
        try:
            provider = get_provider()
            async for token in provider.chat_stream(messages, temperature=0.3):
                yield f"event: token\ndata: {json.dumps(token, ensure_ascii=False)}\n\n"
            yield f"event: done\ndata: \"\"\n\n"
        except Exception as e:
            logger.exception("Synthesize notes stream error")
            yield f"event: error\ndata: {json.dumps(str(e), ensure_ascii=False)}\n\n"

    return StreamingResponse(
        _generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

