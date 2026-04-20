"""Google Cloud Tasks client for dispatching and cancelling CV processing jobs."""

from __future__ import annotations

import json
import logging

from google.api_core.exceptions import NotFound
from google.cloud import tasks_v2
from google.protobuf import duration_pb2

from app.config import settings

logger = logging.getLogger(__name__)

# Must be ≥ the Cloud Run `--timeout` in infra/gcp/deploy-backend.sh,
# otherwise Cloud Tasks kills the dispatched request before Cloud Run
# finishes long Gemini calls on big CVs. Defaults to 600s when unset,
# which used to cut ~15-min Gemini extractions short.
_DISPATCH_DEADLINE_SECONDS = 1200


def _get_client() -> tasks_v2.CloudTasksClient:
    return tasks_v2.CloudTasksClient()


def dispatch_cv_job(*, job_id: str) -> str:
    """Create a Cloud Task that calls POST /api/cv/process-job.
    Returns the full task resource name (used for cancellation)."""
    client = _get_client()
    parent = client.queue_path(
        settings.gcp_project_id,
        settings.cloud_tasks_location,
        settings.cloud_tasks_queue,
    )
    task = tasks_v2.Task(
        dispatch_deadline=duration_pb2.Duration(seconds=_DISPATCH_DEADLINE_SECONDS),
        http_request=tasks_v2.HttpRequest(
            http_method=tasks_v2.HttpMethod.POST,
            url=f"{settings.cloud_run_url}/api/cv/process-job",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"job_id": job_id}).encode(),
            oidc_token=tasks_v2.OidcToken(
                service_account_email=settings.cloud_run_service_account,
                audience=settings.cloud_run_url,
            ),
        ),
    )
    response = client.create_task(tasks_v2.CreateTaskRequest(parent=parent, task=task))
    logger.info("Dispatched Cloud Task for job %s: %s", job_id, response.name)
    return response.name


def cancel_cv_job(task_name: str) -> None:
    """Delete a Cloud Task by resource name. No-op if already completed."""
    client = _get_client()
    try:
        client.delete_task(tasks_v2.DeleteTaskRequest(name=task_name))
        logger.info("Cancelled Cloud Task: %s", task_name)
    except NotFound:
        logger.info("Cloud Task already completed/deleted: %s", task_name)


def verify_oidc_token(authorization: str | None) -> str | None:
    """Verify an OIDC bearer token from Cloud Tasks.
    Returns the service account email if valid, None otherwise."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        from google.auth.transport import requests
        from google.oauth2 import id_token

        claims = id_token.verify_token(
            token,
            requests.Request(),
            audience=settings.cloud_run_url,
        )
        return claims.get("email")
    except Exception:
        logger.warning("OIDC token verification failed")
        return None
