"""Unit tests for the CV templates router."""

from __future__ import annotations

from io import BytesIO
from unittest.mock import AsyncMock, patch

# ---------------------------------------------------------------------------
# Shared fixture data
# ---------------------------------------------------------------------------

_PRELOADED_ROW = {
    "id": "preloaded-1",
    "name": "Classic CV",
    "description": "A classic template",
    "engine": "xelatex",
    "license": "MIT",
    "is_preloaded": True,
    "thumbnail_path": None,
    "gcs_bundle_path": "templates/classic/",
    "tex_content": r"\documentclass{article}\begin{document}Hello\end{document}",
    "user_id": None,
}

_USER_ROW = {
    "id": "user-tpl-1",
    "name": "My Template",
    "description": None,
    "engine": "pdflatex",
    "license": None,
    "is_preloaded": False,
    "thumbnail_path": None,
    "gcs_bundle_path": "user-templates/test-user/user-tpl-1/",
    "tex_content": r"\documentclass{article}\begin{document}Custom\end{document}",
    "user_id": "test-user",
}


# ---------------------------------------------------------------------------
# list_templates
# ---------------------------------------------------------------------------


@patch(
    "app.cv.templates.router.templates_db.list_templates_for_user",
    new_callable=AsyncMock,
)
def test_list_templates_returns_items(mock_list, client):
    """GET /cv/templates returns list items without tex_content."""
    mock_list.return_value = [_PRELOADED_ROW, _USER_ROW]

    response = client.get("/cv/templates")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["id"] == "preloaded-1"
    assert data[0]["name"] == "Classic CV"
    assert "tex_content" not in data[0]
    assert data[1]["id"] == "user-tpl-1"
    mock_list.assert_called_once_with("test-user")


# ---------------------------------------------------------------------------
# get_template
# ---------------------------------------------------------------------------


@patch(
    "app.cv.templates.router.templates_db.get_template",
    new_callable=AsyncMock,
)
def test_get_template_returns_detail(mock_get, client):
    """GET /cv/templates/{id} returns full detail including tex_content."""
    mock_get.return_value = _PRELOADED_ROW

    response = client.get("/cv/templates/preloaded-1")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "preloaded-1"
    assert "tex_content" in data
    assert data["tex_content"] == _PRELOADED_ROW["tex_content"]


@patch(
    "app.cv.templates.router.templates_db.get_template",
    new_callable=AsyncMock,
)
def test_get_template_404_for_nonexistent(mock_get, client):
    """GET /cv/templates/{id} returns 404 when template is not found."""
    mock_get.return_value = None

    response = client.get("/cv/templates/does-not-exist")

    assert response.status_code == 404


@patch(
    "app.cv.templates.router.templates_db.get_template",
    new_callable=AsyncMock,
)
def test_get_template_404_for_other_user_template(mock_get, client):
    """GET /cv/templates/{id} returns 404 for a template owned by someone else."""
    other_user_row = {**_USER_ROW, "user_id": "someone-else"}
    mock_get.return_value = other_user_row

    response = client.get("/cv/templates/user-tpl-1")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# upload_template
# ---------------------------------------------------------------------------


@patch(
    "app.cv.templates.router.templates_db.create_template",
    new_callable=AsyncMock,
)
def test_upload_template_success(mock_create, client):
    """POST /cv/templates/upload stores the template and returns list item."""
    mock_create.return_value = _USER_ROW

    tex_bytes = _USER_ROW["tex_content"].encode()
    response = client.post(
        "/cv/templates/upload",
        data={"name": "My Template", "engine": "pdflatex"},
        files={"tex_file": ("cv.tex", BytesIO(tex_bytes), "text/plain")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "user-tpl-1"
    mock_create.assert_called_once()


@patch(
    "app.cv.templates.router.templates_db.create_template",
    new_callable=AsyncMock,
)
def test_upload_template_rejects_dangerous_tex(mock_create, client):
    """POST /cv/templates/upload returns 422 for unsafe tex content."""
    dangerous_tex = r"\write18{rm -rf /}"

    response = client.post(
        "/cv/templates/upload",
        data={"name": "Evil", "engine": "xelatex"},
        files={"tex_file": ("evil.tex", BytesIO(dangerous_tex.encode()), "text/plain")},
    )

    assert response.status_code == 422
    mock_create.assert_not_called()


# ---------------------------------------------------------------------------
# compile
# ---------------------------------------------------------------------------


@patch("app.cv.templates.router.service.compile_tex", new_callable=AsyncMock)
@patch("app.cv.templates.router.service.render_tex_with_jinja")
@patch("app.cv.templates.router._fetch_orb_data", new_callable=AsyncMock)
@patch(
    "app.cv.templates.router.templates_db.get_template",
    new_callable=AsyncMock,
)
def test_compile_returns_pdf(mock_get, mock_fetch, mock_render, mock_compile, client):
    """POST /cv/compile returns PDF bytes on success."""
    mock_get.return_value = _PRELOADED_ROW
    mock_fetch.return_value = ({"name": "Test User"}, [])
    mock_render.return_value = (
        r"\documentclass{article}\begin{document}Hi\end{document}"
    )
    mock_compile.return_value = b"%PDF-1.4 fake pdf"

    response = client.post(
        "/cv/compile",
        json={"template_id": "preloaded-1"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content == b"%PDF-1.4 fake pdf"


@patch(
    "app.cv.templates.router.templates_db.get_template",
    new_callable=AsyncMock,
)
def test_compile_404_for_nonexistent_template(mock_get, client):
    """POST /cv/compile returns 404 when template does not exist."""
    mock_get.return_value = None

    response = client.post(
        "/cv/compile",
        json={"template_id": "ghost-template"},
    )

    assert response.status_code == 404


@patch("app.cv.templates.router.service.compile_tex", new_callable=AsyncMock)
@patch("app.cv.templates.router.service.render_tex_with_jinja")
@patch("app.cv.templates.router._fetch_orb_data", new_callable=AsyncMock)
@patch(
    "app.cv.templates.router.templates_db.get_template",
    new_callable=AsyncMock,
)
def test_compile_with_custom_tex_content(
    mock_get, mock_fetch, mock_render, mock_compile, client
):
    """POST /cv/compile uses user-provided tex_content when supplied."""
    mock_get.return_value = _PRELOADED_ROW
    mock_fetch.return_value = ({"name": "Test User"}, [])
    custom_tex = r"\documentclass{article}\begin{document}Custom\end{document}"
    mock_render.return_value = custom_tex
    mock_compile.return_value = b"%PDF-1.4 custom"

    response = client.post(
        "/cv/compile",
        json={"template_id": "preloaded-1", "tex_content": custom_tex},
    )

    assert response.status_code == 200
    assert response.content == b"%PDF-1.4 custom"
    # render_tex_with_jinja should have been called with the custom content
    mock_render.assert_called_once_with(custom_tex, {"name": "Test User"}, [])


@patch(
    "app.cv.templates.router.templates_db.get_template",
    new_callable=AsyncMock,
)
def test_compile_rejects_dangerous_tex_content(mock_get, client):
    """POST /cv/compile returns 422 when custom tex_content is unsafe."""
    mock_get.return_value = _PRELOADED_ROW

    response = client.post(
        "/cv/compile",
        json={
            "template_id": "preloaded-1",
            "tex_content": r"\write18{cat /etc/passwd}",
        },
    )

    assert response.status_code == 422
