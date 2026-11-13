"""近期战绩：用赛程快照里已结束比赛的比分算每队胜负、得失分和净胜分。只读本地文件，不访问外部服务。

比分是原始结果，没有按对手强弱、伤病和背靠背调整；样本场数一并给出，由提示词决定权重。
"""

from app.schemas.odds import OddsEvent
from app.services.odds.schedule import us_date

RECENT_GAMES = 10


def _avg(values: list[int]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def _record(rows: list[tuple[int, int]]) -> dict:
    """rows 是 (本队得分, 对手得分)。"""
    margins = [own - other for own, other in rows]
    return {"games": len(rows), "wins": sum(m > 0 for m in margins), "losses": sum(m < 0 for m in margins), "avg_margin": _avg(margins)}


def team_summary(games: list[dict], team: str, before: str) -> dict:
    """before 是本场的东部日期（YYYY-MM-DD），只统计这之前已结束的比赛。"""
    rows = []
    for game in games:
        if game["date"] >= before or "home_score" not in game or team not in (game["home"], game["away"]):
            continue
        home = game["home"] == team
        own, other = (game["home_score"], game["away_score"]) if home else (game["away_score"], game["home_score"])
        rows.append((game["date"], home, own, other))
    rows.sort()
    if not rows:
        return {"team": team, "games": 0}
    scores = [(own, other) for _, _, own, other in rows]
    return {
        "team": team,
        **_record(scores),
        "avg_points_for": _avg([own for own, _ in scores]),
        "avg_points_against": _avg([other for _, other in scores]),
        "avg_game_total": _avg([own + other for own, other in scores]),
        "at_home": _record([(own, other) for _, home, own, other in rows if home]),
        "on_road": _record([(own, other) for _, home, own, other in rows if not home]),
        f"last_{RECENT_GAMES}": _record(scores[-RECENT_GAMES:]),
        "last_game": rows[-1][0],
    }


def form_context(schedule: dict | None, events: list[OddsEvent]) -> dict:
    if schedule is None:
        return {"status": "unavailable", "reason": "没有保存的赛程比分；需要配置 BALLDONTLIE Key 后再更新一次盘口"}
    games = schedule["games"]
    finals = [game["date"] for game in games if "home_score" in game]
    if not finals:
        return {"status": "unavailable", "reason": "最新赛程文件里没有已结束比赛的比分（可能是旧格式），更新一次盘口后再问"}
    result: dict = {
        "status": "available", "provider": schedule.get("provider"), "fetched_at": schedule.get("fetched_at"),
        "window": {"from": schedule.get("form_from") or min(schedule["dates"]), "last_final": max(finals)},
        "note": "原始比分，未按对手强弱、伤病和赛程调整；games 是样本场数",
        "events": {},
    }
    for event in events:
        day = us_date(event.commence_time).isoformat()
        home, away = team_summary(games, event.home_team, day), team_summary(games, event.away_team, day)
        entry: dict = {"home": home, "away": away}
        if home["games"] and away["games"]:
            entry["home_minus_away_avg_margin"] = round(home["avg_margin"] - away["avg_margin"], 1)
        result["events"][event.id] = entry
    return result
