"""Structured error model (Phase C1, ADR-084; direction pack
docs/direction/05_MCP_TOOL_CONTRACT.md § Error model).

Workflow-core routes (and later the MCP adapter) raise WorkflowError
subclasses; the handler registered in main.py renders the pack's envelope:

    {"error": {"code": ..., "message": ..., "retryable": ..., "details": {...}}}

Pre-existing routes keep FastAPI's plain `detail` responses; they migrate
opportunistically.
"""

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class WorkflowError(Exception):
    code = "INTERNAL_ERROR"
    http_status = 500
    retryable = False

    def __init__(self, message: str, *, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ObjectNotFound(WorkflowError):
    code = "OBJECT_NOT_FOUND"
    http_status = 404


class ProjectNotFound(WorkflowError):
    code = "PROJECT_NOT_FOUND"
    http_status = 404


class InvalidStatusTransition(WorkflowError):
    code = "INVALID_STATUS_TRANSITION"
    http_status = 409


class ValidationFailed(WorkflowError):
    code = "VALIDATION_FAILED"
    http_status = 422


class Conflict(WorkflowError):
    code = "CONFLICT"
    http_status = 409


class PermissionDenied(WorkflowError):
    code = "PERMISSION_DENIED"
    http_status = 403


class AuthenticationRequired(WorkflowError):
    code = "AUTHENTICATION_REQUIRED"
    http_status = 401


def error_body(exc: WorkflowError) -> dict[str, Any]:
    return {
        "error": {
            "code": exc.code,
            "message": exc.message,
            "retryable": exc.retryable,
            "details": exc.details,
        }
    }


async def workflow_error_handler(request: Request, exc: WorkflowError) -> JSONResponse:
    return JSONResponse(status_code=exc.http_status, content=error_body(exc))
