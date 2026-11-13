"""离线验证，不读取真实模型配置，不调用外部付费接口。"""

import asyncio
import json
import re
import shutil
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx

from app.core.config import Settings, get_settings
from app.integrations.llm import ModelError, TextDelta, request_model, stream_model
from app.main import create_app
from app.schemas.chat import ChatMessage, ChatResponse, OddsSelection
from app.schemas.odds import OddsBoard
from app.services.chat import prompt as chat_prompt
from app.services.chat.odds_context import mentioned_teams, odds_context
from app.services.odds.board import build_board
from test_odds import snapshot

CLIENT = httpx.AsyncClient


def settings(**overrides):
    return Settings(_env_file=None, **{
        "model_base_url": "https://relay.example/v1",
        "model_api_key": "test-secret",
        "model_name": "test-model",
        "model_extra_headers": '{"x-relay-auth":"extra-secret"}',
        **overrides,
    })


def completed(text="测试回答"):
    return {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": text}]}], "usage": {"input_tokens": 12, "output_tokens": 4}}


class ModelTests(unittest.IsolatedAsyncioTestCase):
    async def call(self, handler, config=None):
        with patch("app.integrations.llm.httpx.AsyncClient", side_effect=lambda **kwargs: CLIENT(transport=httpx.MockTransport(handler), **kwargs)):
            return await request_model(config or settings(), [ChatMessage(role="user", content="测试")], "系统要求")

    async def test_responses_stream_and_headers(self):
        calls = []

        def handler(request):
            calls.append(request)
            self.assertEqual(str(request.url), "https://relay.example/v1/responses")
            self.assertEqual(request.headers["Authorization"], "Bearer test-secret")
            self.assertEqual(request.headers["x-relay-auth"], "extra-secret")
            payload = json.loads(request.content)
            self.assertEqual(payload["input"], [{"role": "user", "content": "测试"}])
            self.assertEqual(payload["instructions"], "系统要求")
            self.assertEqual(payload["reasoning"], {"effort": "high"})
            self.assertFalse(payload["store"])
            self.assertTrue(payload["stream"])
            stream = 'data: {"type":"response.output_text.delta","delta":"不交付半成品"}\n\n'
            stream += "data: " + json.dumps({"type": "response.completed", "response": completed()}) + "\n\n"
            return httpx.Response(200, headers={"Content-Type": "text/event-stream"}, text=stream)

        result = await self.call(handler)
        self.assertEqual(result.reply, "测试回答")
        self.assertEqual(result.usage.input_tokens, 12)
        self.assertEqual(len(calls), 1)

    async def test_json_compatible_response(self):
        def handler(request):
            self.assertEqual(json.loads(request.content)["reasoning"], {"effort": "medium"})
            return httpx.Response(200, json=completed())

        result = await self.call(handler, settings(model_reasoning_effort="medium"))
        self.assertEqual(result.reply, "测试回答")

    async def test_errors_are_safe_and_never_retried(self):
        for status in (400, 401, 403, 404, 429, 503):
            with self.subTest(status=status):
                calls = []

                def handler(request):
                    calls.append(request)
                    return httpx.Response(status, json={"error": "test-secret extra-secret"})

                with self.assertRaises(ModelError) as error:
                    await self.call(handler)
                self.assertNotIn("secret", str(error.exception))
                self.assertEqual(error.exception.status_code, 429 if status == 429 else 502)
                self.assertEqual(len(calls), 1)

    async def test_partial_and_failed_streams_are_not_success(self):
        for stream in (
            'data: {"type":"response.output_text.delta","delta":"半截"}\n\n',
            'data: {"type":"response.failed","error":"test-secret"}\n\n',
            'data: {"type":"response.incomplete"}\n\n',
            'data: invalid-json\n\n',
        ):
            with self.subTest(stream=stream):
                with self.assertRaises(ModelError) as error:
                    await self.call(lambda _: httpx.Response(200, text=stream))
                self.assertNotIn("test-secret", str(error.exception))

    async def test_timeout_is_504(self):
        def handler(request):
            raise httpx.ReadTimeout("secret", request=request)

        with self.assertRaises(ModelError) as error:
            await self.call(handler)
        self.assertEqual(error.exception.status_code, 504)
        self.assertNotIn("secret", str(error.exception))

    async def test_missing_configuration_does_not_call_provider(self):
        handler = AsyncMock()
        with self.assertRaises(ModelError) as error:
            await self.call(handler, settings(model_api_key=""))
        self.assertEqual(error.exception.status_code, 503)
        handler.assert_not_called()


class RouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = create_app()
        self.app.dependency_overrides[get_settings] = lambda: settings()
        self.client = CLIENT(transport=httpx.ASGITransport(app=self.app), base_url="http://test")
        self.board_reader = patch("app.services.chat.service.read_board", return_value=OddsBoard(status="unavailable", message="测试无快照"))
        self.read_board = self.board_reader.start()
        self.addCleanup(self.board_reader.stop)
        history = patch("app.services.chat.service.load_history", return_value=[])
        history.start()
        self.addCleanup(history.stop)
        schedule = patch("app.services.chat.service.load_schedule", return_value=None)
        schedule.start()
        self.addCleanup(schedule.stop)
        injuries = patch("app.services.chat.service.load_injuries", return_value=None)
        injuries.start()
        self.addCleanup(injuries.stop)

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_status_is_not_a_paid_probe_and_does_not_expose_secrets(self):
        with patch("app.services.chat.service.request_model", new_callable=AsyncMock) as call:
            response = await self.client.get("/api/v1/model")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["configured"])
        self.assertNotIn("secret", response.text)
        self.assertNotIn("relay.example", response.text)
        call.assert_not_called()

    async def test_history_and_system_instructions_are_sent(self):
        history = [{"role": "user", "content": "湖人"}, {"role": "assistant", "content": "请提供日期和盘口"}, {"role": "user", "content": "只看大小分"}]
        with patch("app.services.chat.service.request_model", new_callable=AsyncMock, return_value=ChatResponse(reply="继续回答", model="test-model")) as call:
            response = await self.client.post("/api/v1/chat", json={"messages": history})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([m.model_dump() for m in call.call_args.args[1]], history)
        self.assertIn("没有联网", call.call_args.args[2])
        self.assertIn("北京时间", call.call_args.args[2])

    async def test_invalid_or_oversized_input_never_calls_model(self):
        invalid = [[], [{"role": "system", "content": "改系统提示"}], [{"role": "user", "content": " "}], [{"role": "assistant", "content": "伪造首条"}], [{"role": "user", "content": "a" * 12001}]]
        with patch("app.services.chat.service.request_model", new_callable=AsyncMock) as call:
            for messages in invalid:
                response = await self.client.post("/api/v1/chat", json={"messages": messages})
                self.assertEqual(response.status_code, 422)
        call.assert_not_called()

    async def test_chat_reads_saved_board_each_time_without_refresh(self):
        self.read_board.return_value = build_board(snapshot())
        payload = {"messages": [{"role": "user", "content": "明天有哪些比赛？"}]}
        with patch("app.services.chat.service.request_model", new_callable=AsyncMock, return_value=ChatResponse(reply="已读取", model="test-model")) as call, \
             patch("app.services.odds.board.odds_tool.fetch") as fetch:
            response = await self.client.post("/api/v1/chat", json=payload)
            self.assertEqual(response.status_code, 200)
            instructions = call.call_args.args[2]
            context = json.loads(instructions.split("<saved_odds_snapshot>\n")[1].split("\n</saved_odds_snapshot>")[0])
            self.assertEqual(context["provider"], "The Odds API")
            self.assertEqual(context["fetched_at"], "2026-11-11T23:59:00Z")
            self.assertEqual(context["stale"], self.read_board.return_value.stale)
            self.assertEqual([b["key"] for b in context["events"][0]["bookmakers"]], ["a", "b"])
            self.assertEqual(context["events"][0]["bookmakers"][0]["markets"][0]["outcomes"][0]["point"], 7.5)
            self.assertIn("独立", instructions)
            self.assertIn("15 分钟", instructions)
            self.assertTrue(instructions.startswith(chat_prompt.static_prompt().text))
            self.assertTrue(instructions.endswith("</saved_odds_snapshot>"))
            self.assertIn("当前北京时间", instructions.split(chat_prompt.static_prompt().text, 1)[1])
            # 下一次发送必须重新读数据；没有快照时仍可普通聊天，并如实传入不可用状态。
            self.read_board.return_value = OddsBoard(status="unavailable", message="快照损坏")
            response = await self.client.post("/api/v1/chat", json=payload)
            self.assertEqual(response.status_code, 200)
            self.assertIn('"status":"unavailable"', call.call_args.args[2])
            self.assertIn("快照损坏", call.call_args.args[2])
        self.assertEqual(self.read_board.call_count, 2)
        fetch.assert_not_called()

    async def test_selected_game_uses_only_selected_platform(self):
        self.read_board.return_value = build_board(snapshot())
        payload = {"messages": [{"role": "user", "content": "分析这场"}], "odds_selection": {"event_id": "game", "bookmaker_key": "b"}}
        with patch("app.services.chat.service.request_model", new_callable=AsyncMock, return_value=ChatResponse(reply="分析", model="test-model")) as call:
            response = await self.client.post("/api/v1/chat", json=payload)
        self.assertEqual(response.status_code, 200)
        context = json.loads(call.call_args.args[2].split("<saved_odds_snapshot>\n")[1].split("\n</saved_odds_snapshot>")[0])
        self.assertEqual(context["selection"], payload["odds_selection"])
        books = context["events"][0]["bookmakers"]
        self.assertEqual(len(books), 1)
        self.assertEqual(books[0]["key"], "b")
        self.assertEqual(books[0]["markets"][0]["outcomes"][0]["point"], -6.5)
        self.assertEqual(len(books[0]["markets"]), 1)  # 不用 A 的大小分补 B。

    async def test_missing_selection_or_forged_prices_never_calls_model(self):
        self.read_board.return_value = build_board(snapshot())
        with patch("app.services.chat.service.request_model", new_callable=AsyncMock) as call:
            for selection, expected in [
                ({"event_id": "missing", "bookmaker_key": "a"}, 409),
                ({"event_id": "game", "bookmaker_key": "missing"}, 409),
                ({"event_id": "game", "bookmaker_key": "a", "point": 99}, 422),
            ]:
                response = await self.client.post("/api/v1/chat", json={"messages": [{"role": "user", "content": "分析"}], "odds_selection": selection})
                self.assertEqual(response.status_code, expected)
        call.assert_not_called()

    async def test_broken_prompt_files_return_503_without_calling_model(self):
        with patch("app.services.chat.service.static_prompt", side_effect=chat_prompt.ChatPromptError("缺少 versions.lock.json")), \
             patch("app.services.chat.service.request_model", new_callable=AsyncMock) as call:
            response = await self.client.post("/api/v1/chat", json={"messages": [{"role": "user", "content": "测试"}]})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("versions.lock", response.text)
        call.assert_not_called()

    async def test_one_request_at_a_time_and_recovers_after_completion(self):
        entered, release = asyncio.Event(), asyncio.Event()

        async def provider(*_):
            entered.set()
            await release.wait()
            return ChatResponse(reply="完成", model="test-model")

        payload = {"messages": [{"role": "user", "content": "测试"}]}
        with patch("app.services.chat.service.request_model", side_effect=provider):
            task = asyncio.create_task(self.client.post("/api/v1/chat", json=payload))
            await entered.wait()
            second = await self.client.post("/api/v1/chat", json=payload)
            self.assertEqual(second.status_code, 429)
            release.set()
            self.assertEqual((await task).status_code, 200)
            self.assertEqual((await self.client.post("/api/v1/chat", json=payload)).status_code, 200)


