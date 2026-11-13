"""离线检查跨平台隔离、数据新鲜度与消耗额度的刷新边界。"""

import json
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
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
             patch.object(board.odds_tool, 'save_snapshot') as save, patch.object(board, 'start_extras') as extras:
            result = board.refresh_board()
            extras.assert_called_once_with(result.events)
            self.assertEqual(result.status, 'available')
            with self.assertRaises(board.OddsRefreshError) as caught:
                board.refresh_board()
            self.assertEqual(caught.exception.status_code, 429)
            fetch.assert_called_once()
            save.assert_called_once()

    def test_failed_refresh_does_not_save_or_retry(self):
        with patch.object(board, '_last_attempt', None), patch.object(board.odds_tool, 'load_key', return_value='test'), \
             patch.object(board.odds_tool, 'fetch', side_effect=board.odds_tool.FetchError('连接失败')) as fetch, \
             patch.object(board.odds_tool, 'save_snapshot') as save, patch.object(board, 'start_extras') as extras:
            with self.assertRaises(board.OddsRefreshError):
                board.refresh_board()
            fetch.assert_called_once()
            save.assert_not_called()
            extras.assert_not_called()

    def test_extras_run_in_background_and_skip_while_busy(self):
        with patch.object(board.schedule, 'log_refresh') as schedule, patch.object(board.injuries, 'log_refresh') as injuries:
            with board._extras_lock:
                self.assertIsNone(board.start_extras([]))
            board.start_extras(['e']).join(5)
            schedule.assert_called_once_with(['e'])
            injuries.assert_called_once_with(['e'])
            self.assertFalse(board._extras_lock.locked())

    def test_get_has_no_external_call_and_form_cannot_refresh(self):
        with TestClient(create_app()) as client, patch.object(board.odds_tool, 'fetch') as fetch:
            response = client.get('/api/v1/odds')
            self.assertEqual(response.status_code, 200)
            self.assertIn(response.json()['status'], ['available', 'empty', 'unavailable'])
            self.assertEqual(client.post('/api/v1/odds/refresh', data={}).status_code, 415)
            fetch.assert_not_called()



class TeamFormTests(unittest.TestCase):
    """用赛程快照里的比分算战绩；不访问外部服务。"""

    def setUp(self):
        from app.services.odds import team_form
        self.form = team_form
        self.events = board.build_board(snapshot(), datetime(2026, 11, 12, tzinfo=timezone.utc)).events  # 猛龙主场对凯尔特人，东部日期 2026-11-11

    def test_records_splits_and_last_ten(self):
        games = [{"date": f"2026-10-{day:02d}", "home": "Toronto Raptors" if day % 2 else "Miami Heat", "away": "Miami Heat" if day % 2 else "Toronto Raptors",
                  "home_score": 100 + day, "away_score": 100} for day in range(1, 13)]  # 猛龙单数日主场赢 day 分，双数日客场输 day 分
        games += [{"date": "2026-11-11", "home": "Toronto Raptors", "away": "Boston Celtics", "home_score": 130, "away_score": 90},  # 本场当天，不计入
                  {"date": "2026-11-05", "home": "Toronto Raptors", "away": "Boston Celtics", "status": "Postponed"}]  # 没有比分，不计入
        summary = self.form.team_summary(games, "Toronto Raptors", "2026-11-11")
        self.assertEqual((summary["games"], summary["wins"], summary["losses"], summary["last_game"]), (12, 6, 6, "2026-10-12"))
        self.assertEqual((summary["at_home"], summary["on_road"]["avg_margin"]), ({"games": 6, "wins": 6, "losses": 0, "avg_margin": 6.0}, -7.0))
        self.assertEqual(summary["last_10"], {"games": 10, "wins": 5, "losses": 5, "avg_margin": -0.5})  # 10 月 3 日至 12 日
        self.assertEqual((summary["avg_points_for"], summary["avg_points_against"], summary["avg_game_total"]), (103.0, 103.5, 206.5))
        self.assertEqual(self.form.team_summary(games, "Boston Celtics", "2026-11-11"), {"team": "Boston Celtics", "games": 0})

    def test_context_needs_scores(self):
        self.assertEqual(self.form.form_context(None, self.events)["status"], "unavailable")
        old = {"dates": ["2026-11-10"], "games": [{"date": "2026-11-10", "home": "Toronto Raptors", "away": "Miami Heat", "status": "Final"}]}
        self.assertIn("旧格式", self.form.form_context(old, self.events)["reason"])
        scored = dict(old, games=[dict(old["games"][0], home_score=100, away_score=90)])
        result = self.form.form_context(scored, self.events)
        self.assertEqual((result["window"], result["events"]["game"]["away"]["games"]), ({"from": "2026-11-10", "last_final": "2026-11-10"}, 0))
        self.assertNotIn("home_minus_away_avg_margin", result["events"]["game"])


