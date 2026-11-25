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
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=15.0,
        )
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
            err_str = str(e)
            if "AuthenticationError" in type(e).__name__ or "401" in err_str:
                error_msg = "API Key 无效或未授权 (401)"
            elif "NotFoundError" in type(e).__name__ or "404" in err_str:
                error_msg = f"模型不存在或 Base URL 路径错误: {self._model}"
            elif "ConnectTimeout" in type(e).__name__ or "timed out" in err_str.lower():
                error_msg = "连接大模型服务超时，请检查网络或本地 Ollama 是否启动"
            elif "APIConnectionError" in type(e).__name__ or "ConnectError" in type(e).__name__ or "Connection refused" in err_str or "Connection error" in err_str:
                if "11434" in str(self._client.base_url):
                    error_msg = "未检测到本地 Ollama 运行，请先安装并启动 Ollama (ollama.com)"
                else:
                    error_msg = "无法连接至 Base URL，请检查网络或代理设置"
            else:
                error_msg = f"{type(e).__name__}: {err_str[:120]}"
            return {"ok": False, "latency_ms": -1, "model": "", "error": error_msg}


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

        provider = _get("llm_provider", "deepseek")
        api_key = _get("llm_api_key")
        model = _get("llm_model", "deepseek-chat")
        base_url = _get("llm_base_url", "https://api.deepseek.com")
    finally:
        db.close()

    if not api_key:
        if provider == "ollama" or "11434" in base_url or "ollama" in model.lower():
            api_key = "ollama"
        else:
            raise ValueError("未配置大模型 API Key。请在系统设置中配置 DeepSeek 密钥，或一键切换为本地纯离线大模型。")

    return DeepSeekProvider(api_key=api_key, model=model, base_url=base_url)
