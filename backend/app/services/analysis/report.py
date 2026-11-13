"""检查报告：各层检查共用的问题和结果结构。"""

from dataclasses import dataclass, field
from typing import Any, Literal

Status = Literal["ok", "warning", "invalid", "skipped"]


@dataclass(frozen=True)
class Issue:
    # model 表示接口报错、超时或无法纠正，不属于四层检查。
    layer: Literal["L1", "L2", "L3", "L4", "model"]
    code: str
    message: str
    path: str = ""

    def to_dict(self) -> dict[str, str]:
        return {"layer": self.layer, "code": self.code, "path": self.path, "message": self.message}


@dataclass
class CheckReport:
    status: Status
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)
    # 只记录、不判对错的观察值，例如模型分差与 Elo 分差的差值。
    observations: dict[str, Any] = field(default_factory=dict)
    corrected: bool = False

    @property
    def usable(self) -> bool:
        """只有 ok 和 warning 可以交给汇总块。"""
        return self.status in {"ok", "warning"}

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "errors": [i.to_dict() for i in self.errors],
            "warnings": [i.to_dict() for i in self.warnings],
            "observations": self.observations,
            "corrected": self.corrected,
        }


def status_of(errors: list[Issue], warnings: list[Issue]) -> Status:
    if errors:
        return "invalid"
    return "warning" if warnings else "ok"
