"""仅后端访问中转站。读取 Responses 流，可边收边转发文字，但只有完整完成才算交付；不自动重试。"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from time import monotonic
from urllib.parse import urlsplit

import httpx

from app.core.config import Settings
from app.schemas.chat import ChatMessage, ChatResponse, TokenUsage

logger = logging.getLogger(__name__)


class ModelError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _parse_response(response: dict, model: str) -> ChatResponse:
    if response.get("status") != "completed":
        raise ModelError("模型没有完整完成回答，请缩短问题后手动重试。")
    parts = []
    for item in response.get("output", []):
        if item.get("type") == "message":
            for part in item.get("content", []):
                if part.get("type") in {"output_text", "refusal"}:
                    value = part.get("text") if part.get("type") == "output_text" else part.get("refusal")
                    if isinstance(value, str):
                        parts.append(value)
    reply = "\n".join(parts).strip()
    if not reply:
        raise ModelError("中转站没有返回可显示的回答，请检查模型和接口配置。")
    raw_usage = response.get("usage") or {}
    usage = None
    if all(type(raw_usage.get(k)) is int and raw_usage[k] >= 0 for k in ("input_tokens", "output_tokens")):
        usage = TokenUsage(input_tokens=raw_usage["input_tokens"], output_tokens=raw_usage["output_tokens"])
    return ChatResponse(reply=reply, model=model, usage=usage)


def _upstream_error(status: int) -> ModelError:
    if status in {401, 403}:
        return ModelError("中转站拒绝认证，请检查后端 API Key、额外认证头和账号权限。")
    if status == 429:
        return ModelError("中转站额度不足或请求过于频繁，请检查余额并稍后手动重试。", 429)
    if status == 404:
        return ModelError("中转站接口不存在，请检查后端地址是否需要包含 /v1。")
    if status == 400:
        return ModelError("中转站不接受当前请求，请核对模型名、思考强度和 Responses 接口支持情况。")
    return ModelError(f"中转站暂不可用（HTTP {status}），请稍后手动重试。")


@dataclass(frozen=True)
class TextDelta:
    """流式回答的一段增量文字；完整回答以最后的 ChatResponse 为准。"""
    text: str


async def stream_model(settings: Settings, messages: list[ChatMessage], instructions: str) -> AsyncIterator[TextDelta | ChatResponse]:
    """边收边产出增量文字，最后产出完整 ChatResponse；失败抛 ModelError，已产出的文字不算交付。"""
    if not settings.model_configured:
        raise ModelError("尚未配置模型，请在后端 .env 中填写中转地址、API Key 和模型名。", 503)
    base = settings.model_base_url.strip().rstrip("/")
    parsed = urlsplit(base)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc or parsed.query or parsed.fragment or parsed.username:
        raise ModelError("后端模型地址格式不正确。", 503)
    started = monotonic()
    first_text: float | None = None

    def finish(result: ChatResponse, raw: dict) -> ChatResponse:
        details = (raw.get("usage") or {}).get("output_tokens_details") or {}
        logger.info(
            "模型耗时 effort=%s 首字=%.1fs 总计=%.1fs 输入=%s 输出=%s 思考=%s",
            settings.model_reasoning_effort,
            (first_text or monotonic()) - started, monotonic() - started,
            result.usage.input_tokens if result.usage else "?", result.usage.output_tokens if result.usage else "?",
            details.get("reasoning_tokens", "?"),
        )
        return result

    try:
        extra = json.loads(settings.model_extra_headers.get_secret_value())
        if not isinstance(extra, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in extra.items()):
            raise ValueError
        headers = {**extra, "Authorization": f"Bearer {settings.model_api_key.get_secret_value()}", "Accept": "text/event-stream"}
        payload = {
            "model": settings.model_name,
            "reasoning": {"effort": settings.model_reasoning_effort},
            "instructions": instructions,
            "input": [m.model_dump() for m in messages],
            "stream": True,
            "store": False,
            "max_output_tokens": settings.model_max_output_tokens,
        }
        async with asyncio.timeout(settings.model_timeout_seconds):
            async with httpx.AsyncClient(timeout=httpx.Timeout(settings.model_timeout_seconds, connect=10), follow_redirects=False) as client:
                async with client.stream("POST", f"{base}/responses", headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        raise _upstream_error(response.status_code)
                    # 某些兼容中转即使请求流式，仍返回普通 JSON；两种均核对完成状态。
                    if "application/json" in response.headers.get("content-type", ""):
                        body = bytearray()
                        async for chunk in response.aiter_bytes():
                            body.extend(chunk)
                            if len(body) > 1024 * 1024:
                                raise ModelError("中转站返回内容过大，请缩短问题。")
                        raw = json.loads(body)
                        result = _parse_response(raw, settings.model_name)
                        first_text = monotonic()
                        yield TextDelta(result.reply)
                        yield finish(result, raw)
                        return
                    data_lines: list[str] = []
                    received = 0
                    async for line in response.aiter_lines():
                        received += len(line)
                        if received > 2 * 1024 * 1024:
                            raise ModelError("中转站返回内容过大，请缩短问题。")
                        if line.startswith("data:"):
                            data_lines.append(line[5:].lstrip())
                        elif not line and data_lines:
                            data = "\n".join(data_lines)
                            data_lines.clear()
                            if data == "[DONE]":
                                break
                            event = json.loads(data)
                            kind = event.get("type")
                            if kind == "response.output_text.delta" and isinstance(event.get("delta"), str) and event["delta"]:
                                if first_text is None:
                                    first_text = monotonic()
                                yield TextDelta(event["delta"])
                            elif kind == "response.completed":
                                yield finish(_parse_response(event["response"], settings.model_name), event["response"])
                                return
                            elif kind in {"error", "response.failed", "response.incomplete"}:
                                raise ModelError("模型回答失败或被截断，本次未交付结果，请缩短问题后手动重试。")
                    raise ModelError("中转站连接提前结束，没有收到完整回答。")
    except ModelError:
        raise
    except (TimeoutError, httpx.TimeoutException):
        raise ModelError("等待模型超时，未自动重试；中转站可能已经计费，请稍后手动重试。", 504) from None
    except httpx.RequestError:
        raise ModelError("无法连接模型中转站，请检查后端网络和中转地址。") from None
    except (ValueError, TypeError, KeyError, AttributeError):
        # 不把上游正文或异常原文返回前端，避免其中包含认证信息。
        raise ModelError("模型配置或中转站返回格式不正确，请检查后端配置和 Responses 接口。") from None


async def request_model(settings: Settings, messages: list[ChatMessage], instructions: str) -> ChatResponse:
    """等完整回答再返回；功能块等不需要逐字显示的调用使用这个入口。"""
    async for item in stream_model(settings, messages, instructions):
        if isinstance(item, ChatResponse):
            return item
    raise ModelError("中转站连接提前结束，没有收到完整回答。")
