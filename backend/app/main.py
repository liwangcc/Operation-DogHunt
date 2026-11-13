"""应用入口：只组装配置和接口，业务处理放在 services 中。"""

import logging

from fastapi import FastAPI

from app import __version__
from app.api.router import api_router
from app.core.config import get_settings


def _configure_logging() -> None:
    """uvicorn 只给自己的日志器配输出；app.* 的 INFO（模型耗时、提示词版本）需要单独输出到终端。"""
    logger = logging.getLogger("app")
    if logger.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def create_app() -> FastAPI:
    _configure_logging()
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
