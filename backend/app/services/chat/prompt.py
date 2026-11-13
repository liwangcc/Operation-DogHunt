"""读取、检查并拼装聊天助手的静态提示词。

提示词文件在 app/prompts/chat/，当前版本与各文件哈希记在 versions.lock.json。
锁文件由维护 Skill（$chat-prompt-maintenance）通过本模块的命令行更新，不手写：

    .venv/bin/python -m app.services.chat.prompt check
    .venv/bin/python -m app.services.chat.prompt lock [--active chat_role_v2 ...]

check 列出所有问题；lock 登记新版本文件、可切换当前版本，拒绝改写已登记版本的哈希。
"""

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

CHAT_DIR = Path(__file__).resolve().parents[2] / "prompts" / "chat"
LOCK_NAME = "versions.lock.json"
CHANGELOG_NAME = "CHANGELOG.md"
# 拼装顺序固定；每个模块在 active 里恰好一个版本。
MODULES = ("role", "sources", "odds", "method", "output")
_FILE = re.compile(r"^chat_([a-z]+)_v(\d+)\.md$")


class ChatPromptError(Exception):
    pass


@dataclass(frozen=True)
class ChatPrompt:
    versions: tuple[str, ...]
    text: str
    sha256: str
    locked: bool  # False 表示文件和锁文件对不上，日志里的哈希是实际内容的哈希


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _prompt_files(directory: Path) -> dict[str, Path]:
    return {p.stem: p for p in sorted(directory.glob("chat_*.md")) if _FILE.match(p.name)}


def _load_lock(directory: Path) -> dict:
    path = directory / LOCK_NAME
    if not path.exists():
        raise ChatPromptError(f"缺少 {LOCK_NAME}，请运行 $chat-prompt-maintenance 生成")
    try:
        lock = json.loads(_read(path))
    except json.JSONDecodeError as exc:
        raise ChatPromptError(f"{LOCK_NAME} 不是合法 JSON：{exc}") from exc
    if not isinstance(lock, dict) or not isinstance(lock.get("active"), list) or not isinstance(lock.get("files"), dict):
        raise ChatPromptError(f"{LOCK_NAME} 缺少 active 或 files")
    return lock


def _check_active(active: list) -> list[str]:
    modules = [_FILE.match(f"{v}.md").group(1) if isinstance(v, str) and _FILE.match(f"{v}.md") else None for v in active]
    if modules != list(MODULES):
        return [f"active 必须按 {' → '.join(MODULES)} 的顺序各列一个版本，当前是 {active}"]
    return []


def assemble(directory: Path, versions: list[str]) -> str:
    parts = [_read(directory / f"{v}.md").strip() for v in versions]
    return "\n\n".join(parts) + "\n"


def check(directory: Path = CHAT_DIR) -> list[str]:
    """返回全部问题；空列表表示文件、锁文件和改版记录一致。"""
    try:
        lock = _load_lock(directory)
    except ChatPromptError as exc:
        return [str(exc)]
    problems = _check_active(lock["active"])
    files = _prompt_files(directory)
    for stray in sorted(p.name for p in directory.glob("*.md") if p.name.startswith("chat_") and not _FILE.match(p.name)):
        problems.append(f"{stray}：文件名应为 chat_{{模块}}_v{{数字}}.md")
    for stem, path in files.items():
        first = _read(path).splitlines()[:1]
        if first != [f"# {stem}"]:
            problems.append(f"{path.name}：第一行必须是 `# {stem}`")
        if _FILE.match(path.name).group(1) not in MODULES:
            problems.append(f"{path.name}：模块名不在 {MODULES} 中")
        if stem not in lock["files"]:
            problems.append(f"{path.name}：未登记到 {LOCK_NAME}，请运行 $chat-prompt-maintenance 记录改版")
    changelog = _read(directory / CHANGELOG_NAME) if (directory / CHANGELOG_NAME).exists() else ""
    headings = set(re.findall(r"^### (chat_[a-z]+_v\d+)", changelog, re.M))
    for stem, entry in lock["files"].items():
        path = directory / f"{stem}.md"
        if not path.exists():
            problems.append(f"{stem}.md：锁文件里登记了，但文件不存在（旧版本不能删除）")
            continue
        if not isinstance(entry, dict) or entry.get("sha256") != _sha256(_read(path)):
            problems.append(f"{stem}.md：内容和锁文件记录的哈希不一致，修改没有记录；请运行 $chat-prompt-maintenance")
        if stem not in headings:
            problems.append(f"{stem}：{CHANGELOG_NAME} 里没有 `### {stem}` 条目")
    for v in lock["active"]:
        if isinstance(v, str) and v not in lock["files"]:
            problems.append(f"active 里的 {v} 没有登记在 files 中")
    if not problems and lock.get("static_sha256") != _sha256(assemble(directory, lock["active"])):
        problems.append("static_sha256 和当前版本拼装结果不一致，请重新运行 lock")
    return problems


def build(directory: Path = CHAT_DIR) -> ChatPrompt:
    lock = _load_lock(directory)
    if problems := _check_active(lock["active"]):
        raise ChatPromptError(problems[0])
    for v in lock["active"]:
        path = directory / f"{v}.md"
        if not path.exists():
            raise ChatPromptError(f"当前版本文件 {path.name} 不存在")
        if _read(path).splitlines()[:1] != [f"# {v}"]:
            raise ChatPromptError(f"{path.name}：第一行必须是 `# {v}`")
    text = assemble(directory, lock["active"])
    digest = _sha256(text)
    return ChatPrompt(tuple(lock["active"]), text, digest, digest == lock.get("static_sha256"))


@lru_cache(maxsize=1)
def static_prompt() -> ChatPrompt:
    """进程内只读一次；修改提示词文件后需要重启后端。"""
    return build()


def update_lock(directory: Path = CHAT_DIR, active: list[str] | None = None) -> dict:
    """登记新版本文件并重算拼装哈希。已登记版本的内容不得改变。"""
    path = directory / LOCK_NAME
    lock = _load_lock(directory) if path.exists() else {"active": [], "files": {}}
    files = dict(lock["files"])
    for stem, file in _prompt_files(directory).items():
        content = _read(file)
        digest = _sha256(content)
        if stem in files and files[stem].get("sha256") != digest:
            raise ChatPromptError(f"{file.name} 已登记过，内容不能再改；请把改动另存为新版本")
        files[stem] = {"sha256": digest, "chars": len(content)}
    new_active = active if active is not None else lock["active"]
    if problems := _check_active(new_active):
        raise ChatPromptError(problems[0])
    if missing := [v for v in new_active if v not in files]:
        raise ChatPromptError(f"找不到版本文件：{missing}")
    result = {
        "active": list(new_active),
        "files": dict(sorted(files.items())),
        "static_sha256": _sha256(assemble(directory, new_active)),
        "static_chars": len(assemble(directory, new_active)),
    }
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="聊天提示词检查与锁文件维护")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check")
    lock_cmd = sub.add_parser("lock")
    lock_cmd.add_argument("--active", nargs="+", help="新的当前版本，按 role sources odds method output 顺序")
    lock_cmd.add_argument("--dir", type=Path, default=CHAT_DIR)
    args = parser.parse_args(argv)
    try:
        if args.command == "check":
            problems = check()
            for p in problems:
                print(f"- {p}")
            print("通过" if not problems else f"共 {len(problems)} 个问题")
            return 1 if problems else 0
        result = update_lock(args.dir, args.active)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except ChatPromptError as exc:
        print(f"失败：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
