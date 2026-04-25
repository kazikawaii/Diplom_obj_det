from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_MODELS_DIR = ROOT_DIR / "models"


class Settings(BaseSettings):
    app_name: str = "YOLO Web API"
    app_version: str = "0.1.0"
    models_dir: Path = DEFAULT_MODELS_DIR
    model_config = SettingsConfigDict(env_prefix="APP_", env_file=".env", extra="ignore")


settings = Settings()
