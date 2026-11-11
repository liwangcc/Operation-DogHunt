from fastapi import APIRouter, HTTPException, Request

from app.schemas.odds import OddsBoard
from app.services.odds.board import OddsRefreshError, read_board, refresh_board

router = APIRouter(prefix="/odds", tags=["odds"])


@router.get("", response_model=OddsBoard)
def get_odds() -> OddsBoard:
    return read_board()


@router.post("/refresh", response_model=OddsBoard)
def refresh_odds(request: Request) -> OddsBoard:
    # JSON 请求头让浏览器跨站表单无法触发消耗额度的取数；本站请求由 Vite 转发。
    if request.headers.get("content-type", "").split(";")[0].strip() != "application/json":
        raise HTTPException(status_code=415, detail="更新盘口需要 JSON 请求。")
    try:
        return refresh_board()
    except OddsRefreshError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from None
