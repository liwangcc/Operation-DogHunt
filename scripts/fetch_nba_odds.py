#!/usr/bin/env python3
"""单次获取 NBA 赛前全场盘口。仅使用 Python 标准库，不自动重试。"""

import csv
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = 'https://api.the-odds-api.com/v4/sports/basketball_nba/odds/'
FIELDS = [
    'event_id', 'commence_time', 'home_team', 'away_team',
    'bookmaker', 'bookmaker_name', 'market', 'selection',
    'point', 'price_decimal', 'market_last_update', 'fetched_at',
]


class FetchError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    # 不把带 Key 的请求转发到其他地址。
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def load_key():
    key = os.environ.get('THE_ODDS_API_KEY', '').strip()
    config = ROOT / '.env.local'
    if not key and config.exists():
        for line in config.read_text(encoding='utf-8').splitlines():
            name, sep, value = line.strip().partition('=')
            if sep and name.strip() == 'THE_ODDS_API_KEY':
                key = value.strip()
                if len(key) >= 2 and key[0] == key[-1] and key[0] in "\"'":
                    key = key[1:-1]
                break
    if not key or key in {'YOUR_API_KEY', 'YOUR_KEY'} or any(c.isspace() for c in key):
        raise FetchError('请先在项目 .env.local 中填写有效的 THE_ODDS_API_KEY 并保存。')
    return key


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def normalize(events, fetched_at):
    """每个平台、市场、选择单独一行，不将不同来源的盘口拼接。"""
    rows = []
    upcoming = []
    for event in events:
        try:
            start = datetime.fromisoformat(event['commence_time'].replace('Z', '+00:00'))
            if start.tzinfo is None:
                raise ValueError('缺少时区')
        except (KeyError, ValueError, TypeError, AttributeError):
            raise FetchError('响应中有比赛缺少有效开赛时间，本次不保存为赛前盘口。') from None
        if start <= fetched_at:
            continue
        upcoming.append(event)
        for bookmaker in event.get('bookmakers', []):
            for market in bookmaker.get('markets', []):
                if market.get('key') not in {'spreads', 'totals'}:
                    continue
                for outcome in market.get('outcomes', []):
                    if outcome.get('point') is None:
                        continue
                    rows.append({
                        'event_id': event['id'],
                        'commence_time': event['commence_time'],
                        'home_team': event['home_team'],
                        'away_team': event['away_team'],
                        'bookmaker': bookmaker['key'],
                        'bookmaker_name': bookmaker.get('title', bookmaker['key']),
                        'market': market['key'],
                        'selection': outcome['name'],
                        'point': outcome['point'],
                        'price_decimal': outcome.get('price'),
                        'market_last_update': market.get('last_update'),
                        'fetched_at': iso(fetched_at),
                    })
    return upcoming, rows


def fetch(key, requested_at):
    params = {
        'apiKey': key, 'regions': 'us', 'markets': 'spreads,totals',
        'oddsFormat': 'decimal', 'dateFormat': 'iso',
        'commenceTimeFrom': iso(requested_at),
    }
    try:
        with build_opener(NoRedirect()).open(ENDPOINT + '?' + urlencode(params), timeout=15) as response:
            payload = json.load(response)
            quota = {
                name: response.headers.get('x-requests-' + name)
                for name in ('last', 'remaining', 'used')
            }
    except HTTPError as error:
        messages = {
            401: 'Key 无效、账号无权限或额度不足，请检查账号和邮件中的 Key。',
            403: '访问被拒绝，请检查账号权限。',
            422: '接口拒绝请求参数，需要重新核对官方文档。',
            429: '请求过于频繁，本次已停止，没有自动重试。',
        }
        raise FetchError(f'HTTP {error.code}：' + messages.get(error.code, '数据服务返回错误，本次已停止。')) from None
    except (URLError, TimeoutError, OSError):
        # 不输出异常原文，避免异常 URL 中的 Key 进入日志。
        raise FetchError('连接失败或超时，本次已停止；请检查网络，未自动重试。') from None
    except (ValueError, UnicodeError):
        raise FetchError('接口没有返回有效 JSON，本次不保存盘口。') from None
    if not isinstance(payload, list):
        raise FetchError('接口返回格式不符合预期，本次不保存盘口。')
    return payload, quota


def save_snapshot(events, rows, quota, requested_at, fetched_at):
    folder = ROOT / 'data' / 'odds' / (fetched_at.strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8])
    folder.mkdir(parents=True, exist_ok=False)
    snapshot = {
        'provider': 'The Odds API', 'sport': 'basketball_nba',
        'region': 'us', 'markets': ['spreads', 'totals'],
        'odds_format': 'decimal', 'requested_at': iso(requested_at),
        'fetched_at': iso(fetched_at), 'quota': quota,
        'raw_events': events, 'rows': rows,
    }
    with (folder / 'snapshot.json').open('x', encoding='utf-8') as output:
        json.dump(snapshot, output, ensure_ascii=False, indent=2)
    with (folder / 'odds.csv').open('x', encoding='utf-8-sig', newline='') as output:
        writer = csv.DictWriter(output, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return folder


def main():
    try:
        key = load_key()
        requested_at = datetime.now(timezone.utc)
        events, quota = fetch(key, requested_at)
        fetched_at = datetime.now(timezone.utc)
        upcoming, rows = normalize(events, fetched_at)
        folder = save_snapshot(events, rows, quota, requested_at, fetched_at)
    except FetchError as error:
        print('取数未完成：' + str(error), file=sys.stderr)
        return 1
    except (OSError, KeyError, TypeError, ValueError):
        print('保存失败或数据字段不符合预期；请检查磁盘权限和接口格式。Key 未输出。', file=sys.stderr)
        return 1
    print(f'请求成功：{len(upcoming)} 场未到开赛时间的比赛，{len(rows)} 条盘口选择记录。')
    print(f'本次消耗：{quota["last"]} credits；剩余额度：{quota["remaining"]} credits。')
    print(f'数据目录：{folder}')
    if not rows:
        print('当前没有可用的赛前盘口。可能尚未开盘或所选地区无覆盖，不代表全天没有比赛。')
    else:
        print('以下展示前 12 条，完整数据见 odds.csv（每个平台的每个方向单独一行）：')
        for row in rows[:12]:
            label = '让分' if row['market'] == 'spreads' else '大小分'
            print(f'{row["away_team"]} @ {row["home_team"]} | {row["bookmaker_name"]} | '
                  f'{label} {row["selection"]} {row["point"]} | 赔率 {row["price_decimal"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
