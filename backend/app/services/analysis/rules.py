"""各功能块的 L4 业务规则：jsonschema 查不出的前后矛盾和疑似编造。

错误表示结果自相矛盾、不能使用；警告只记录，留给人工复盘。
每个块在 RULES 里登记一组规则，文件自检会确认每个块都有登记。
"""

import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from app.services.analysis.report import Issue

_NUMBER = re.compile(r"\d+(?:\.\d+)?")


@dataclass
class RuleResult:
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)
    observations: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class BlockRules:
    # 模型输出通过 L3 后调用：(模型输出, 本场数据包) -> 规则结果
    check: Callable[[Mapping[str, Any], Mapping[str, Any]], RuleResult]
    # 缺核心指标时由程序直接生成的“数据不足”输出，必须符合本块 output_schema
    insufficient_output: Callable[[list[str]], dict[str, Any]]


def _allowed_numbers(packet: Mapping[str, Any], output: Mapping[str, Any]) -> set[float]:
    """理由里可以出现的数字：输入指标值、模型自己输出的数值、指标名里的数字（如 last10 的 10）。"""
    allowed: set[float] = set()
    values = [v for v in packet["metrics"].values()]
    values += [v for v in output.values() if isinstance(v, (int, float)) and not isinstance(v, bool)]
    for value in values:
        value = abs(float(value))
        allowed.update({round(value, 1), float(round(value))})
        if value <= 1:  # 胜率等 0–1 指标，模型可能写成百分数
            allowed.update({round(value * 100, 1), float(round(value * 100))})
    for name in [*packet["metrics"], *packet["missing"]]:
        allowed.update(float(n) for n in _NUMBER.findall(name))
    return allowed


def common_warnings(output: Mapping[str, Any], packet: Mapping[str, Any]) -> list[Issue]:
    """所有因素块通用的警告：缺失项漏报或误报、理由中的数字找不到来源。"""
    warnings: list[Issue] = []
    reported = set(output.get("missing", []))
    for name in packet["missing"]:
        if name not in reported:
            warnings.append(Issue("L4", "missing_not_reported", f"输入缺少 {name}，输出的 missing 没有列出", "missing"))
    for name in sorted(reported & set(packet["metrics"])):
        warnings.append(Issue("L4", "missing_but_present", f"输出称缺少 {name}，但输入里有这项数据", "missing"))
    allowed = _allowed_numbers(packet, output)
    for i, reason in enumerate(output.get("reasons", [])):
        for text in _NUMBER.findall(reason):
            if round(float(text), 1) not in allowed:
                warnings.append(Issue("L4", "number_not_in_input", f"理由中的 {text} 在输入数据中找不到", f"reasons/{i}"))
    return warnings


def _check_strength(output: Mapping[str, Any], packet: Mapping[str, Any]) -> RuleResult:
    result = RuleResult(warnings=common_warnings(output, packet))
    lean, margin, confidence = output["spread_lean"], output["margin_pts"], output["spread_confidence"]
    if lean == "home" and margin <= 0:
        result.errors.append(Issue("L4", "lean_margin_mismatch", f"方向为 home，但 margin_pts 为 {margin}，应为正数", "margin_pts"))
    elif lean == "away" and margin >= 0:
        result.errors.append(Issue("L4", "lean_margin_mismatch", f"方向为 away，但 margin_pts 为 {margin}，应为负数", "margin_pts"))
    elif lean in {"neutral", "insufficient"} and (margin != 0 or confidence != 0):
        result.errors.append(Issue("L4", "neutral_not_zero", f"方向为 {lean} 时 margin_pts 和 spread_confidence 都应为 0", "spread_lean"))
    elo_margin = packet["metrics"].get("elo_margin")
    if elo_margin is not None:
        # 偏离多少算异常还没有依据，只记录差值。
        result.observations["margin_minus_elo"] = round(margin - elo_margin, 2)
    return result


def _insufficient_strength(missing: list[str]) -> dict[str, Any]:
    return {
        "spread_lean": "insufficient",
        "spread_confidence": 0,
        "margin_pts": 0,
        "total_lean": "neutral",
        "total_confidence": 0,
        "total_pts": 0,
        "reasons": [],
        "missing": list(missing),
    }


RULES: dict[str, BlockRules] = {
    "strength": BlockRules(check=_check_strength, insufficient_output=_insufficient_strength),
}
