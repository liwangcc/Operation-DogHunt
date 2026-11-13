from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # 配置文件仅定位本项目 backend/.env，模型凭证由用户提供，不从其他应用导入。
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        env_prefix="DOGHUNT_",
        extra="ignore",
    )

    app_name: str = "Operation DogHunt"
    environment: Literal["development", "test", "production"] = "development"
    model_base_url: str = ""
    model_api_key: SecretStr = SecretStr("")
    model_name: str = ""
    model_reasoning_effort: Literal["none", "minimal", "low", "medium", "high", "xhigh"] = "high"
    model_extra_headers: SecretStr = SecretStr("{}")
    model_timeout_seconds: int = Field(default=120, ge=5, le=300)
    model_max_output_tokens: int = Field(default=4096, ge=128, le=16384)

    @property
    def model_configured(self) -> bool:
        return bool(
            self.model_base_url.strip()
            and self.model_api_key.get_secret_value().strip()
            and self.model_name.strip()
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
