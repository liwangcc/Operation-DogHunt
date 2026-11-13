"""ESPN 伤病列表（非官方公开接口，不需要 Key）。

接口没有文档，字段可能变化或被限制访问，服务条款未核实；只作为可选资料，失败不影响盘口。
一次请求约 1 MB、常需 5 到 15 秒；本模块不自动重试。
"""

import httpx

ENDPOINT = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
TIMEOUT_SECONDS = 25


class InjuryError(Exception):
    pass


def fetch_injuries() -> list[dict]:
    """返回按球队分组的原始列表：[{displayName, injuries: [...]}]。列表里没有的球队表示 ESPN 未列出伤病。"""
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS, follow_redirects=False) as client:
            response = client.get(ENDPOINT)
    except httpx.HTTPError:
        raise InjuryError("伤病接口连接失败或超时，未自动重试。") from None
    if response.status_code != 200:
        raise InjuryError(f"HTTP {response.status_code}：伤病接口返回错误。")
    try:
        payload = response.json()
    except ValueError:
        raise InjuryError("伤病接口没有返回有效 JSON。") from None
    teams = payload.get("injuries") if isinstance(payload, dict) else None
    if not isinstance(teams, list):
        raise InjuryError("伤病接口返回格式不符合预期。")
    return teams