def espn_team(name, *players):
    return {"id": "1", "displayName": name, "injuries": [
        {"status": status, "date": "2026-11-11T18:00Z", "shortComment": "x" * 200, "longComment": "长评不保存",
         "athlete": {"displayName": player, "position": {"abbreviation": "G"}}, "details": {"type": "Ankle", "returnDate": "2026-11-20"}}
        for player, status in players]}


class InjuryTests(unittest.TestCase):
    """ESPN 伤病；不访问真实接口。"""

    def setUp(self):
        from app.services.odds import injuries
        self.injuries = injuries
        self.events = board.build_board(snapshot(), datetime(2026, 11, 12, tzinfo=timezone.utc)).events

    def test_normalize_maps_clippers_skips_unknown_and_sorts_out_first(self):
        teams = self.injuries.normalize_injuries([
            espn_team("LA Clippers", ("B", "Day-To-Day"), ("C", "Out")), espn_team("Seattle SuperSonics", ("D", "Out")),
            {"displayName": "Toronto Raptors", "injuries": [{"status": "Out"}]}])
        self.assertEqual(sorted(teams), ["Los Angeles Clippers", "Toronto Raptors"])
        self.assertEqual(teams["Toronto Raptors"], [])
        first = teams["Los Angeles Clippers"][0]
        self.assertEqual((first["player"], first["status"], first["injury"], first["return_date"], len(first["comment"])), ("C", "Out", "Ankle", "2026-11-20", 160))
        self.assertNotIn("longComment", first)
        with self.assertRaises(ValueError):
            self.injuries.normalize_injuries([espn_team("Seattle SuperSonics", ("D", "Out"))])

    def test_refresh_load_context_and_failure_keeps_old_file(self):
        espn = self.injuries.espn
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(espn, "fetch_injuries") as fetch:
                self.assertIn("跳过", self.injuries.refresh_injuries([], root))
                fetch.assert_not_called()
            with patch.object(espn, "fetch_injuries", return_value=[espn_team("Boston Celtics", ("A", "Out"))]):
                self.assertIn("已保存 1 队 1 人", self.injuries.refresh_injuries(self.events, root))
            with patch.object(espn, "fetch_injuries", side_effect=espn.InjuryError("HTTP 503")):
                self.assertIn("未更新", self.injuries.refresh_injuries(self.events, root))
            self.assertEqual(len(list(root.glob("*/injuries.json"))), 1)
            record = self.injuries.load_injuries(root)
        fetched = datetime.fromisoformat(record["fetched_at"].replace("Z", "+00:00"))
        context = self.injuries.injury_context(record, self.events, fetched + timedelta(hours=1))
        game = context["events"]["game"]
        self.assertEqual((context["stale"], game["away"]["listed"], game["away"]["players"][0]["player"], game["home"]), (False, True, "A", {"team": "Toronto Raptors", "listed": False, "players": []}))
        self.assertTrue(self.injuries.injury_context(record, self.events, fetched + timedelta(hours=13))["stale"])
        self.assertEqual(self.injuries.injury_context(None, self.events)["status"], "unavailable")

    def test_corrupted_latest_does_not_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "20260101").mkdir()
            (root / "20260101" / "injuries.json").write_text(json.dumps({"fetched_at": "2026-01-01T00:00:00Z", "teams": {}}))
            self.assertIsNotNone(self.injuries.load_injuries(root))
            (root / "20260102").mkdir()
            (root / "20260102" / "injuries.json").write_text("{broken")
            self.assertIsNone(self.injuries.load_injuries(root))

    def test_fetch_errors_do_not_retry(self):
        import httpx
        espn = self.injuries.espn
        calls = []
        real = httpx.Client

        def client(handler):
            return lambda **kw: real(transport=httpx.MockTransport(handler), **kw)

        with patch.object(espn.httpx, "Client", client(lambda r: httpx.Response(200, json={"injuries": [espn_team("Boston Celtics")]}))):
            self.assertEqual(espn.fetch_injuries()[0]["displayName"], "Boston Celtics")
        for response in (httpx.Response(503), httpx.Response(200, json={"items": []}), httpx.Response(200, text="<html>")):
            with patch.object(espn.httpx, "Client", client(lambda r, resp=response: calls.append(1) or resp)):
                with self.assertRaises(espn.InjuryError):
                    espn.fetch_injuries()
        self.assertEqual(len(calls), 3)

