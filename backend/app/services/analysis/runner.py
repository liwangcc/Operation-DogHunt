"""运行一个功能块：输入检查 → 调用模型 → 结构与业务检查 → 有错误时纠正一次。

接口报错、超时不自动重试；纠正后仍有错误记为 invalid，不能计入结果。
目前没有任何接口或脚本调用这里，真实调用前需另行确认费用。
"""

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from app.core.config import Settings
from app.integrations.llm import ModelError, request_model
from app.schemas.chat import ChatMessage, ChatResponse, TokenUsage
from app.services.analysis.assemble import AssembledPrompt, assemble, correction_message
from app.services.analysis.checks import PreparedInput, check_reply, prepare_input, skipped_report
from app.services.analysis.registry import BlockDefinition, SharedText
from app.services.analysis.report import CheckReport, Issue

ModelCall = Callable[[Settings, list[ChatMessage], str], Awaitable[ChatResponse]]


@dataclass
class Attempt:
    reply: str
    usage: TokenUsage | None
    report: CheckReport


@dataclass
class BlockRun:
    block: str
    version: str
    packet: dict[str, Any]
    report: CheckReport
    output: dict[str, Any] | None = None
    prompt: AssembledPrompt | None = None
    attempts: list[Attempt] = field(default_factory=list)


def _model_failure(prepared: PreparedInput, code: str, message: str) -> CheckReport:
    return CheckReport(status="invalid", errors=[Issue("model", code, message)], observations={"missing_inputs": prepared.packet["missing"]})


async def run_block(
    block: BlockDefinition,
    shared: SharedText,
    game: Mapping[str, Any],
    metrics: Mapping[str, Any],
    settings: Settings,
    call: ModelCall = request_model,
) -> BlockRun:
    prepared = prepare_input(block, game, metrics)
    run = BlockRun(block=block.id, version=block.version, packet=prepared.packet, report=skipped_report(prepared))
    if not prepared.ready:
        run.output = block.rules.insufficient_output(prepared.packet["missing"])
        return run

    run.prompt = assemble(block, shared, prepared.packet)
    messages = [ChatMessage(role="user", content=run.prompt.data_message)]
    for round_no in range(2):  # 第一次调用 + 最多一次纠正
        try:
            response = await call(settings, messages, run.prompt.instructions)
        except ModelError as error:
            run.report = _model_failure(prepared, "model_error", str(error))
            return run
        output, report = check_reply(block, prepared, response.reply)
        run.attempts.append(Attempt(reply=response.reply, usage=response.usage, report=report))
        if not report.errors:
            report.corrected = round_no == 1
            run.report, run.output = report, output
            return run
        run.report = report
        if round_no == 1:
            break
        try:
            messages = [
                *messages,
                ChatMessage(role="assistant", content=response.reply),
                ChatMessage(role="user", content=correction_message(report.errors)),
            ]
        except ValidationError:
            # 回答过长或为空时无法放回对话做纠正，直接记为无效，不截断改写。
            run.report.errors.append(Issue("model", "cannot_correct", "回答长度超出对话限制，无法纠正"))
            break
    return run
