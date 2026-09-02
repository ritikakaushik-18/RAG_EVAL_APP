from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import field_validator

# .env lives in the project root, one level above this file
_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_BUCKET_NAME: str
    AWS_REGION: str = "us-east-1"

    OPENROUTER_API_KEY: str
    OPENROUTER_MODEL: str = "anthropic/claude-3-haiku"

    COHERE_API_KEY: str = ""

    # LangSmith tracing (env file uses LANGSMITH_* prefix)
    LANGSMITH_TRACING: str = "false"
    LANGSMITH_ENDPOINT: str = "https://api.smith.langchain.com"
    LANGSMITH_API_KEY: str = ""
    LANGSMITH_PROJECT: str = "rag-eval"

    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    APP_BASE_URL: str = ""  # e.g. https://rageval.app — used in GitHub comment links

    @field_validator("DATABASE_URL")
    @classmethod
    def fix_async_driver(cls, v: str) -> str:
        # SQLAlchemy async requires the asyncpg driver prefix
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    model_config = {"env_file": str(_ENV_FILE), "extra": "ignore"}


settings = Settings()
