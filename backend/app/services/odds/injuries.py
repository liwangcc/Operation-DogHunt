"""伤病快照：更新盘口后在后台从 ESPN 取一次全联盟伤病列表，聊天时只给相关比赛的两队。

聊天只读本地文件，不访问外部服务。ESPN 是非官方接口，可能滞后于球队官方报告。
"""

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.integrations import espn
from app.integrations.odds import PROJECT_ROOT
from app.schemas.odds import OddsEvent
from app.services.odds.schedule import TEAM_BY_ABBR

logger = logging.getLogger(__name__)
INJURY_ROOT = PROJECT_ROOT / "data" / "injuries"
# 超过这个时长的伤病列表标为 stale，提醒模型出场状态可能已变。
STALE_HOURS = 12
COMMENT_CHARS = 160
TEAMS = set(TEAM_BY_ABBR.values())
# ESPN 写法 → The Odds API 全名；其余 29 队两边一致。
ESPN_NAMES = {"LA Clippers": "Los Angeles Clippers"}


def _text(value: object) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def normalize_injuries(raw_teams: list[dict]) -> dict[str, list[dict]]:
    """只留下能对上 30 队的球队；球员只保留判断出场需要的字段。全都对不上时视为格式变化。"""
    teams: dict[str, list[dict]] = {}
    for raw in raw_teams:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("displayName", ""))
        team = ESPN_NAMES.get(name, name)
        if team not in TEAMS or not isinstance(raw.get("injuries"), list):
            continue
        players = []
        for item in raw["injuries"]:
            athlete = item.get("athlete") if isinstance(item, dict) else None
            player = _text(athlete.get("displayName")) if isinstance(athlete, dict) else None
            if not player:
                continue
            details = item.get("details") if isinstance(item.get("details"), dict) else {}
            position = athlete.get("position") if isinstance(athlete.get("position"), dict) else {}
            comment = _text(item.get("shortComment"))
            players.append({
                "player": player, "position": _text(position.get("abbreviation")), "status": _text(item.get("status")),
                "reported": _text(item.get("date")), "injury": _text(details.get("type")),
                "return_date": _text(details.get("returnDate")),
                "comment": comment[:COMMENT_CHARS] if comment else None,
            })
        players.sort(key=lambda p: (p["status"] != "Out", p["player"]))
        teams[team] = players
    if raw_teams and not teams:
        raise ValueError("伤病列表里没有可识别的球队")
    return teams


def refresh_injuries(events: list[OddsEvent], root: Path | None = None) -> str:
    """取数失败不影响盘口更新；返回一句结果给日志。"""
    if not events:
        return "没有已开盘比赛，跳过伤病"
    try:
        teams = normalize_injuries(espn.fetch_injuries())
        fetched = datetime.now(timezone.utc)
        folder = (root or INJURY_ROOT) / (fetched.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
        folder.mkdir(parents=True, exist_ok=False)
        record = {"provider": "ESPN", "fetched_at": fetched.isoformat(timespec="seconds").replace("+00:00", "Z"), "teams": teams}
        with (folder / "injuries.json").open("x", encoding="utf-8") as output:
            json.dump(record, output, ensure_ascii=False, indent=2)
        return f"伤病已保存 {len(teams)} 队 {sum(map(len, teams.values()))} 人"
    except espn.InjuryError as error:
        return f"伤病未更新：{error}"
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return "伤病未更新：数据格式异常或保存失败"


def load_injuries(root: Path | None = None) -> dict | None:
    """读最新一份；损坏时返回 None，不回退到更旧的文件。"""
    paths = sorted((root or INJURY_ROOT).glob("*/injuries.json"))
    if not paths:
        return None
    try:
        record = json.loads(paths[-1].read_text(encoding="utf-8"))
        datetime.fromisoformat(record["fetched_at"].replace("Z", "+00:00"))
        if not isinstance(record["teams"], dict) or not all(isinstance(v, list) for v in record["teams"].values()):
            return None
        return record
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return None


def _team(record: dict, team: str) -> dict:
    if team in record["teams"]:
        return {"team": team, "listed": True, "players": record["teams"][team]}
    return {"team": team, "listed": False, "players": []}


def injury_context(record: dict | None, events: list[OddsEvent], now: datetime | None = None) -> dict:
    if record is None:
        return {"status": "unavailable", "reason": "没有保存的伤病列表；更新一次盘口后会在后台获取"}
    fetched = datetime.fromisoformat(record["fetched_at"].replace("Z", "+00:00"))
    stale = (now or datetime.now(timezone.utc)) - fetched > timedelta(hours=STALE_HOURS)
    return {
        "status": "available", "provider": record.get("provider"), "fetched_at": record["fetched_at"], "stale": stale,
        "note": "ESPN 非官方接口，可能滞后于球队官方伤病报告；listed 为 false 表示 ESPN 未列出该队伤病，不等于确认全员可出场",
        "events": {event.id: {"home": _team(record, event.home_team), "away": _team(record, event.away_team)} for event in events},
    }


def log_refresh(events: list[OddsEvent]) -> None:
    try:
        logger.info(refresh_injuries(events))
    except Exception:  # 可选步骤：任何意外都不能影响已保存的盘口。
        logger.warning("伤病未更新：意外错误")
