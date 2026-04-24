"""Integration-test conftest: pin ``settings.frontend_url`` before any
test imports ``mcp_server.server``.

The widget resources registered at ``mcp_server.server`` import time
bake ``settings.frontend_url`` into their CSP meta. The default dev
value is ``http://localhost:5173``; set a production-like value here
so the Apps-SDK CSP is shaped the same way integration tests expect,
regardless of which test triggers the first import.
"""

from app.config import settings

settings.frontend_url = "https://open-orbis.com"