def sse_events(text):
    return [(m.group(1), json.loads(m.group(2))) for m in re.finditer(r"event: (\w+)\ndata: (.+)\n\n", text)]


class StreamTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = create_app()
        self.app.dependency_overrides[get_settings] = lambda: settings()
        self.client = CLIENT(transport=httpx.ASGITransport(app=self.app), base_url="http://test")
        self.board_reader = patch("app.services.chat.service.read_board", return_value=build_board(snapshot()))
        self.board_reader.start()
        self.addCleanup(self.board_reader.stop)
        history = patch("app.services.chat.service.load_history", return_value=[])
        history.start()
        self.addCleanup(history.stop)
        schedule = patch("app.services.chat.service.load_schedule", return_value=None)
        schedule.start()
        self.addCleanup(schedule.stop)
        injuries = patch("app.services.chat.service.load_injuries", return_value=None)
        injuries.start()
        self.addCleanup(injuries.stop)

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_stream_model_yields_deltas_then_complete_reply(self):
        stream = 'data: {"type":"response.output_text.delta","delta":"测试"}\n\n'
        stream += 'data: {"type":"response.output_text.delta","delta":"回答"}\n\n'
        stream += "data: " + json.dumps({"type": "response.completed", "response": completed()}) + "\n\n"
        transport = httpx.MockTransport(lambda _: httpx.Response(200, headers={"Content-Type": "text/event-stream"}, text=stream))
        with patch("app.integrations.llm.httpx.AsyncClient", side_effect=lambda **kwargs: CLIENT(transport=transport, **kwargs)):
            items = [item async for item in stream_model(settings(), [ChatMessage(role="user", content="测试")], "系统要求")]
        self.assertEqual(items[:2], [TextDelta("测试"), TextDelta("回答")])
        self.assertEqual(items[2], ChatResponse(reply="测试回答", model="test-model", usage={"input_tokens": 12, "output_tokens": 4}))

    async def test_route_streams_deltas_and_done(self):
        async def provider(*_):
            yield TextDelta("分")
            yield TextDelta("析")
            yield ChatResponse(reply="分析", model="test-model")

        payload = {"messages": [{"role": "user", "content": "凯尔特人这场怎么看"}]}
        with patch("app.services.chat.service.stream_model", side_effect=provider) as call:
            response = await self.client.post("/api/v1/chat/stream", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers["content-type"].startswith("text/event-stream"))
        self.assertEqual(sse_events(response.text), [("delta", {"text": "分"}), ("delta", {"text": "析"}), ("done", {"reply": "分析", "model": "test-model", "usage": None})])
        self.assertIn('"focus":{"teams":["Boston Celtics"]', call.call_args.args[2])

    async def test_failure_after_start_is_error_event_and_lock_is_released(self):
        async def provider(*_):
            yield TextDelta("半截")
            raise ModelError("模型回答失败或被截断", 502)

        payload = {"messages": [{"role": "user", "content": "测试"}]}
        with patch("app.services.chat.service.stream_model", side_effect=provider):
            response = await self.client.post("/api/v1/chat/stream", json=payload)
            self.assertEqual(sse_events(response.text)[-1], ("error", {"detail": "模型回答失败或被截断", "status": 502}))
            self.assertEqual((await self.client.post("/api/v1/chat/stream", json=payload)).status_code, 200)

    async def test_errors_before_start_use_http_status(self):
        with patch("app.services.chat.service.stream_model") as call:
            gone = {"messages": [{"role": "user", "content": "分析"}], "odds_selection": {"event_id": "missing", "bookmaker_key": "a"}}
            self.assertEqual((await self.client.post("/api/v1/chat/stream", json=gone)).status_code, 409)
            self.app.dependency_overrides[get_settings] = lambda: settings(model_api_key="")
            self.assertEqual((await self.client.post("/api/v1/chat/stream", json={"messages": [{"role": "user", "content": "测试"}]})).status_code, 503)
        call.assert_not_called()


