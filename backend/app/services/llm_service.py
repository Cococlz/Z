"""
LLM Service — DeepSeek API (openai-compatible) + 流式 SSE 支持
"""
from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from typing import AsyncIterator

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 抽象基类
# ---------------------------------------------------------------------------

class BaseLLMProvider(ABC):
    @abstractmethod
    async def chat_stream(
        self,
        messages: list[dict],
        temperature: float = 0.3,
    ) -> AsyncIterator[str]:
        """逐 token yield 文本"""
        ...

    @abstractmethod
    async def test_connection(self) -> dict:
        """测试连接，返回 {"ok": bool, "latency_ms": int, "model": str}"""
        ...


# ---------------------------------------------------------------------------
# DeepSeek Provider
# ---------------------------------------------------------------------------

class DeepSeekProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model: str = "deepseek-chat", base_url: str = "https://api.deepseek.com"):
        from openai import AsyncOpenAI  # type: ignore
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    async def chat_stream(
        self,
        messages: list[dict],
        temperature: float = 0.3,
    ) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            stream=True,
            temperature=temperature,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def test_connection(self) -> dict:
        t0 = time.time()
        try:
            resp = await self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=5,
                stream=False,
            )
            latency_ms = int((time.time() - t0) * 1000)
            return {"ok": True, "latency_ms": latency_ms, "model": resp.model}
        except Exception as e:
            return {"ok": False, "latency_ms": -1, "model": "", "error": str(e)}


# ---------------------------------------------------------------------------
# Provider 工厂（从 DB AppSetting 读取配置）
# ---------------------------------------------------------------------------

def get_provider() -> DeepSeekProvider:
    """
    从 AppSetting 表读取 llm_api_key / llm_model / llm_base_url，
    返回 DeepSeekProvider 实例。
    """
    from app.database.session import SessionLocal
    from app.database.models import AppSetting

    db = SessionLocal()
    try:
        def _get(key: str, default: str = "") -> str:
            row = db.query(AppSetting).filter(AppSetting.key == key).first()
            return row.value if row else default

        api_key = _get("llm_api_key")
        model = _get("llm_model", "deepseek-chat")
        base_url = _get("llm_base_url", "https://api.deepseek.com")
    finally:
        db.close()

    if not api_key:
        raise ValueError("LLM API key not configured. Please set it in Settings.")

    return DeepSeekProvider(api_key=api_key, model=model, base_url=base_url)
