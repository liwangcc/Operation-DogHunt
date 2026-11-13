"""各功能块的 L4 业务规则：jsonschema 查不出的前后矛盾和疑似编造。

错误表示结果自相矛盾、不能使用；警告只记录，留给人工复盘。
每个块在 RULES 里登记一组规则，文件自检会确认每个块都有登记。
方向与分数符号的检查、“数据不足”输出按字段名通用处理，不用每个块各写一遍。
"""

import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from app.services.analysis.report import Issue

_NUMBER = re.compile(r"\d+(?:\.\d+)?")

# 每种玩法的字段名。分数字段二选一：base 是完整基准值，adjust 是本因素的修正值，口径见 shared/glossary.md。
MARKETS: dict[str, dict[str, str]] = {
    "spread": {"lean": "spread_lean", "confidence": "spread_confidence", "base": "margin_pts", "adjust": "margin_adj_pts"},
    "total": {"lean": "total_lean", "confidence": "total_confidence", "base": "total_pts", "adjust": "total_adj_pts"},
}
COMMON_FIELDS = ("reasons", "missing")
# 方向 -> 分数应有的符号；neutral 和 insufficient 另行要求为 0。
_POSITIVE = {"spread": "home", "total": "high"}
_NEGATIVE = {"spread": "away", "total": "low"}
_MISMATCH_CODE = {"spread": "lean_margin_mismatch", "total": "lean_total_mismatch"}

# 季初样本阈值：暂定值，还没有数据依据，只用于警告。
EARLY_SEASON_GAMES = 10
EARLY_SEASON_MAX_CONFIDENCE = 50


@dataclass
class RuleResult:
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)
    observations: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class BlockRules:
    # 模型输出通过 L3 后调用：(模型输出, 本场数据包) -> 规则结果
    check: Callable[[Mapping[str, Any], Mapping[str, Any]], RuleResult]


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


def market_errors(output: Mapping[str, Any], markets: Mapping[str, str]) -> list[Issue]:
    """所有块通用：方向与分数符号一致；方向为 neutral 或 insufficient 时把握和分数为 0。

    基准总分是完整的预计总分，没有判断高低的参照，所以不查符号，neutral 时也不要求为 0。
    """
    errors: list[Issue] = []
    for market, kind in markets.items():
        names = MARKETS[market]
        lean_name, confidence_name, score_name = names["lean"], names["confidence"], names[kind]
        lean, confidence, score = output[lean_name], output[confidence_name], output[score_name]
        full_total = market == "total" and kind == "base"
        if lean in {"neutral", "insufficient"}:
            score_zero = not (full_total and lean == "neutral")
            if confidence != 0 or (score_zero and score != 0):
                fields = f"{score_name} 和 {confidence_name} 都" if score_zero else confidence_name
                errors.append(Issue("L4", "neutral_not_zero", f"方向为 {lean} 时 {fields}应为 0", lean_name))
        elif full_total:
            continue
        elif lean == _POSITIVE[market] and score <= 0:
            errors.append(Issue("L4", _MISMATCH_CODE[market], f"方向为 {lean}，但 {score_name} 为 {score}，应为正数", score_name))
        elif lean == _NEGATIVE[market] and score >= 0:
            errors.append(Issue("L4", _MISMATCH_CODE[market], f"方向为 {lean}，但 {score_name} 为 {score}，应为负数", score_name))
    return errors


def insufficient_output(output_schema: Mapping[str, Any], missing: list[str]) -> dict[str, Any]:
    """缺核心指标时由程序直接生成的“数据不足”输出：方向填 insufficient，数值填 0，固定值照填。"""
    output: dict[str, Any] = {}
    for name, spec in output_schema["properties"].items():
        if "const" in spec:
            output[name] = spec["const"]
        elif name.endswith("_lean"):
            output[name] = "insufficient"
        elif name == "reasons":
            output[name] = []
        elif name == "missing":
            output[name] = list(missing)
        else:
            output[name] = 0
    return output


def _early_season_warnings(output: Mapping[str, Any], packet: Mapping[str, Any]) -> list[Issue]:
    confidence = output["spread_confidence"]
    if confidence <= EARLY_SEASON_MAX_CONFIDENCE:
        return []
    games = [packet["metrics"].get("games_played_home"), packet["metrics"].get("games_played_away")]
    if None in games:
        reason = "缺少本季已赛场次"
    elif min(games) < EARLY_SEASON_GAMES:
        reason = f"有球队本季只打了 {min(games):g} 场"
    else:
        return []
    message = f"{reason}，spread_confidence 为 {confidence}，样本不稳定时不应超过 {EARLY_SEASON_MAX_CONFIDENCE}"
    return [Issue("L4", "early_season_confidence", message, "spread_confidence")]


def _check_strength(output: Mapping[str, Any], packet: Mapping[str, Any]) -> RuleResult:
    result = RuleResult(warnings=common_warnings(output, packet) + _early_season_warnings(output, packet))
    elo_margin = packet["metrics"].get("elo_margin")
    if elo_margin is not None:
        # 偏离多少算异常还没有依据，只记录差值。
        result.observations["margin_minus_elo"] = round(output["margin_pts"] - elo_margin, 2)
    return result


RULES: dict[str, BlockRules] = {
    "strength": BlockRules(check=_check_strength),
}