if __name__ == '__main__':
    unittest.main()


class SignalTests(unittest.TestCase):
    def test_consensus_selected_diff_and_movement(self):
        from app.services.odds.signals import board_lines, market_signals

        early = snapshot()
        early["fetched_at"] = "2026-11-11T20:00:00Z"
        early["raw_events"][0]["bookmakers"][0]["markets"][0]["outcomes"] = [
            {"name": "Toronto Raptors", "point": 6.5, "price": 1.9}, {"name": "Boston Celtics", "point": -6.5, "price": 1.9}]
        now = datetime(2026, 11, 12, tzinfo=timezone.utc)
        old, current = board.build_board(early, now), board.build_board(snapshot(), now)
        history = [(old.fetched_at, board_lines(old)), (current.fetched_at, board_lines(current))]
        signal = market_signals(current, current.events, "a", history)["game"]
        # A 主队 +7.5，B 只报客队 -6.5，即主队 +6.5；中位数 7.0。
        self.assertEqual(signal["spread"]["consensus_home_point"], 7.0)
        self.assertEqual(signal["spread"]["best_for_home"], {"team": "Toronto Raptors", "point": 7.5, "books": ["a"]})
        self.assertEqual(signal["spread"]["best_for_away"], {"team": "Boston Celtics", "point": -6.5, "books": ["b"]})
        self.assertEqual(signal["spread"]["selected"]["better_for"], "Toronto Raptors")
        self.assertEqual(signal["total"]["consensus"], 216.5)
        self.assertEqual(signal["movement"]["snapshots"], 2)
        self.assertEqual(signal["movement"]["selected_home_point"], [6.5, 7.5])
        self.assertEqual(signal["movement"]["consensus_home_point"], [6.5, 7.0])


def bdl_game(game_id, day, home, away, **extra):
    return {"id": game_id, "date": day, "status": "Final", "home_team": {"abbreviation": home, "full_name": "x"},
            "visitor_team": {"abbreviation": away, "full_name": "x"}, **extra}


