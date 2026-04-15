"""Tests for Cloud Tasks client."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.cv.cloud_tasks import cancel_cv_job, dispatch_cv_job, verify_oidc_token


@patch("app.cv.cloud_tasks._get_client")
@patch("app.cv.cloud_tasks.settings")
def test_dispatch_cv_job(mock_settings, mock_get_client):
    mock_settings.gcp_project_id = "my-project"
    mock_settings.cloud_tasks_location = "europe-west1"
    mock_settings.cloud_tasks_queue = "orbis-cv-queue"
    mock_settings.cloud_run_url = "https://my-service.run.app"
    mock_settings.cloud_run_service_account = "sa@project.iam.gserviceaccount.com"

    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    mock_client.queue_path.return_value = (
        "projects/my-project/locations/europe-west1/queues/orbis-cv-queue"
    )
    mock_task = MagicMock()
    mock_task.name = (
        "projects/my-project/locations/europe-west1/queues/orbis-cv-queue/tasks/abc123"
    )
    mock_client.create_task.return_value = mock_task

    task_name = dispatch_cv_job(job_id="j1")
    assert task_name == mock_task.name
    mock_client.create_task.assert_called_once()


@patch("app.cv.cloud_tasks._get_client")
def test_cancel_cv_job(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    cancel_cv_job("projects/my-project/locations/eu/queues/q/tasks/t")
    mock_client.delete_task.assert_called_once()


@patch("app.cv.cloud_tasks._get_client")
def test_cancel_cv_job_not_found(mock_get_client):
    from google.api_core.exceptions import NotFound

    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    mock_client.delete_task.side_effect = NotFound("task gone")
    # Should not raise
    cancel_cv_job("projects/my-project/locations/eu/queues/q/tasks/t")


def test_verify_oidc_token_missing():
    result = verify_oidc_token(None)
    assert result is None


def test_verify_oidc_token_no_bearer():
    result = verify_oidc_token("Basic abc123")
    assert result is None
