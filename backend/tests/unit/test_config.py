from app.config import settings


def test_refresh_token_ttl_default_is_one_year():
    """Defaults to 365 days so refresh cookies don't force monthly re-sign-in.

    Sliding window already in place in /auth/refresh; this is the absolute
    cap for genuinely dormant sessions.
    """
    assert settings.refresh_token_expire_days == 365


class TestOauthSettings:
    def test_oauth_enabled_default_is_true_in_dev(self):
        assert settings.oauth_enabled is True

    def test_oauth_access_token_ttl_default_is_1_hour(self):
        assert settings.oauth_access_token_ttl_seconds == 3600

    def test_oauth_refresh_token_ttl_default_is_30_days(self):
        assert settings.oauth_refresh_token_ttl_seconds == 2592000

    def test_oauth_authorization_code_ttl_default_is_5_minutes(self):
        assert settings.oauth_authorization_code_ttl_seconds == 300

    def test_oauth_register_rate_limit_default(self):
        assert settings.oauth_register_rate_limit == "10/day"
