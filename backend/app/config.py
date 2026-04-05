from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "orbis_dev_password"

    # JWT
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # Encryption
    encryption_key: str = ""

    # Claude API
    anthropic_api_key: str = ""

    # LLM provider: "ollama" (local) or "claude" (Claude Code CLI subscription)
    llm_provider: str = "ollama"
    claude_model: str = "claude-opus-4-6"

    # Ollama (local LLM)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"

    # URLs
    frontend_url: str = "http://localhost:5173"

    # Analytics (set to false to disable all tracking)
    analytics_enabled: bool = True

    # PostHog analytics
    posthog_api_key: str = ""
    posthog_host: str = "http://localhost:8001"
    posthog_project_id: int = 1

    # Admin auth (separate from user JWT)
    admin_jwt_secret: str = "admin-change-me"
    admin_jwt_algorithm: str = "HS256"
    admin_jwt_expire_minutes: int = 60

    # Admin database (PostHog's PostgreSQL)
    admin_db_host: str = "localhost"
    admin_db_port: int = 5433
    admin_db_name: str = "posthog"
    admin_db_user: str = "posthog"
    admin_db_password: str = "posthog_dev_password"

    model_config = {
        "env_file": ["../.env", ".env"],
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