class ScheduleTests(unittest.TestCase):
    """赛程取数与休息天数；不访问真实接口，Key 用假值。"""

    def setUp(self):
        from app.services.odds import schedule
        self.schedule = schedule
        self.events = board.build_board(snapshot(), datetime(2026, 11, 12, tzinfo=timezone.utc)).events  # 东部日期 2026-11-11

    def test_normalize_maps_abbreviations_and_skips_postponed(self):
        games = self.schedule.normalize_games([
            bdl_game(1, "2026-11-10", "LAC", "BOS"), bdl_game(2, "2026-11-10", "TOR", "XXX"),
            bdl_game(3, "2026-11-09T00:00:00.000Z", "TOR", "MIA"), bdl_game(4, "2026-11-10", "TOR", "NYK", postponed=True)])
        self.assertEqual([(g["id"], g["date"], g["home"], g["away"]) for g in games],
                         [(3, "2026-11-09", "Toronto Raptors", "Miami Heat"), (1, "2026-11-10", "Los Angeles Clippers", "Boston Celtics")])

    def test_normalize_keeps_scores_only_for_final_games(self):
        games = self.schedule.normalize_games([
            bdl_game(1, "2026-11-08", "TOR", "MIA", home_team_score=110, visitor_team_score=101, status_state="final"),
            bdl_game(2, "2026-11-09", "TOR", "MIA", home_team_score=50, visitor_team_score=48, status="3rd Qtr", status_state="in_progress"),
            bdl_game(3, "2026-11-10", "TOR", "MIA", home_team_score=0, visitor_team_score=0, status="7:00 pm ET"),
            bdl_game(4, "2026-11-11", "TOR", "MIA", home_team_score=99, visitor_team_score=100)])
        self.assertEqual([(g["id"], g.get("home_score"), g.get("away_score")) for g in games],
                         [(1, 110, 101), (2, None, None), (3, None, None), (4, 99, 100)])

    def test_rest_days_back_to_back_and_coverage(self):
        record = {"dates": ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"], "games": self.schedule.normalize_games([
            bdl_game(1, "2026-11-08", "TOR", "MIA"), bdl_game(2, "2026-11-09", "BOS", "NYK"),
            bdl_game(3, "2026-11-10", "CHI", "BOS"), bdl_game(4, "2026-11-11", "TOR", "BOS")])}
        game = self.schedule.rest_context(record, self.events)["events"]["game"]
        self.assertTrue(game["listed_in_schedule"])
        self.assertEqual({k: game["home"][k] for k in ("rest_days", "back_to_back", "games_in_4_days")}, {"rest_days": 2, "back_to_back": False, "games_in_4_days": 2})
        self.assertEqual(game["home"]["previous_game"], {"date": "2026-11-08", "opponent": "Miami Heat", "venue": "home"})
        self.assertEqual({k: game["away"][k] for k in ("rest_days", "back_to_back", "games_in_4_days")}, {"rest_days": 0, "back_to_back": True, "games_in_4_days": 3})
        self.assertEqual(game["away"]["previous_game"]["venue"], "away")
        late = dict(record, dates=record["dates"][1:])
        self.assertEqual(self.schedule.rest_context(late, self.events)["events"]["game"]["status"], "not_covered")
        self.assertEqual(self.schedule.rest_context(None, self.events)["status"], "unavailable")

    def test_refresh_saves_window_and_failures_keep_old_file(self):
        bdl = self.schedule.balldontlie
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(bdl, "load_key", return_value=None), patch.object(bdl, "fetch_games") as fetch:
                self.assertIn("未配置", self.schedule.refresh_schedule(self.events, root))
                fetch.assert_not_called()
            with patch.object(bdl, "load_key", return_value="test"), \
                 patch.object(bdl, "fetch_games", return_value=[bdl_game(1, "2026-11-10", "BOS", "MIA", home_team_score=100, visitor_team_score=90)]) as fetch:
                self.assertIn("已保存 1 场", self.schedule.refresh_schedule(self.events, root, date(2026, 11, 11)))
                window = [(date(2026, 10, 12) + timedelta(days=n)).isoformat() for n in range(31)]  # 近 30 天已包含休息天数需要的 6 天
                fetch.assert_called_once_with("test", window)
            saved = self.schedule.load_schedule(root)
            self.assertEqual((saved["dates"], saved["form_from"], len(saved["games"])), (window, "2026-10-12", 1))
            self.assertEqual(saved["games"][0]["home_score"], 100)
            with patch.object(bdl, "load_key", return_value="test"), \
                 patch.object(bdl, "fetch_games", side_effect=bdl.ScheduleError("HTTP 429")):
                self.assertIn("未更新", self.schedule.refresh_schedule(self.events, root))
            self.assertEqual(len(list(root.glob("*/schedule.json"))), 1)

    def test_fetch_pages_with_raw_key_and_stops_on_429(self):
        import httpx
        bdl = self.schedule.balldontlie
        seen = []

        def handler(request):
            seen.append((request.headers["Authorization"], request.url.params.get_list("dates[]"), request.url.params.get("cursor")))
            if request.url.params.get("cursor") is None:
                return httpx.Response(200, json={"data": [{"id": 1}], "meta": {"next_cursor": 7}})
            return httpx.Response(200, json={"data": [{"id": 2}], "meta": {}})

        real = httpx.Client
        with patch.object(bdl.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)):
            self.assertEqual([g["id"] for g in bdl.fetch_games("k", ["2026-11-10", "2026-11-11"])], [1, 2])
        self.assertEqual(seen, [("k", ["2026-11-10", "2026-11-11"], None), ("k", ["2026-11-10", "2026-11-11"], "7")])
        with patch.object(bdl.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(lambda r: httpx.Response(429)), **kw)):
            with self.assertRaises(bdl.ScheduleError):
                bdl.fetch_games("k", ["2026-11-10", "2026-11-11"])
