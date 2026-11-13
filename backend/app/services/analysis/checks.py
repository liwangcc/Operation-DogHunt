"""L2 输入检查、L3 结构检查、L4 业务检查，统一输出 CheckReport。"""

import json
import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from app.services.analysis.registry import BlockDefinition
from app.services.analysis.report import CheckReport, Issue, status_of
from app.services.analysis.rules import market_errors

GAME_FIELDS = ("game_id", "home", "away", "tipoff_utc")
_FENCE = re.compile(r"^```(?:json)?\s*\n(.*)\n```$", re.S)


class PacketError(Exception):
    """调用方传入了本块不该看到的数据。这是代码错误，不是数据缺失。"""


@dataclass(frozen=True)
class PreparedInput:
    packet: dict[str, Any]
    missing_core: list[str]
    missing_optional: list[str]

    @property
    def ready(self) -> bool:
        return not self.missing_core


def _usable(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def prepare_input(block: BlockDefinition, game: Mapping[str, Any], metrics: Mapping[str, Any]) -> PreparedInput:
    """L2：只把本块 inputs 里的指标放进数据包。null、NaN、非数字都算缺失，不补值。"""
    if set(game) != set(GAME_FIELDS):
        raise PacketError(f"比赛信息只能包含 {', '.join(GAME_FIELDS)}，实际为 {sorted(game)}")
    if not all(isinstance(game[k], str) and game[k].strip() for k in GAME_FIELDS):
        raise PacketError("比赛信息的每一项都必须是非空字符串")
    extra = sorted(set(metrics) - set(block.inputs))
    if extra:
        # 例如把盘口或其他块的指标传进来，直接报错，不悄悄丢弃。
        raise PacketError(f"{block.version} 不接受这些指标：{extra}")
    present = {name: metrics[name] for name in block.inputs if _usable(metrics.get(name))}
    missing_core = [n for n in block.core_inputs if n not in present]
    missing_optional = [n for n in block.optional_inputs if n not in present]
    packet = {**{k: game[k] for k in GAME_FIELDS}, "metrics": present, "missing": missing_core + missing_optional}
    return PreparedInput(packet=packet, missing_core=missing_core, missing_optional=missing_optional)


def skipped_report(prepared: PreparedInput) -> CheckReport:
    issues = [Issue("L2", "missing_core_input", f"缺少核心指标 {name}，未调用模型", f"metrics/{name}") for name in prepared.missing_core]
    return CheckReport(status="skipped", warnings=issues, observations={"missing_inputs": prepared.packet["missing"]})


def _reject_constant(value: str):
    raise ValueError(value)


def parse_reply(text: str) -> tuple[dict[str, Any] | None, list[Issue]]:
    """L3 第一步：解析 JSON。只容忍外层代码块标记，不从夹杂的文字里猜 JSON。"""
    body = text.strip()
    fenced = _FENCE.match(body)
    if fenced:
        body = fenced.group(1).strip()
    try:
        value = json.loads(body, parse_constant=_reject_constant)
    except ValueError:
        return None, [Issue("L3", "not_json", "回答不是一个合法的 JSON 对象（不能附带解释文字，不能含 NaN 或 Infinity）")]
    if not isinstance(value, dict):
        return None, [Issue("L3", "not_object", f"回答应为 JSON 对象，实际为 {type(value).__name__}")]
    return value, []


def check_structure(block: BlockDefinition, output: Any) -> list[Issue]:
    """L3 第二步：按 output_schema 校验，一次收集全部错误。"""
    issues = []
    for error in sorted(block.validator.iter_errors(output), key=lambda e: [str(p) for p in e.absolute_path]):
        path = "/".join(str(p) for p in error.absolute_path)
        issues.append(Issue("L3", error.validator, error.message, path))
    return issues


def check_reply(block: BlockDefinition, prepared: PreparedInput, text: str) -> tuple[dict[str, Any] | None, CheckReport]:
    """对一次模型回答依次跑 L3 和 L4。L3 不通过时不跑 L4，避免对残缺数据下业务结论。"""
    observations: dict[str, Any] = {"missing_inputs": prepared.packet["missing"]}
    output, errors = parse_reply(text)
    if output is not None:
        errors = check_structure(block, output)
    if errors:
        return None, CheckReport(status="invalid", errors=errors, observations=observations)
    result = block.rules.check(output, prepared.packet)
    errors = market_errors(output, block.markets) + result.errors
    observations.update(result.observations)
    report = CheckReport(
        status=status_of(errors, result.warnings),
        errors=errors,
        warnings=result.warnings,
        observations=observations,
    )
    return (output if report.usable else None), report
