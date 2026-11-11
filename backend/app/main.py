"""应用入口：只组装配置和接口，业务处理放在 services 中。"""

from fastapi import FastAPI

from app import __version__
from app.api.router import api_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version=__version__,
        description="NBA 聊天助手后端：服务检查、中转模型配置状态与聊天。",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    application.include_router(api_router, prefix="/api/v1")
    return application


app = create_app()