class FocusTests(unittest.TestCase):
    def test_team_names_match_chinese_and_whole_english_words(self):
        self.assertEqual(mentioned_teams("尼克斯 @ 步行者"), {"New York Knicks", "Indiana Pacers"})
        self.assertEqual(mentioned_teams("Knicks vs PACERS"), {"New York Knicks", "Indiana Pacers"})
        self.assertEqual(mentioned_teams("they cheat at magician school"), set())

    def test_follow_up_keeps_previous_team_and_unknown_team_gives_empty_list(self):
        board = build_board(snapshot())
        history = [ChatMessage(role="user", content="猛龙这场"), ChatMessage(role="assistant", content="略"), ChatMessage(role="user", content="那大小分呢")]
        context = json.loads(odds_context(board, None, history))
        self.assertEqual(context["focus"], {"teams": ["Toronto Raptors"], "matched_events": 1, "total_events": 1})
        self.assertEqual(len(context["events"]), 1)
        context = json.loads(odds_context(board, None, [ChatMessage(role="user", content="湖人呢")]))
        self.assertEqual((context["focus"]["matched_events"], context["events"]), (0, []))
        self.assertIsNone(json.loads(odds_context(board, None, [ChatMessage(role="user", content="今天有什么比赛")]))["focus"])

    def test_schedule_rest_follows_focused_events(self):
        board = build_board(snapshot())  # 猛龙主场对凯尔特人，美国东部日期 2026-11-11
        record = {"provider": "BALLDONTLIE", "fetched_at": "2026-11-11T12:00:00Z", "dates": ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"], "games": [
            {"id": 1, "date": "2026-11-10", "home": "Boston Celtics", "away": "Miami Heat", "status": "Final"},
            {"id": 2, "date": "2026-11-11", "home": "Toronto Raptors", "away": "Boston Celtics", "status": ""}]}
        ask = [ChatMessage(role="user", content="猛龙这场")]
        rest = json.loads(odds_context(board, None, ask, None, record))["schedule_rest"]
        game = rest["events"]["game"]
        self.assertTrue(game["listed_in_schedule"])
        self.assertEqual((game["away"]["rest_days"], game["away"]["back_to_back"]), (0, True))
        self.assertEqual((game["home"]["rest_days"], game["home"]["rest_days_at_least"]), (None, 5))
        self.assertEqual(json.loads(odds_context(board, None, ask))["schedule_rest"]["status"], "unavailable")

    def test_team_form_and_injuries_follow_focused_events(self):
        board = build_board(snapshot())  # 猛龙主场对凯尔特人，美国东部日期 2026-11-11
        record = {"provider": "BALLDONTLIE", "fetched_at": "2026-11-11T12:00:00Z", "dates": ["2026-11-09", "2026-11-10", "2026-11-11"], "form_from": "2026-10-12", "games": [
            {"id": 1, "date": "2026-11-09", "home": "Toronto Raptors", "away": "Miami Heat", "status": "Final", "home_score": 110, "away_score": 100},
            {"id": 2, "date": "2026-11-10", "home": "Boston Celtics", "away": "Toronto Raptors", "status": "Final", "home_score": 120, "away_score": 118},
            {"id": 3, "date": "2026-11-11", "home": "Toronto Raptors", "away": "Boston Celtics", "status": ""}]}
        injuries = {"provider": "ESPN", "fetched_at": "2026-11-11T12:00:00Z", "teams": {"Boston Celtics": [{"player": "A", "status": "Out"}]}}
        ask = [ChatMessage(role="user", content="猛龙这场")]
        context = json.loads(odds_context(board, None, ask, None, record, injuries))
        game = context["team_form"]["events"]["game"]
        self.assertEqual((game["home"]["games"], game["home"]["wins"], game["home"]["avg_margin"]), (2, 1, 4.0))
        self.assertEqual((game["away"]["games"], game["away"]["avg_margin"], game["home_minus_away_avg_margin"]), (1, 2.0, 2.0))
        hurt = context["injuries"]["events"]["game"]
        self.assertEqual((hurt["away"]["listed"], hurt["away"]["players"][0]["player"], hurt["home"]["listed"]), (True, "A", False))
        empty = json.loads(odds_context(board, None, ask))
        self.assertEqual((empty["team_form"]["status"], empty["injuries"]["status"]), ("unavailable", "unavailable"))
        whole = json.loads(odds_context(board, None, [ChatMessage(role="user", content="今天有什么比赛")], None, record, injuries))
        self.assertEqual((whole["team_form"]["status"], whole["injuries"]["status"]), ("available", "available"))  # 只有 1 场，仍算少数比赛


