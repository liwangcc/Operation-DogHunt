from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.integrations.llm import ModelError
from app.schemas.chat import ChatRequest, ChatResponse, ModelStatus
from app.services.chat.service import chat

router = APIRouter(tags=["chat"])


@router.get("/model", response_model=ModelStatus)
async def model_status(settings: Annotated[Settings, Depends(get_settings)]) -> ModelStatus:
    # 仅检查配置是否齐全，不请求中转站、不消耗额度，也不返回认证信息。
    return ModelStatus(configured=settings.model_configured, model=settings.model_name or None, timeout_seconds=settings.model_timeout_seconds)


@router.post("/chat", response_model=ChatResponse)
async def send_chat(request: ChatRequest, settings: Annotated[Settings, Depends(get_settings)]) -> ChatResponse:
    try:
        return await chat(request, settings)
    except ModelError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from None
