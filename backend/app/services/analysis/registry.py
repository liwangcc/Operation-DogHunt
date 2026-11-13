"""读取功能块定义文件并做 L1 自检。

每个块由同名的两份文件组成：blocks/{版本}.md（给模型）和 blocks/{版本}.schema.json（给程序）。
自检不通过时抛出 BlockDefinitionError，一次列出该文件的全部问题。
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

from app.services.analysis.rules import COMMON_FIELDS, MARKETS, RULES, BlockRules, insufficient_output

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
SHARED_FILES = ("rules.md", "glossary.md")
REQUIRED_SECTIONS = ("角色", "输入说明", "分析方法", "禁止事项", "输出要求")

_VERSION = re.compile(r"^([a-z][a-z0-9_]*?)_v(\d+)$")
_INPUT_NAME = re.compile(r"^[a-z][a-z0-9_]*$")


class BlockDefinitionError(Exception):
    pass


@dataclass(frozen=True)
class BlockDefinition:
    id: str
    version: str
    prompt: str
    core_inputs: tuple[str, ...]
    optional_inputs: tuple[str, ...]
    output_schema: dict[str, Any]
    rules: BlockRules = field(compare=False)
    validator: Draft202012Validator = field(compare=False)
    # 本块输出的玩法及分数口径，如 {"spread": "base"}；由 output_schema 的字段名推出。
    markets: dict[str, str] = field(compare=False)

    @property
    def inputs(self) -> tuple[str, ...]:
        return self.core_inputs + self.optional_inputs

    def insufficient_output(self, missing: list[str]) -> dict[str, Any]:
        return insufficient_output(self.output_schema, missing)


@dataclass(frozen=True)
class SharedText:
    files: dict[str, str]  # 文件名 -> 内容，按拼装顺序


def _reject_constant(value: str):
    raise ValueError(f"不允许 {value}")


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=_reject_constant)


def _check_prompt(stem: str, prompt: str) -> list[str]:
    problems = []
    first = prompt.splitlines()[0].strip() if prompt.strip() else ""
    if first != f"# {stem}":
        problems.append(f"第一行应为“# {stem}”，实际为“{first}”")
    headings = [line[3:].strip() for line in prompt.splitlines() if line.startswith("## ")]
    present = [h for h in headings if h in REQUIRED_SECTIONS]
    if present != list(REQUIRED_SECTIONS):
        problems.append(f"二级标题必须按顺序包含 {'、'.join(REQUIRED_SECTIONS)}，实际为 {'、'.join(headings) or '无'}")
    return problems


def _check_inputs(inputs: Any, prompt: str) -> list[str]:
    if not isinstance(inputs, dict) or set(inputs) != {"core", "optional"}:
        return ["inputs 必须只包含 core 和 optional 两项"]
    problems = []
    core, optional = inputs["core"], inputs["optional"]
    for key, names in (("core", core), ("optional", optional)):
        if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
            problems.append(f"inputs.{key} 必须是字符串列表")
            return problems
        bad = [n for n in names if not _INPUT_NAME.match(n)]
        if bad:
            problems.append(f"inputs.{key} 中的名称只能用小写字母、数字和下划线：{bad}")
        if len(set(names)) != len(names):
            problems.append(f"inputs.{key} 有重复名称")
    if not core:
        problems.append("inputs.core 至少要有一项，否则无法判断何时数据不足")
    overlap = set(core) & set(optional)
    if overlap:
        problems.append(f"指标同时出现在 core 和 optional：{sorted(overlap)}")
    undocumented = [n for n in core + optional if f"`{n}`" not in prompt]
    if undocumented:
        problems.append(f"这些指标没有在 .md 的输入说明里出现：{undocumented}")
    return problems


def _check_output_schema(schema: Any) -> list[str]:
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as error:
        return [f"output_schema 不是合法的 JSON Schema：{error.message}"]
    if not isinstance(schema, dict) or schema.get("type") != "object":
        return ["output_schema 的 type 必须是 object"]
    problems = []
    if schema.get("additionalProperties") is not False:
        problems.append("output_schema 的 additionalProperties 必须为 false")
    properties = set(schema.get("properties", {}))
    required = schema.get("required", [])
    if not properties or set(required) != properties or len(required) != len(set(required)):
        problems.append("output_schema 的 required 必须恰好列出全部 properties")
    return problems


def _check_markets(properties: Any) -> tuple[dict[str, str], list[str]]:
    """按字段名推出本块输出哪些玩法、分数是基准还是修正。每种玩法要么字段齐全，要么一个都不出现。"""
    names = list(properties) if isinstance(properties, dict) else []
    known = set(COMMON_FIELDS) | {n for fields in MARKETS.values() for n in fields.values()}
    problems = []
    if unknown := [n for n in names if n not in known]:
        problems.append(f"output_schema 有未约定的字段 {unknown}，字段口径见 shared/glossary.md")
    if absent := [n for n in COMMON_FIELDS if n not in names]:
        problems.append(f"output_schema 缺少 {absent}")
    markets: dict[str, str] = {}
    for market, fields in MARKETS.items():
        present = [n for n in fields.values() if n in names]
        if not present:
            continue
        scores = [kind for kind in ("base", "adjust") if fields[kind] in names]
        if fields["lean"] not in names or fields["confidence"] not in names or len(scores) != 1:
            problems.append(
                f"{market} 的字段不完整：需要 {fields['lean']}、{fields['confidence']}，"
                f"以及 {fields['base']}（基准）和 {fields['adjust']}（修正）二选一，实际为 {present}"
            )
            continue
        markets[market] = scores[0]
    if not markets and not problems:
        problems.append("output_schema 至少要输出一种玩法（让分或总分）")
    return markets, problems


def load_block(md_path: Path) -> BlockDefinition:
    stem = md_path.name.removesuffix(".md")
    schema_path = md_path.with_name(f"{stem}.schema.json")
    match = _VERSION.match(stem)
    if not match:
        raise BlockDefinitionError(f"{md_path.name}：文件名应为“块编号_v版本号.md”，只用小写字母、数字和下划线")
    if not schema_path.is_file():
        raise BlockDefinitionError(f"{md_path.name}：缺少同名的 {schema_path.name}")

    prompt = md_path.read_text(encoding="utf-8")
    try:
        definition = _read_json(schema_path)
    except ValueError as error:
        raise BlockDefinitionError(f"{schema_path.name}：不是合法 JSON（{error}）") from None
    if not isinstance(definition, dict) or set(definition) != {"id", "version", "inputs", "output_schema"}:
        raise BlockDefinitionError(f"{schema_path.name}：只能且必须包含 id、version、inputs、output_schema")

    block_id = match.group(1)
    problems = _check_prompt(stem, prompt)
    if definition["version"] != stem:
        problems.append(f"schema 的 version 为 {definition['version']}，应与文件名 {stem} 一致")
    if definition["id"] != block_id:
        problems.append(f"schema 的 id 为 {definition['id']}，应与文件名中的块编号 {block_id} 一致")
    problems += _check_inputs(definition["inputs"], prompt)
    problems += _check_output_schema(definition["output_schema"])
    schema = definition["output_schema"]
    markets, market_problems = _check_markets(schema.get("properties") if isinstance(schema, dict) else None)
    problems += market_problems
    rules = RULES.get(block_id)
    if rules is None:
        problems.append(f"rules.py 的 RULES 里没有登记 {block_id} 的业务规则")
    if problems:
        raise BlockDefinitionError(f"{md_path.name}：" + "；".join(problems))

    validator = Draft202012Validator(definition["output_schema"])
    sample = insufficient_output(definition["output_schema"], list(definition["inputs"]["core"]))
    if not validator.is_valid(sample):
        raise BlockDefinitionError(f"{md_path.name}：程序生成的“数据不足”输出不符合 output_schema（方向字段要允许 insufficient，数值字段要允许 0）")
    return BlockDefinition(
        id=block_id,
        version=stem,
        prompt=prompt,
        core_inputs=tuple(definition["inputs"]["core"]),
        optional_inputs=tuple(definition["inputs"]["optional"]),
        output_schema=definition["output_schema"],
        rules=rules,
        validator=validator,
        markets=markets,
    )


def load_blocks(prompts_dir: Path = PROMPTS_DIR) -> dict[str, BlockDefinition]:
    """读取全部块，按版本号索引。任何一个块自检失败都会抛错，问题合并报告。"""
    blocks_dir = prompts_dir / "blocks"
    md_stems = {p.name.removesuffix(".md") for p in blocks_dir.glob("*.md")}
    orphan = sorted(p.name for p in blocks_dir.glob("*.schema.json") if p.name.removesuffix(".schema.json") not in md_stems)
    problems = [f"{name}：缺少同名的 .md 文件" for name in orphan]
    blocks: dict[str, BlockDefinition] = {}
    for md_path in sorted(blocks_dir.glob("*.md")):
        try:
            block = load_block(md_path)
            blocks[block.version] = block
        except BlockDefinitionError as error:
            problems.append(str(error))
    if problems:
        raise BlockDefinitionError("\n".join(problems))
    return blocks


def load_shared(prompts_dir: Path = PROMPTS_DIR) -> SharedText:
    files = {}
    for name in SHARED_FILES:
        path = prompts_dir / "shared" / name
        if not path.is_file() or not path.read_text(encoding="utf-8").strip():
            raise BlockDefinitionError(f"shared/{name}：文件缺失或为空")
        files[name] = path.read_text(encoding="utf-8")
    return SharedText(files=files)
