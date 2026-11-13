"""从保存的快照计算市场信号：多平台共识、各边最好的线、所选平台的差价、盘口随时间的变动。

只读本地快照，不访问外部服务。让分统一用主队视角的让分点（主队 +8.5 记为 8.5，-3.5 记为 -3.5）。
"""

import json
from functools import lru_cache
from pathlib import Path
from statistics import median

from app.schemas.odds import OddsBoard, OddsEvent
from app.services.odds.board import SNAPSHOT_ROOT, build_board

# 事件 → 平台 → (主队让分点, 总分线)；缺哪个玩法就是 None。
Lines = dict[str, dict[str, tuple[float | None, float | None]]]
HISTORY_LIMIT = 60


def event_lines(event: OddsEvent) -> dict[str, tuple[float | None, float | None]]:
    result = {}
    for book in event.bookmakers:
        home = total = None
        for market in book.markets:
            if market.key == "spreads":
                for outcome in market.outcomes:
                    if outcome.selection == event.home_team:
                        home = outcome.point
                    elif outcome.selection == event.away_team and home is None:
                        home = -outcome.point
            elif market.key == "totals" and market.outcomes:
                total = market.outcomes[0].point
        result[book.key] = (home, total)
    return result


def board_lines(board: OddsBoard) -> Lines:
    return {event.id: event_lines(event) for event in board.events}


@lru_cache(maxsize=HISTORY_LIMIT * 2)
def _file_lines(path: str) -> tuple[str, Lines] | None:
    # 快照文件以独占方式新建、之后不再改写，按路径缓存是安全的。
    try:
        board = build_board(json.loads(Path(path).read_text(encoding="utf-8")))
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return None
    return (board.fetched_at or "", board_lines(board))


def load_history(root: Path | None = None) -> list[tuple[str, Lines]]:
    """按采集时间从早到晚返回最近的快照线；损坏的文件跳过。"""
    paths = sorted((root or SNAPSHOT_ROOT).glob("*/snapshot.json"))[-HISTORY_LIMIT:]
    return [item for path in paths if (item := _file_lines(str(path))) is not None]


def _median(values: list[float]) -> float | None:
    return round(median(values), 2) if values else None


def _consensus(lines: dict[str, tuple[float | None, float | None]]) -> tuple[float | None, float | None]:
    return (_median([h for h, _ in lines.values() if h is not None]), _median([t for _, t in lines.values() if t is not None]))


def _books_at(lines: dict, index: int, value: float) -> list[str]:
    return sorted(key for key, pair in lines.items() if pair[index] == value)


def _signal(event: OddsEvent, history: list[tuple[str, Lines]], current_at: str, selected_book: str | None) -> dict:
    lines = event_lines(event)
    homes = [h for h, _ in lines.values() if h is not None]
    totals = [t for _, t in lines.values() if t is not None]
    home_mid, total_mid = _consensus(lines)
    result: dict = {"books": len(lines)}
    if homes:
        best_home, best_away = max(homes), min(homes)
        result["spread"] = {
            "consensus_home_point": home_mid,
            "home_point_range": [min(homes), max(homes)],
            "best_for_home": {"team": event.home_team, "point": best_home, "books": _books_at(lines, 0, best_home)},
            "best_for_away": {"team": event.away_team, "point": -best_away, "books": _books_at(lines, 0, best_away)},
        }
    if totals:
        result["total"] = {
            "consensus": total_mid,
            "range": [min(totals), max(totals)],
            "best_for_over": {"point": min(totals), "books": _books_at(lines, 1, min(totals))},
            "best_for_under": {"point": max(totals), "books": _books_at(lines, 1, max(totals))},
        }
    if selected_book and selected_book in lines:
        home, total = lines[selected_book]
        if home is not None and home_mid is not None:
            diff = round(home - home_mid, 2)
            result["spread"]["selected"] = {
                "book": selected_book, "home_point": home, "diff_vs_consensus": diff,
                "better_for": event.home_team if diff > 0 else event.away_team if diff < 0 else None,
            }
        if total is not None and total_mid is not None:
            diff = round(total - total_mid, 2)
            result["total"]["selected"] = {
                "book": selected_book, "point": total, "diff_vs_consensus": diff,
                "better_for": "Under" if diff > 0 else "Over" if diff < 0 else None,
            }

    # 盘口变动：同一场在每份快照里的共识线，取最早一份和当前对比。
    points = [(at, snap[event.id]) for at, snap in history if event.id in snap and at != current_at]
    points.append((current_at, lines))
    first_at, first_lines = points[0]
    first_home, first_total = _consensus(first_lines)
    movement: dict = {"snapshots": len(points), "first_fetched_at": first_at, "latest_fetched_at": current_at}
    if len(points) > 1:
        movement["consensus_home_point"] = [first_home, home_mid]
        movement["consensus_total"] = [first_total, total_mid]
        if selected_book:
            opened = next((snap[selected_book] for _, snap in points if selected_book in snap), None)
            if opened and selected_book in lines:
                movement["selected_home_point"] = [opened[0], lines[selected_book][0]]
                movement["selected_total"] = [opened[1], lines[selected_book][1]]
    result["movement"] = movement
    return result


def market_signals(board: OddsBoard, events: list[OddsEvent], selected_book: str | None, history: list[tuple[str, Lines]]) -> dict[str, dict]:
    """events 用完整平台的比赛（不是按所选平台裁剪后的），否则无法计算共识。"""
    return {event.id: _signal(event, history, board.fetched_at or "", selected_book) for event in events}
