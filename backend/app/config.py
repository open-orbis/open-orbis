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

    # LLM Whisperer
    llmwhisperer_api_url: str = "https://llmwhisperer-api.eu-west.unstract.com/api/v2"
    llmwhisperer_api_key: str = ""

    # LLM provider: "ollama" (local) or "claude" (Claude Code CLI subscription)
    llm_provider: str = "ollama"
    claude_model: str = "claude-opus-4-6"

    # Ollama (local LLM)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"

    # Whisper (speech-to-text)
    whisper_api_url: str = "http://localhost:9000"

    # URLs
    frontend_url: str = "http://localhost:5173"

    model_config = {"env_file": ["../.env", ".env"], "env_file_encoding": "utf-8"}


settings = Settings()
