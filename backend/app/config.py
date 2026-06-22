from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "production"
    db_user: str = "admin"
    db_password: str = "admin"

    aws_region: str = "eu-central-1"
    aws_endpoint_url: str | None = None
    recalc_lambda_name: str = "pyramydal-prod-recalc"

    @field_validator("aws_endpoint_url", mode="before")
    @classmethod
    def empty_endpoint_is_none(cls, value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, str) and value.strip() == "":
            return None
        return value  # type: ignore[return-value]


settings = Settings()