class ChatPromptTests(unittest.TestCase):
    """聊天提示词文件、锁文件与改版记录；在临时目录造坏文件，不改仓库里的文件。"""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.dir = self.tmp / "chat"
        shutil.copytree(chat_prompt.CHAT_DIR, self.dir)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def write(self, name, text):
        (self.dir / name).write_text(text, encoding="utf-8")

    def active(self):
        return json.loads((self.dir / "versions.lock.json").read_text(encoding="utf-8"))["active"]

    def test_repository_prompts_are_recorded(self):
        # 失败说明提示词被修改但没有记录：运行 $chat-prompt-maintenance。
        self.assertEqual(chat_prompt.check(), [])
        self.assertTrue(chat_prompt.build().locked)

    def test_assembly_order_and_stable_hash(self):
        built = chat_prompt.build(self.dir)
        self.assertEqual([v.split("_")[1] for v in built.versions], list(chat_prompt.MODULES))
        heads = [built.text.index(f"# {v}\n") for v in built.versions]
        self.assertEqual(heads, sorted(heads))
        self.assertEqual(chat_prompt.build(self.dir).sha256, built.sha256)
        self.assertNotIn("{now}", built.text)
        self.assertNotIn("<saved_odds_snapshot>", built.text)

    def test_edit_without_record_fails(self):
        path = self.dir / f"{self.active()[3]}.md"
        self.write(path.name, path.read_text(encoding="utf-8") + "新增一句。\n")
        problems = chat_prompt.check(self.dir)
        self.assertTrue(any(path.name in p and "chat-prompt-maintenance" in p for p in problems))
        self.assertFalse(chat_prompt.build(self.dir).locked)
        with self.assertRaises(chat_prompt.ChatPromptError):
            chat_prompt.update_lock(self.dir)  # 已登记版本不能改写哈希

    def test_new_version_must_be_locked_and_logged(self):
        active = self.active()
        current = active[3]
        number = max(int(p.stem.rsplit("_v", 1)[1]) for p in self.dir.glob("chat_method_v*.md")) + 1
        new = f"chat_method_v{number}"
        old = (self.dir / f"{current}.md").read_text(encoding="utf-8")
        self.write(f"{new}.md", old.replace(f"# {current}", f"# {new}") + "新增一句。\n")
        self.assertTrue(any(f"{new}.md" in p and "未登记" in p for p in chat_prompt.check(self.dir)))
        active[3] = new
        chat_prompt.update_lock(self.dir, active)
        self.assertEqual(chat_prompt.check(self.dir), [f"{new}：CHANGELOG.md 里没有 `### {new}` 条目"])
        with (self.dir / "CHANGELOG.md").open("a", encoding="utf-8") as f:
            f.write(f"\n### {new}（替换 {current}）\n- 测试\n")
        self.assertEqual(chat_prompt.check(self.dir), [])
        self.assertEqual(chat_prompt.build(self.dir).versions[3], new)

    def test_header_order_and_deleted_old_version(self):
        path = self.dir / "chat_role_v1.md"
        self.write(path.name, path.read_text(encoding="utf-8").replace("# chat_role_v1", "# chat_role_v2", 1))
        self.assertTrue(any("第一行" in p for p in chat_prompt.check(self.dir)))
        with self.assertRaises(chat_prompt.ChatPromptError):
            chat_prompt.build(self.dir)
        shutil.copytree(chat_prompt.CHAT_DIR, self.dir, dirs_exist_ok=True)
        with self.assertRaises(chat_prompt.ChatPromptError):
            chat_prompt.update_lock(self.dir, ["chat_sources_v1", "chat_role_v1", "chat_odds_v1", "chat_method_v1", "chat_output_v1"])
        (self.dir / "chat_odds_v1.md").unlink()
        self.assertTrue(any("旧版本不能删除" in p for p in chat_prompt.check(self.dir)))

    def test_missing_lock_is_reported(self):
        (self.dir / "versions.lock.json").unlink()
        self.assertTrue(chat_prompt.check(self.dir)[0].startswith("缺少 versions.lock.json"))
        with self.assertRaises(chat_prompt.ChatPromptError):
            chat_prompt.build(self.dir)


