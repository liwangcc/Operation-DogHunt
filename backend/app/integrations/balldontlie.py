"""BALLDONTLIE 免费档赛程与比分（/v1/games）。Key 只放项目根目录 .env.local，不进入日志和接口响应。

免费档限 5 次/分钟；本模块不自动重试，翻页最多 MAX_PAGES 次（近 30 天约 220 场，每页 100 场）。
"""

import os

import httpx

from app.integrations.odds import PROJECT_ROOT

ENDPOINT = "https://api.balldontlie.io/v1/games"
KEY_NAME = "BALLDONTLIE_API_KEY"
MAX_PAGES = 4
TIMEOUT_SECONDS = 10


class ScheduleError(Exception):
    pass


def load_key() -> str | None:
    """没配置返回 None（赛程是可选资料）；配置了但格式不对才报错。"""
    key = os.environ.get(KEY_NAME, "").strip()
    config = PROJECT_ROOT / ".env.local"
    if not key and config.exists():
        for line in config.read_text(encoding="utf-8").splitlines():
            name, sep, value = line.strip().partition("=")
            if sep and name.strip() == KEY_NAME:
                key = value.strip()
                if len(key) >= 2 and key[0] == key[-1] and key[0] in "\"'":
                    key = key[1:-1]
                break
    if not key or key in {"YOUR_API_KEY", "YOUR_KEY"}:
        return None
    if any(c.isspace() for c in key):
        raise ScheduleError(f".env.local 中的 {KEY_NAME} 含空白字符，请检查。")
    return key


def fetch_games(key: str, dates: list[str]) -> list[dict]:
    """取指定日期（美国东部日期，YYYY-MM-DD）的全部比赛。按日期而不是起止范围取，盘口里有远期比赛时也不会拉整段赛程。"""
    games: list[dict] = []
    cursor = None
    with httpx.Client(timeout=TIMEOUT_SECONDS, follow_redirects=False) as client:
        for _ in range(MAX_PAGES):
            params: list[tuple[str, str | int]] = [("dates[]", day) for day in dates] + [("per_page", 100)]
            if cursor is not None:
                params.append(("cursor", cursor))
            try:
                response = client.get(ENDPOINT, params=params, headers={"Authorization": key})
            except httpx.HTTPError:
                # 不输出异常原文，避免请求头信息进入日志。
                raise ScheduleError("赛程接口连接失败或超时，未自动重试。") from None
            if response.status_code != 200:
                messages = {401: "Key 无效或账号无权访问比赛接口。", 429: "超过免费档 5 次/分钟限制，未自动重试。"}
                raise ScheduleError(f"HTTP {response.status_code}：" + messages.get(response.status_code, "赛程接口返回错误。"))
            try:
                payload = response.json()
            except ValueError:
                raise ScheduleError("赛程接口没有返回有效 JSON。") from None
            data = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(data, list):
                raise ScheduleError("赛程接口返回格式不符合预期。")
            games.extend(data)
            cursor = (payload.get("meta") or {}).get("next_cursor")
            if not cursor:
                return games
    raise ScheduleError(f"赛程超过 {MAX_PAGES} 页，本次不保存，避免不完整的休息天数和战绩。")
