from fastapi import APIRouter

from app.api.routes.chat import router as chat_router
from app.api.routes.health import router as health_router
from app.api.routes.odds import router as odds_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(odds_router)
api_router.include_router(chat_router)
