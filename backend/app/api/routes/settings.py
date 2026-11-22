"""
Settings API — 保存和获取配置（如 DeepSeek API Key、模型名称、Base URL），测试连通性
"""
from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import AppSetting
from app.services.llm_service import DeepSeekProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


class ModelConfigRequest(BaseModel):
    api_key: str
    model: str = "deepseek-chat"
    base_url: str = "https://api.deepseek.com"


class TestConnectionRequest(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


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


@router.get("/model")
def get_model_settings(db: Session = Depends(get_db)):
    """获取当前大模型配置（API Key 进行脱敏处理）"""
    api_key = _get_setting_value(db, "llm_api_key", "")
    model = _get_setting_value(db, "llm_model", "deepseek-chat")
    base_url = _get_setting_value(db, "llm_base_url", "https://api.deepseek.com")

    # 脱敏输出，如 sk-1234****abcd
    masked_key = ""
    if api_key:
        if len(api_key) > 8:
            masked_key = f"{api_key[:4]}****{api_key[-4:]}"
        else:
            masked_key = "****"

    return {
        "is_configured": bool(api_key),
        "masked_api_key": masked_key,
        "model": model,
        "base_url": base_url,
    }


@router.post("/model")
def save_model_settings(req: ModelConfigRequest, db: Session = Depends(get_db)):
    """保存大模型配置"""
    if req.api_key.strip():
        _set_setting_value(db, "llm_api_key", req.api_key.strip())
    _set_setting_value(db, "llm_model", req.model.strip())
    _set_setting_value(db, "llm_base_url", req.base_url.strip())
    db.commit()
    return {"ok": True, "message": "配置已保存"}


@router.post("/model/test")
async def test_model_connection(req: TestConnectionRequest, db: Session = Depends(get_db)):
    """
    测试大模型接口连通性与响应延迟。
    若请求中带了 api_key，则测试该 key，否则测试数据库中已保存的 key。
    """
    api_key = req.api_key or _get_setting_value(db, "llm_api_key", "")
    model = req.model or _get_setting_value(db, "llm_model", "deepseek-chat")
    base_url = req.base_url or _get_setting_value(db, "llm_base_url", "https://api.deepseek.com")

    if not api_key:
        return {"ok": False, "latency_ms": -1, "error": "未提供或未配置 API Key"}

    provider = DeepSeekProvider(api_key=api_key, model=model, base_url=base_url)
    result = await provider.test_connection()
    return result
