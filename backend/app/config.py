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
    llm_provider: str = "claude"
    claude_model: str = "claude-opus-4-6"

    # Ollama (local LLM)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # LinkedIn OAuth (login app — "Sign In with LinkedIn using OpenID Connect")
    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_redirect_uri: str = "http://localhost:5173/auth/linkedin/callback"

    # URLs
    frontend_url: str = "http://localhost:5173"

    # Resend (email notifications)
    resend_api_key: str = ""
    email_from: str = "OpenOrbis <noreply@openorbis.com>"

    # Closed-beta invitation system. When True, signups (first-time logins)
    # require a valid AccessCode AND a free seat under the cap stored in the
    # singleton :BetaConfig node. The cap itself is modified at runtime via
    # the /admin/beta-config endpoint; `beta_default_cap` is only used to
    # seed the BetaConfig node on first read after a fresh deploy.
    invite_only_registration: bool = True
    beta_default_cap: int = 2000

    # Share token default TTL in days. Set to 0 for no expiry.
    share_token_default_ttl_days: int = 90

    model_config = {
        "env_file": ["../.env", ".env"],
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
