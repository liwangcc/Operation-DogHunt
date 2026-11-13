"""赛程快照：更新盘口后在后台从 BALLDONTLIE 取一次近 30 天赛程与比分，聊天时据此算休息天数、背靠背和近期战绩（team_form）。

聊天只读本地文件，不访问外部服务。日期一律用美国东部日期，和 NBA 官方赛程日期一致。
"""

import json
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from app.integrations import balldontlie
from app.integrations.odds import PROJECT_ROOT
from app.schemas.odds import OddsEvent

logger = logging.getLogger(__name__)
SCHEDULE_ROOT = PROJECT_ROOT / "data" / "schedule"
# 固定 UTC-5，不用 ZoneInfo：Windows 默认没有 tzdata。夏令时期间只有东部 0 点到 1 点开赛才会差一天，NBA 没有这个时段的比赛。
EASTERN = timezone(timedelta(hours=-5))
# 往前看几天：上一场在这几天之外时记为“至少休 5 天”。
LOOKBACK_DAYS = 5
# 近期战绩取更新当天往前几天的已结束比赛；30 天约 14 场，够算近 10 场，翻页约 3 页。
FORM_DAYS = 30

# BALLDONTLIE 缩写 → The Odds API 全名（快船在两边写法不同，不按全名直接比）。
TEAM_BY_ABBR = {
    "ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "BKN": "Brooklyn Nets", "CHA": "Charlotte Hornets",
    "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers", "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets",
    "DET": "Detroit Pistons", "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
    "LAC": "Los Angeles Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies", "MIA": "Miami Heat",
    "MIL": "Milwaukee Bucks", "MIN": "Minnesota Timberwolves", "NOP": "New Orleans Pelicans", "NYK": "New York Knicks",
    "OKC": "Oklahoma City Thunder", "ORL": "Orlando Magic", "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns",
    "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs", "TOR": "Toronto Raptors",
    "UTA": "Utah Jazz", "WAS": "Washington Wizards",
}


def us_date(commence_time: str) -> date:
    return datetime.fromisoformat(commence_time.replace("Z", "+00:00")).astimezone(EASTERN).date()


def _team(raw: object) -> str | None:
    if not isinstance(raw, dict):
        return None
    return TEAM_BY_ABBR.get(str(raw.get("abbreviation", "")).upper())


def _final_scores(raw: dict) -> tuple[int, int] | None:
    finished = raw.get("status_state") == "final" if "status_state" in raw else raw.get("status") == "Final"
    home, away = raw.get("home_team_score"), raw.get("visitor_team_score")
    if finished and type(home) is int and type(away) is int and home + away > 0:
        return home, away
    return None


def normalize_games(raw_games: list[dict]) -> list[dict]:
    """只留下双方都能对上 30 队、日期有效、没有延期的比赛；已结束的比赛带比分。"""
    games = []
    for raw in raw_games:
        if not isinstance(raw, dict) or raw.get("postponed"):
            continue
        home, away = _team(raw.get("home_team")), _team(raw.get("visitor_team"))
        try:
            day = date.fromisoformat(str(raw.get("date", ""))[:10])
        except ValueError:
            continue
        if home and away:
            game = {"id": raw.get("id"), "date": day.isoformat(), "home": home, "away": away, "status": raw.get("status")}
            if scores := _final_scores(raw):
                game["home_score"], game["away_score"] = scores
            games.append(game)
    games.sort(key=lambda game: (game["date"], game["home"]))
    return games


def needed_dates(events: list[OddsEvent], today: date) -> list[str]:
    """每场比赛的东部日期及之前 LOOKBACK_DAYS 天，加上 today（东部日期）及之前 FORM_DAYS 天。"""
    days = {us_date(event.commence_time) for event in events}
    rest = {(day - timedelta(days=back)).isoformat() for day in days for back in range(LOOKBACK_DAYS + 1)}
    form = {(today - timedelta(days=back)).isoformat() for back in range(FORM_DAYS + 1)}
    return sorted(rest | form)


