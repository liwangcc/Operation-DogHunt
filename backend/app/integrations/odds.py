"""复用已有取数工具；密钥和带 Key 的 URL 不进入接口响应。"""

import importlib.util
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location(
    "doghunt_odds_tool", PROJECT_ROOT / "scripts" / "fetch_nba_odds.py"
)
assert spec is not None and spec.loader is not None
odds_tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(odds_tool)
