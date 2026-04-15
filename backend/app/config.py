from pydantic import model_validator
from pydantic_settings import BaseSettings

# Values that must never appear in a non-development environment.
# Keep in sync with .env.example placeholders.
_INSECURE_JWT_SECRETS = {"", "change-me", "change-me-to-a-random-secret"}
_INSECURE_ENCRYPTION_KEYS = {"", "change-me-generate-with-fernet"}
_INSECURE_NEO4J_PASSWORDS = {"orbis_dev_password"}


class Settings(BaseSettings):
    # Runtime environment. Controls fail-fast behavior on insecure defaults:
    # anything other than "development" is treated as production and will
    # refuse to start with placeholder secrets.
    env: str = "development"

    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "orbis_dev_password"

    # JWT / access token — short-lived. Long sessions are sustained by the
    # refresh token cookie, which rotates transparently from the frontend.
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 15

    # Refresh token TTL in days. Refresh tokens are persisted in Neo4j
    # (as sha256 hashes) so they can be rotated and revoked.
    refresh_token_expire_days: int = 30

    # Cookie scoping. Empty = host-only cookie (works when frontend and
    # backend share a single origin via reverse proxy). Set to the parent
    # domain if you split the API onto a subdomain in the future.
    cookie_domain: str = ""

    # Encryption — active key + optional comma-separated historic keys
    # used for decrypting data encrypted with a previous key during rotation.
    encryption_key: str = ""
    encryption_keys_historic: str = ""

    # Claude API (used only when llm_provider=cli for local dev)
    anthropic_api_key: str = ""

    # LLM provider: "vertex" (Vertex AI, default for production),
    # "cli" (Claude Code CLI subprocess, for local dev),
    # "ollama" (local Ollama, for local dev).
    llm_provider: str = "vertex"
    claude_model: str = "claude-opus-4-6"
    gemini_model: str = "gemini-2.5-pro"

    # Vertex AI configuration (used when llm_provider=vertex)
    gcp_project_id: str = ""
    vertex_region: str = "europe-west1"

    # LLM fallback chain — comma-separated list of providers to try in order.
    # Valid entries: "claude-opus", "claude-sonnet", "gemini-pro", "ollama",
    # "rule-based".
    # When empty, a single-provider chain is derived from llm_provider.
    llm_fallback_chain: str = ""
    # Per-provider timeout in seconds before falling back to the next provider.
    llm_timeout_seconds: int = 300

    # Ollama (local LLM, used only when llm_provider=ollama)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"

    # GCS bucket for CV file storage (empty = local filesystem with Fernet)
    cv_storage_bucket: str = ""

    # PostgreSQL (tabular data: drafts, ideas, snapshots, CV metadata)
    # In production, Cloud Run connects via unix socket:
    #   postgresql://orbis:PASS@/orbis?host=/cloudsql/PROJECT:REGION:INSTANCE
    database_url: str = ""

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # LinkedIn OAuth (login app — "Sign In with LinkedIn using OpenID Connect")
    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_redirect_uri: str = "http://localhost:5173/auth/linkedin/callback"

    # URLs
    frontend_url: str = "http://localhost:5173"
    cors_extra_origins: str = ""  # comma-separated extra CORS origins

    # Resend (email notifications)
    resend_api_key: str = ""
    email_from: str = "OpenOrbis <noreply@open-orbis.com>"

    # Closed-beta invitation system. When True, signups (first-time logins)
    # require a valid AccessCode AND a free seat under the cap stored in the
    # singleton :BetaConfig node. The cap itself is modified at runtime via
    # the /admin/beta-config endpoint; `beta_default_cap` is only used to
    # seed the BetaConfig node on first read after a fresh deploy.
    invite_only_registration: bool = True
    beta_default_cap: int = 2000

    # Share token default TTL in days. Set to 0 for no expiry.
    share_token_default_ttl_days: int = 90

    # Cloud Tasks (background CV processing)
    cloud_tasks_queue: str = ""  # e.g. "orbis-cv-queue"
    cloud_tasks_location: str = "europe-west1"
    cloud_run_url: str = (
        ""  # e.g. "https://orbis-api-390775751253.europe-west1.run.app"
    )
    cloud_run_service_account: str = (
        ""  # e.g. "390775751253-compute@developer.gserviceaccount.com"
    )

    # Account cleanup interval in hours (0 = startup-only, no recurring task)
    cleanup_interval_hours: int = 24

    # GCS bucket for LaTeX template bundles (cls, fonts, thumbnails)
    templates_bucket: str = ""

    # LaTeX compilation timeout in seconds
    tectonic_timeout_seconds: int = 120

    model_config = {
        "env_file": ["../.env", ".env"],
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @model_validator(mode="after")
    def _refuse_insecure_production_config(self) -> "Settings":
        if self.env == "development":
            return self
        errors: list[str] = []
        if self.jwt_secret in _INSECURE_JWT_SECRETS:
            errors.append("JWT_SECRET must be set to a secure random value")
        if self.encryption_key in _INSECURE_ENCRYPTION_KEYS:
            errors.append("ENCRYPTION_KEY must be set to a valid Fernet key")
        if self.neo4j_password in _INSECURE_NEO4J_PASSWORDS:
            errors.append("NEO4J_PASSWORD must not use the default dev value")
        if errors:
            raise RuntimeError(
                "Insecure configuration detected with ENV="
                + self.env
                + ":\n  - "
                + "\n  - ".join(errors)
                + "\nRefusing to start. See .env.example for guidance."
            )
        if not self.cookie_domain:
            import logging

            logging.getLogger(__name__).warning(
                "COOKIE_DOMAIN is empty in ENV=%s. Cookies will be host-only "
                "and won't work if frontend and API are on different "
                "subdomains. Set COOKIE_DOMAIN to the parent domain.",
                self.env,
            )
        return self


settings = Settings()
