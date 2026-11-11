"""离线检查跨平台隔离、数据新鲜度与消耗额度的刷新边界。"""

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.odds import board


def snapshot():
    return {
        "fetched_at": "2026-11-11T23:59:00Z", "quota": {"last": "2", "remaining": "496"},
        "raw_events": [{
            "id": "game", "sport_key": "basketball_nba", "commence_time": "2026-11-12T00:10:00Z",
            "home_team": "Toronto Raptors", "away_team": "Boston Celtics",
            "bookmakers": [
                {"key": "a", "title": "Platform A", "markets": [
                    {"key": "spreads", "outcomes": [{"name": "Toronto Raptors", "point": 7.5, "price": 1.87}, {"name": "Boston Celtics", "point": -7.5, "price": 1.95}]},
                    {"key": "totals", "last_update": "invalid", "outcomes": [{"name": "Under", "point": 216.5, "price": 1.9}, {"name": "Over", "point": 215.5, "price": 1.8}]},
                ]},
                {"key": "b", "title": "Platform B", "markets": [
                    {"key": "spreads", "outcomes": [{"name": "Boston Celtics", "point": -6.5, "price": 1.91}]},
                ]},
            ],
        }],
    }


class OddsTests(unittest.TestCase):
    def test_platform_direction_and_independent_total_points(self):
        result = board.build_board(snapshot(), datetime(2026, 11, 12, tzinfo=timezone.utc))
        a, b = result.events[0].bookmakers
        home, away = a.markets[0].outcomes
        self.assertEqual((home.selection, home.point), ("Toronto Raptors", 7.5))
        self.assertEqual((away.selection, away.point), ("Boston Celtics", -7.5))
        self.assertEqual(b.markets[0].outcomes[0].point, -6.5)
        self.assertEqual([o.point for o in a.markets[1].outcomes], [216.5, 215.5])
        self.assertIsNone(a.markets[1].updated_at)
        self.assertEqual(len(b.markets), 1)  # 缺大小分时不从平台 A 补。
        self.assertFalse(result.stale)

    def test_stale_empty_and_future_timestamp(self):
        self.assertTrue(board.build_board(snapshot(), datetime(2026, 11, 13, tzinfo=timezone.utc)).stale)
        self.assertTrue(board.build_board(snapshot(), datetime(2026, 11, 10, tzinfo=timezone.utc)).stale)
        data = snapshot()
        data['raw_events'] = []
        self.assertEqual(board.build_board(data).status, 'empty')

    def test_missing_and_corrupted_latest_do_not_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(board.read_board(root).status, 'unavailable')
            (root / '20260101').mkdir()
            (root / '20260101' / 'snapshot.json').write_text(json.dumps(snapshot()))
            self.assertEqual(board.read_board(root).status, 'available')
            (root / '20260102').mkdir()
            (root / '20260102' / 'snapshot.json').write_text('{broken')
            self.assertEqual(board.read_board(root).status, 'unavailable')

    def test_refresh_success_and_cooldown_make_only_one_request(self):
        with patch.object(board, '_last_attempt', None), patch.object(board.odds_tool, 'load_key', return_value='test'), \
             patch.object(board.odds_tool, 'fetch', return_value=(snapshot()['raw_events'], {'last': '2'})) as fetch, \
             patch.object(board.odds_tool, 'save_snapshot') as save:
            result = board.refresh_board()
            self.assertEqual(result.status, 'available')
            with self.assertRaises(board.OddsRefreshError) as caught:
                board.refresh_board()
            self.assertEqual(caught.exception.status_code, 429)
            fetch.assert_called_once()
            save.assert_called_once()

    def test_failed_refresh_does_not_save_or_retry(self):
        with patch.object(board, '_last_attempt', None), patch.object(board.odds_tool, 'load_key', return_value='test'), \
             patch.object(board.odds_tool, 'fetch', side_effect=board.odds_tool.FetchError('连接失败')) as fetch, \
             patch.object(board.odds_tool, 'save_snapshot') as save:
            with self.assertRaises(board.OddsRefreshError):
                board.refresh_board()
            fetch.assert_called_once()
            save.assert_not_called()

    def test_get_has_no_external_call_and_form_cannot_refresh(self):
        with TestClient(create_app()) as client, patch.object(board.odds_tool, 'fetch') as fetch:
            response = client.get('/api/v1/odds')
            self.assertEqual(response.status_code, 200)
            self.assertIn(response.json()['status'], ['available', 'empty', 'unavailable'])
            self.assertEqual(client.post('/api/v1/odds/refresh', data={}).status_code, 415)
            fetch.assert_not_called()


if __name__ == '__main__':
    unittest.main()
