"""查询快照不访问外部服务；手动刷新一次取数，新建快照并保留旧文件。"""

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from time import monotonic

from app.integrations.odds import PROJECT_ROOT, odds_tool
from app.schemas.odds import OddsBoard, OddsBookmaker, OddsEvent, OddsMarket, OddsOutcome
from app.services.odds import schedule

SNAPSHOT_ROOT = PROJECT_ROOT / "data" / "odds"
STALE_SECONDS = 15 * 60
REFRESH_COOLDOWN = 60
_refresh_lock = Lock()
_last_attempt: float | None = None


class OddsRefreshError(Exception):
    def __init__(self, message: str, status_code: int):
        self.message = message
        self.status_code = status_code


def parse_time(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("时间缺少时区")
    return result.astimezone(timezone.utc)


def finite_number(value: object) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
        return float(value)
    return None


def build_board(snapshot: dict, now: datetime | None = None) -> OddsBoard:
    now = now or datetime.now(timezone.utc)
    fetched = parse_time(snapshot["fetched_at"])
    age = (now - fetched).total_seconds()
    stale = age > STALE_SECONDS or age < -60
    raw_events = snapshot["raw_events"]
    if not isinstance(raw_events, list):
        raise ValueError("无效比赛列表")
    events = []
    for raw in raw_events:
        start = parse_time(raw["commence_time"])
        if raw.get("sport_key") != "basketball_nba":
            continue
        bookmakers = []
        for book in raw.get("bookmakers", []):
            markets = []
            for market in book.get("markets", []):
                key = market.get("key")
                if key not in {"spreads", "totals"}:
                    continue
                outcomes = []
                for outcome in market.get("outcomes", []):
                    selection = outcome.get("name")
                    allowed = {raw["away_team"], raw["home_team"]} if key == "spreads" else {"Over", "Under"}
                    point = finite_number(outcome.get("point"))
                    if selection not in allowed or point is None:
                        continue
                    price = finite_number(outcome.get("price"))
                    outcomes.append(OddsOutcome(selection=selection, point=point, price=price if price and price > 1 else None))
                if outcomes:
                    updated = market.get("last_update")
                    try:
                        updated = odds_tool.iso(parse_time(updated)) if updated else None
                    except (ValueError, TypeError, AttributeError):
                        updated = None
                    markets.append(OddsMarket(key=key, updated_at=updated, outcomes=outcomes))
            if markets:
                bookmakers.append(OddsBookmaker(key=book["key"], title=book.get("title", book["key"]), markets=markets))
        events.append(OddsEvent(
            id=raw["id"], commence_time=odds_tool.iso(start),
            home_team=raw["home_team"], away_team=raw["away_team"], bookmakers=bookmakers,
        ))
    events.sort(key=lambda event: (event.commence_time, event.id))
    message = "已保存的赛前报价，仅覆盖数据源已开盘的比赛，不是完整赛程或实时比分。"
    if stale:
        message = "这份数据已超过 15 分钟或时间异常，请手动更新后再参考盘口。"
    if not events:
        message = "数据源暂未返回已开盘比赛，不代表当天没有比赛。"
    raw_quota = snapshot.get("quota", {})
    quota = {key: str(raw_quota[key]) if raw_quota.get(key) is not None else None for key in ("last", "remaining", "used")}
    return OddsBoard(status="available" if events else "empty", fetched_at=odds_tool.iso(fetched),
                     stale=stale, message=message, events=events, quota=quota)


def read_board(root: Path | None = None) -> OddsBoard:
    """不跳过损坏的新快照去静默显示更旧的数据。"""
    try:
        paths = sorted((root or SNAPSHOT_ROOT).glob("*/snapshot.json"), reverse=True)
        if not paths:
            return OddsBoard(status="unavailable", message="还没有保存的盘口数据，点击更新盘口获取一次。")
        return build_board(json.loads(paths[0].read_text(encoding="utf-8")))
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return OddsBoard(status="unavailable", message="最新盘口文件无法读取，请手动更新；没有用旧数据冒充当前数据。")


def refresh_board() -> OddsBoard:
    global _last_attempt
    if not _refresh_lock.acquire(blocking=False):
        raise OddsRefreshError("盘口正在更新，请等待本次请求结束。", 409)
    try:
        if _last_attempt is not None and monotonic() - _last_attempt < REFRESH_COOLDOWN:
            raise OddsRefreshError("刚刚已尝试取数，请间隔 60 秒再更新，避免重复消耗额度。", 429)
        try:
            key = odds_tool.load_key()
        except odds_tool.FetchError as error:
            raise OddsRefreshError(str(error), 503) from None
        _last_attempt = monotonic()
        requested = datetime.now(timezone.utc)
        try:
            events, quota = odds_tool.fetch(key, requested)
            fetched = datetime.now(timezone.utc)
            _, rows = odds_tool.normalize(events, fetched)
            # 先验证网站会读取的结构，再写入新文件；失败保留旧快照。
            snapshot = {"fetched_at": odds_tool.iso(fetched), "raw_events": events, "quota": quota}
            board = build_board(snapshot, fetched)
            odds_tool.save_snapshot(events, rows, quota, requested, fetched)
        except odds_tool.FetchError as error:
            raise OddsRefreshError(str(error), 502) from None
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            raise OddsRefreshError("数据格式异常或新快照保存失败，已保留原有快照；本次请求可能已消耗额度。", 502) from None
        # 盘口已保存；赛程是可选资料，失败只记日志，不影响这次更新的结果。
        schedule.log_refresh(board.events)
        return board
    finally:
        _refresh_lock.release()
