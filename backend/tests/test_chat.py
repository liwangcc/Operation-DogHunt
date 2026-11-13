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
from app.integrations.llm import ModelError, request_model
from app.main import create_app
from app.schemas.chat import ChatMessage, ChatResponse, OddsSelection
from app.schemas.odds import OddsBoard
from app.services.chat import prompt as chat_prompt
from app.services.chat.odds_context import odds_context
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
        result = await self.call(lambda _: httpx.Response(200, json=completed()))
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
        path = self.dir / "chat_method_v2.md"
        self.write(path.name, path.read_text(encoding="utf-8") + "新增一句。\n")
        problems = chat_prompt.check(self.dir)
        self.assertTrue(any("chat_method_v2.md" in p and "chat-prompt-maintenance" in p for p in problems))
        self.assertFalse(chat_prompt.build(self.dir).locked)
        with self.assertRaises(chat_prompt.ChatPromptError):
            chat_prompt.update_lock(self.dir)  # 已登记版本不能改写哈希

    def test_new_version_must_be_locked_and_logged(self):
        old = (self.dir / "chat_method_v2.md").read_text(encoding="utf-8")
        self.write("chat_method_v3.md", old.replace("# chat_method_v2", "# chat_method_v3") + "新增一句。\n")
        self.assertTrue(any("chat_method_v3.md" in p and "未登记" in p for p in chat_prompt.check(self.dir)))
        active = ["chat_role_v1", "chat_sources_v1", "chat_odds_v1", "chat_method_v3", "chat_output_v1"]
        chat_prompt.update_lock(self.dir, active)
        self.assertEqual(chat_prompt.check(self.dir), ["chat_method_v3：CHANGELOG.md 里没有 `### chat_method_v3` 条目"])
        with (self.dir / "CHANGELOG.md").open("a", encoding="utf-8") as f:
            f.write("\n### chat_method_v3（替换 chat_method_v2）\n- 测试\n")
        self.assertEqual(chat_prompt.check(self.dir), [])
        self.assertEqual(chat_prompt.build(self.dir).versions[3], "chat_method_v3")

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


if __name__ == "__main__":
    unittest.main()
