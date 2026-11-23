"""
Settings API — 个人工作站系统设置、存储度量、Finder 打开、大模型多厂商预设与偏好管理
"""
from __future__ import annotations

import logging
import platform
import subprocess
import sys
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.database.models import AppSetting, Document
from app.services.llm_service import DeepSeekProvider
from app.services.onboarding_service import restore_onboarding_document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


# ── Pydantic Request Models ──────────────────────────────────────────────────

class ModelConfigRequest(BaseModel):
    provider: str = "deepseek"   # deepseek | siliconflow | ollama | custom
    api_key: str = ""
    model: str = "deepseek-chat"
    base_url: str = "https://api.deepseek.com"
    temperature: float = 0.3


class TestConnectionRequest(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


class PreferencesRequest(BaseModel):
    reader_target_lang: str = "zh-CN"
    reader_font_size: str = "normal"  # compact | normal | large


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_setting_value(db: Session, key: str, default: str = "") -> str:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row else default


def _set_setting_value(db: Session, key: str, value: str) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = value
    else:
        row = AppSetting(key=key, value=value)
        db.add(row)


def _get_path_size_mb(path: Path) -> float:
    if not path.exists():
        return 0.0
    total = 0
    try:
        if path.is_file():
            total = path.stat().st_size
        else:
            for p in path.rglob("*"):
                if p.is_file():
                    total += p.stat().st_size
    except Exception:
        pass
    return round(total / (1024 * 1024), 2)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/overview")
def get_settings_overview(db: Session = Depends(get_db)):
    """获取系统设置全景数据（模型配置、本地存储容量账单、偏好与运行诊断）"""
    provider = _get_setting_value(db, "llm_provider", "deepseek")
    api_key = _get_setting_value(db, "llm_api_key", "")
    model = _get_setting_value(db, "llm_model", "deepseek-chat")
    base_url = _get_setting_value(db, "llm_base_url", "https://api.deepseek.com")
    temp_str = _get_setting_value(db, "llm_temperature", "0.3")
    try:
        temperature = float(temp_str)
    except ValueError:
        temperature = 0.3

    reader_target_lang = _get_setting_value(db, "reader_target_lang", "zh-CN")
    reader_font_size = _get_setting_value(db, "reader_font_size", "normal")

    masked_key = ""
    if api_key:
        if len(api_key) > 8:
            masked_key = f"{api_key[:4]}****{api_key[-4:]}"
        else:
            masked_key = "****"

    # 存储容量统计
    docs_size_mb = _get_path_size_mb(settings.STORAGE_DIR)
    db_size_mb = _get_path_size_mb(settings.DATABASE_DIR)
    vector_size_mb = _get_path_size_mb(settings.VECTOR_DIR)
    total_size_mb = _get_path_size_mb(settings.APP_DATA_DIR)
    docs_count = db.query(Document).count()

    return {
        "llm": {
            "provider": provider,
            "is_configured": bool(api_key) or provider == "ollama",
            "masked_api_key": masked_key,
            "model": model,
            "base_url": base_url,
            "temperature": temperature,
        },
        "storage": {
            "app_data_dir": str(settings.APP_DATA_DIR),
            "docs_count": docs_count,
            "docs_size_mb": docs_size_mb,
            "database_size_mb": db_size_mb,
            "vector_size_mb": vector_size_mb,
            "total_size_mb": total_size_mb,
        },
        "preferences": {
            "reader_target_lang": reader_target_lang,
            "reader_font_size": reader_font_size,
        },
        "system": {
            "version": settings.APP_VERSION,
            "arch": f"{platform.system()} ({platform.machine()})",
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "fastembed_model": "BAAI/bge-small-zh-v1.5",
            "is_macos": platform.system() == "Darwin",
        },
    }


@router.get("/model")
def get_model_settings(db: Session = Depends(get_db)):
    """获取大模型配置（旧接口兼容）"""
    overview = get_settings_overview(db)
    return overview["llm"]


@router.post("/model")
def save_model_settings(req: ModelConfigRequest, db: Session = Depends(get_db)):
    """保存大模型与厂商配置"""
    _set_setting_value(db, "llm_provider", req.provider.strip())
    if req.api_key.strip():
        _set_setting_value(db, "llm_api_key", req.api_key.strip())
    elif req.provider == "ollama":
        _set_setting_value(db, "llm_api_key", "ollama")

    _set_setting_value(db, "llm_model", req.model.strip())
    _set_setting_value(db, "llm_base_url", req.base_url.strip())
    _set_setting_value(db, "llm_temperature", str(req.temperature))
    db.commit()
    return {"ok": True, "message": "模型配置已更新"}


@router.post("/quick-switch-ollama")
def quick_switch_ollama(db: Session = Depends(get_db)):
    """一键切换为本地 Ollama 免密纯离线引擎预设"""
    _set_setting_value(db, "llm_provider", "ollama")
    _set_setting_value(db, "llm_api_key", "ollama")
    _set_setting_value(db, "llm_model", "deepseek-r1:1.5b")
    _set_setting_value(db, "llm_base_url", "http://127.0.0.1:11434/v1")
    _set_setting_value(db, "llm_temperature", "0.3")
    db.commit()
    return {"ok": True, "message": "已成功切换为本地 Ollama 引擎（纯离线 · 零费用）"}


@router.post("/preferences")
def save_preferences(req: PreferencesRequest, db: Session = Depends(get_db)):
    """保存阅读与个性化偏好"""
    _set_setting_value(db, "reader_target_lang", req.reader_target_lang.strip())
    _set_setting_value(db, "reader_font_size", req.reader_font_size.strip())
    db.commit()
    return {"ok": True, "message": "偏好设置已保存"}


@router.post("/model/test")
async def test_model_connection(req: TestConnectionRequest, db: Session = Depends(get_db)):
    """测试模型接口连通性与时延"""
    api_key = req.api_key or _get_setting_value(db, "llm_api_key", "")
    model = req.model or _get_setting_value(db, "llm_model", "deepseek-chat")
    base_url = req.base_url or _get_setting_value(db, "llm_base_url", "https://api.deepseek.com")

    # Ollama 不需要真实密钥，填入占位符即可
    if not api_key:
        if "11434" in base_url or "ollama" in model.lower():
            api_key = "ollama"
        else:
            return {"ok": False, "latency_ms": -1, "error": "未提供或未配置 API Key"}

    provider = DeepSeekProvider(api_key=api_key, model=model, base_url=base_url)
    result = await provider.test_connection()
    return result


@router.post("/storage/open-in-finder")
def open_in_finder():
    """在 macOS Finder 中打开数据根目录"""
    app_data_path = settings.APP_DATA_DIR
    settings.ensure_directories()
    if platform.system() == "Darwin":
        subprocess.run(["open", str(app_data_path)], check=False)
        return {"ok": True, "path": str(app_data_path)}
    return {"ok": False, "error": "当前操作系统非 macOS"}


@router.post("/storage/clear-cache")
def clear_cache():
    """清理临时格式转换文件与导出缓存"""
    freed_bytes = 0
    try:
        # 清理 logs 或 tmp 缓存
        for log_file in settings.LOGS_DIR.glob("*.log"):
            try:
                freed_bytes += log_file.stat().st_size
                log_file.unlink()
            except OSError:
                pass
    except Exception as e:
        logger.warning("清理缓存异常: %s", e)

    return {"ok": True, "freed_mb": round(freed_bytes / (1024 * 1024), 2)}


@router.post("/storage/reindex")
def reindex_all_documents(db: Session = Depends(get_db)):
    """全量重建本地 ChromaDB 向量索引"""
    from app.services import rag_service
    docs = db.query(Document).filter(Document.status == "indexed").all()
    count = 0
    for doc in docs:
        try:
            rag_service.index_document(doc.id)
            count += 1
        except Exception as e:
            logger.warning("重建索引失败 doc %s: %s", doc.id, e)

    return {"ok": True, "indexed_count": count}


@router.post("/onboarding/restore")
def restore_onboarding(db: Session = Depends(get_db)):
    """重置/恢复出厂实操指南示例文档"""
    doc = restore_onboarding_document(db)
    return {"ok": True, "doc_id": doc.id, "name": doc.name}
