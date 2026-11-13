"""只读网站同一份盘口快照，不调用外部取数接口，不接受浏览器提供的报价。"""

import json
import re

from app.integrations.llm import ModelError
from app.schemas.chat import ChatMessage, OddsSelection
from app.schemas.odds import OddsBoard
from app.services.odds.injuries import injury_context
from app.services.odds.schedule import rest_context
from app.services.odds.signals import Lines, market_signals
from app.services.odds.team_form import form_context

# 只有聚焦到少数比赛时才附带市场信号、赛程、战绩和伤病；列整张表时不需要，也避免输入过长。
SIGNAL_EVENT_LIMIT = 3

# 球队全名（与 The Odds API 一致）→ 用户常用叫法。英文按整词匹配，中文按包含匹配。
TEAM_ALIASES: dict[str, tuple[str, ...]] = {
    "Atlanta Hawks": ("老鹰", "hawks"),
    "Boston Celtics": ("凯尔特人", "绿军", "celtics"),
    "Brooklyn Nets": ("篮网", "nets"),
    "Charlotte Hornets": ("黄蜂", "hornets"),
    "Chicago Bulls": ("公牛", "bulls"),
    "Cleveland Cavaliers": ("骑士", "cavaliers", "cavs"),
    "Dallas Mavericks": ("独行侠", "小牛", "mavericks", "mavs"),
    "Denver Nuggets": ("掘金", "nuggets"),
    "Detroit Pistons": ("活塞", "pistons"),
    "Golden State Warriors": ("勇士", "warriors"),
    "Houston Rockets": ("火箭", "rockets"),
    "Indiana Pacers": ("步行者", "pacers"),
    "Los Angeles Clippers": ("快船", "clippers"),
    "Los Angeles Lakers": ("湖人", "lakers"),
    "Memphis Grizzlies": ("灰熊", "grizzlies"),
    "Miami Heat": ("热火", "heat"),
    "Milwaukee Bucks": ("雄鹿", "bucks"),
    "Minnesota Timberwolves": ("森林狼", "timberwolves", "wolves"),
    "New Orleans Pelicans": ("鹈鹕", "pelicans"),
    "New York Knicks": ("尼克斯", "knicks"),
    "Oklahoma City Thunder": ("雷霆", "thunder"),
    "Orlando Magic": ("魔术", "magic"),
    "Philadelphia 76ers": ("76人", "七六人", "76ers", "sixers"),
    "Phoenix Suns": ("太阳", "suns"),
    "Portland Trail Blazers": ("开拓者", "blazers"),
    "Sacramento Kings": ("国王", "kings"),
    "San Antonio Spurs": ("马刺", "spurs"),
    "Toronto Raptors": ("猛龙", "raptors"),
    "Utah Jazz": ("爵士", "jazz"),
    "Washington Wizards": ("奇才", "wizards"),
}


def mentioned_teams(text: str) -> set[str]:
    lowered = text.lower()
    found = set()
    for team, aliases in TEAM_ALIASES.items():
        for alias in aliases:
            hit = alias in text if not alias.isascii() else re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", lowered)
            if hit:
                found.add(team)
                break
    return found


def focus_teams(messages: list[ChatMessage]) -> set[str]:
    """从最近一条提到球队的用户消息里取球队，让“那大小分呢”这类追问沿用上文的比赛。"""
    for message in reversed(messages):
        if message.role == "user" and (teams := mentioned_teams(message.content)):
            return teams
    return set()


def odds_context(board: OddsBoard, selection: OddsSelection | None, messages: list[ChatMessage] | None = None,
                 history: list[tuple[str, Lines]] | None = None, schedule: dict | None = None,
                 injuries: dict | None = None) -> str:
    """schedule、injuries 是 load_schedule、load_injuries 的结果，None 表示没有可用资料。"""
    events = board.events
    focus = None
    if not selection and messages and (teams := focus_teams(messages)):
        # 未选场但问到具体球队时只给相关比赛，减少输入；找不到时给空列表并说明，不回退到整张表。
        matched = [event for event in events if {event.home_team, event.away_team} & teams]
        focus = {"teams": sorted(teams), "matched_events": len(matched), "total_events": len(events)}
        events = matched
    if selection:
        event = next((event for event in events if event.id == selection.event_id), None)
        if event is None:
            raise ModelError("所选比赛已不在最新保存的数据中，请到比赛与盘口重新选场，或取消选场后再问。", 409)
        book = next((book for book in event.bookmakers if book.key == selection.bookmaker_key), None)
        if book is None:
            raise ModelError("所选平台在最新保存的数据中已无报价，请到比赛与盘口重新选择平台。", 409)
        signals = market_signals(board, [event], selection.bookmaker_key, history) if history is not None else None
        events = [event.model_copy(update={"bookmakers": [book]})]
        few = True
    else:
        few = 0 < len(events) <= SIGNAL_EVENT_LIMIT
        signals = market_signals(board, events, None, history) if history is not None and few else None

    payload = {
        "status": board.status,
        "provider": board.provider,
        "fetched_at": board.fetched_at,
        "stale": board.stale,
        "message": board.message,
        "selection": selection.model_dump() if selection else None,
        "focus": focus,
        "events": [event.model_dump() for event in events],
        "market_signals": signals,
        "schedule_rest": rest_context(schedule, events) if few else None,
        "team_form": form_context(schedule, events) if few else None,
        "injuries": injury_context(injuries, events) if few else None,
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
