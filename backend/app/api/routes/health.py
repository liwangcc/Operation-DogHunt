from typing import Annotated

from fastapi import APIRouter, Depends

from app import __version__
from app.core.config import Settings, get_settings
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="检查后端是否运行")
def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    # 只说明应用进程可响应，不代表数据库、盘口或 GPT 已连通。
    return HealthResponse(
        app=settings.app_name,
        environment=settings.environment,
        version=__version__,
    )
