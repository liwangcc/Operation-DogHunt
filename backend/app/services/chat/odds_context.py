"""只读网站同一份盘口快照，不调用外部取数接口，不接受浏览器提供的报价。"""

import json

from app.integrations.llm import ModelError
from app.schemas.chat import OddsSelection
from app.schemas.odds import OddsBoard


def odds_context(board: OddsBoard, selection: OddsSelection | None) -> str:
    events = board.events
    if selection:
        event = next((event for event in events if event.id == selection.event_id), None)
        if event is None:
            raise ModelError("所选比赛已不在最新保存的数据中，请到比赛与盘口重新选场，或取消选场后再问。", 409)
        book = next((book for book in event.bookmakers if book.key == selection.bookmaker_key), None)
        if book is None:
            raise ModelError("所选平台在最新保存的数据中已无报价，请到比赛与盘口重新选择平台。", 409)
        events = [event.model_copy(update={"bookmakers": [book]})]

    payload = {
        "status": board.status,
        "provider": board.provider,
        "fetched_at": board.fetched_at,
        "stale": board.stale,
        "message": board.message,
        "selection": selection.model_dump() if selection else None,
        "events": [event.model_dump() for event in events],
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
