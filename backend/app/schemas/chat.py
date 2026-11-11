from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class OddsSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    event_id: str = Field(min_length=1, max_length=200)
    bookmaker_key: str = Field(min_length=1, max_length=200)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage] = Field(min_length=1, max_length=41)
    odds_selection: OddsSelection | None = None

    @field_validator("messages")
    @classmethod
    def validate_history(cls, messages: list[ChatMessage]) -> list[ChatMessage]:
        if any(m.role != ("user" if i % 2 == 0 else "assistant") for i, m in enumerate(messages)):
            raise ValueError("消息必须从用户开始，按用户和助手交替排列。")
        if messages[-1].role != "user":
            raise ValueError("最后一条必须是用户问题。")
        if sum(len(m.content) for m in messages) > 60000:
            raise ValueError("本次上下文过长，请开始新对话。")
        return messages


class TokenUsage(BaseModel):
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)


class ChatResponse(BaseModel):
    reply: str
    model: str
    usage: TokenUsage | None = None


class ModelStatus(BaseModel):
    configured: bool
    model: str | None
    timeout_seconds: int