def refresh_schedule(events: list[OddsEvent], root: Path | None = None, today: date | None = None) -> str:
    """取数失败不影响盘口更新；返回一句结果给日志。没配置 Key 时不请求。"""
    if not events:
        return "没有已开盘比赛，跳过赛程"
    try:
        key = balldontlie.load_key()
        if key is None:
            return f"未配置 {balldontlie.KEY_NAME}，跳过赛程"
        today = today or datetime.now(EASTERN).date()
        dates = needed_dates(events, today)
        games = normalize_games(balldontlie.fetch_games(key, dates))
        fetched = datetime.now(timezone.utc)
        folder = (root or SCHEDULE_ROOT) / (fetched.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
        folder.mkdir(parents=True, exist_ok=False)
        record = {"provider": "BALLDONTLIE", "fetched_at": fetched.isoformat(timespec="seconds").replace("+00:00", "Z"),
                  "dates": dates, "form_from": (today - timedelta(days=FORM_DAYS)).isoformat(), "games": games}
        with (folder / "schedule.json").open("x", encoding="utf-8") as output:
            json.dump(record, output, ensure_ascii=False, indent=2)
        finals = sum("home_score" in game for game in games)
        return f"赛程已保存 {len(games)} 场，其中 {finals} 场有比分（{len(dates)} 个日期，{dates[0]} 至 {dates[-1]}）"
    except balldontlie.ScheduleError as error:
        return f"赛程未更新：{error}"
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return "赛程未更新：数据格式异常或保存失败"


def load_schedule(root: Path | None = None) -> dict | None:
    """读最新一份；损坏时返回 None，不回退到更旧的文件。"""
    paths = sorted((root or SCHEDULE_ROOT).glob("*/schedule.json"))
    if not paths:
        return None
    try:
        record = json.loads(paths[-1].read_text(encoding="utf-8"))
        for day in record["dates"]:
            date.fromisoformat(day)
        if not isinstance(record["games"], list):
            return None
        return record
    except (OSError, ValueError, TypeError, KeyError):
        return None


def _team_rest(games: list[dict], team: str, day: date) -> dict:
    played = [g for g in games if team in (g["home"], g["away"]) and g["date"] < day.isoformat()]
    result: dict = {"team": team}
    if played:
        last = played[-1]
        rest = (day - date.fromisoformat(last["date"])).days - 1
        result.update({
            "rest_days": rest, "back_to_back": rest == 0,
            "previous_game": {"date": last["date"], "opponent": last["away"] if last["home"] == team else last["home"],
                              "venue": "home" if last["home"] == team else "away"},
        })
    else:
        result.update({"rest_days": None, "rest_days_at_least": LOOKBACK_DAYS, "back_to_back": False, "previous_game": None})
    recent = [g for g in played if g["date"] >= (day - timedelta(days=3)).isoformat()]
    result["games_in_4_days"] = len(recent) + 1  # 含本场
    return result


def rest_context(schedule: dict | None, events: list[OddsEvent]) -> dict:
    if schedule is None:
        return {"status": "unavailable", "reason": "没有保存的赛程；需要配置 BALLDONTLIE Key 后再更新一次盘口"}
    games, covered = schedule["games"], set(schedule["dates"])
    result: dict = {"status": "available", "provider": schedule.get("provider"), "fetched_at": schedule.get("fetched_at"), "events": {}}
    for event in events:
        day = us_date(event.commence_time)
        if any((day - timedelta(days=back)).isoformat() not in covered for back in range(LOOKBACK_DAYS + 1)):
            result["events"][event.id] = {"status": "not_covered", "us_date": day.isoformat()}
            continue
        listed = any(g["date"] == day.isoformat() and g["home"] == event.home_team and g["away"] == event.away_team for g in games)
        result["events"][event.id] = {
            "status": "available", "us_date": day.isoformat(), "listed_in_schedule": listed,
            "home": _team_rest(games, event.home_team, day),
            "away": _team_rest(games, event.away_team, day),
        }
    return result


def log_refresh(events: list[OddsEvent]) -> None:
    try:
        logger.info(refresh_schedule(events))
    except Exception:  # 可选步骤：任何意外都不能让已保存的盘口更新变成失败。
        logger.warning("赛程未更新：意外错误")
