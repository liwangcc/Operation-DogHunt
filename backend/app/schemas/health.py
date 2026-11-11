from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    app: str
    environment: Literal["development", "test", "production"]
    version: str