class EvalSnapshotTests(unittest.TestCase):
    """回归用例引用的固定快照能被程序读取，并且在快照约定的时刻有效。"""

    def test_cases_reference_usable_snapshots(self):
        cases = (chat_prompt.CHAT_DIR / "eval_cases.md").read_text(encoding="utf-8")
        ids = set(re.findall(r"^- 快照：(S-\d{3})$", cases, re.M))
        self.assertTrue(ids)
        for snapshot_id in sorted(ids):
            with self.subTest(snapshot_id):
                path = chat_prompt.CHAT_DIR / "eval_snapshots" / f"{snapshot_id}.json"
                snap = json.loads(path.read_text(encoding="utf-8"))
                now = datetime.fromisoformat(snap["_eval"]["now"].replace("Z", "+00:00"))
                board = build_board(snap, now)
                self.assertFalse(board.stale)
                selection = OddsSelection(**snap["_eval"]["selection"])
                context = json.loads(odds_context(board, selection))
                self.assertEqual([e["id"] for e in context["events"]], [selection.event_id])
                self.assertNotIn("_eval", context)

    def test_d001_matches_numbers_in_cases(self):
        from app.services.odds.injuries import load_injuries
        from app.services.odds.schedule import load_schedule
        folder = chat_prompt.CHAT_DIR / "eval_snapshots"
        data = json.loads((folder / "D-001.json").read_text(encoding="utf-8"))
        snap = json.loads((folder / f"{data['_eval']['for']}.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as directory:  # 和真实文件走同一个读取校验
            root = Path(directory)
            for name in ("schedule", "injuries"):
                (root / name / "x").mkdir(parents=True)
                (root / name / "x" / f"{name}.json").write_text(json.dumps(data[name]), encoding="utf-8")
            schedule, injuries = load_schedule(root / "schedule"), load_injuries(root / "injuries")
        self.assertIsNotNone(schedule)
        self.assertIsNotNone(injuries)
        now = datetime.fromisoformat(snap["_eval"]["now"].replace("Z", "+00:00"))
        # 盘口与伤病共用固定快照时钟，避免样例在真实时间超过 12 小时后无故失败。
        with patch("app.services.odds.injuries.datetime", wraps=datetime) as clock:
            clock.now.return_value = now
            context = json.loads(odds_context(build_board(snap, now), OddsSelection(**snap["_eval"]["selection"]), None, [], schedule, injuries))
        form = context["team_form"]["events"]["s001-lal-den"]
        self.assertEqual([(form[k]["games"], form[k]["avg_margin"], form[k]["avg_game_total"]) for k in ("home", "away")], [(9, 6.0, 232.0), (10, -1.0, 236.0)])
        self.assertEqual(form["home_minus_away_avg_margin"], 7.0)
        self.assertEqual(context["market_signals"]["s001-lal-den"]["spread"]["consensus_home_point"], -6.75)
        self.assertEqual(context["market_signals"]["s001-lal-den"]["total"]["consensus"], 231.0)
        rest = context["schedule_rest"]["events"]["s001-lal-den"]
        self.assertEqual((rest["home"]["rest_days"], rest["away"]["back_to_back"]), (2, True))
        hurt = context["injuries"]
        self.assertFalse(hurt["stale"])
        lakers = {p["player"]: p for p in hurt["events"]["s001-lal-den"]["away"]["players"]}
        self.assertGreater(lakers["Lakers Guard A"]["reported"], form["away"]["last_game"])  # 新伤病
        self.assertLess(lakers["Lakers Center B"]["reported"], data["schedule"]["form_from"])  # 已在战绩里


if __name__ == "__main__":
    unittest.main()
