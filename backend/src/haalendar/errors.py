"""RFC 9457 Problem Details for every error response (contract: api/components/common.yaml#/components/schemas/Problem).

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. All failures leave the API as application/problem+json with a
stable `code`, the correlation `request_id` and, for validation, JSON Pointers. Internal details never leak.
"""

from __future__ import annotations

from enum import StrEnum
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from haalendar.logging import get_logger

log = get_logger(__name__)

PROBLEM_MEDIA_TYPE = "application/problem+json"


class ProblemCode(StrEnum):
    """Mirror of the `code` enum in the API contract."""

    BAD_REQUEST = "bad_request"
    SESSION_EXPIRED = "session_expired"
    INVALID_CREDENTIALS = "invalid_credentials"
    ACCOUNT_LOCKED = "account_locked"
    EMAIL_NOT_VERIFIED = "email_not_verified"
    REAUTH_REQUIRED = "reauth_required"
    PASSWORD_CHANGE_REQUIRED = "password_change_required"  # noqa: S105 — problem code, not a credential
    TOTP_REQUIRED = "totp_required"
    CSRF_FAILED = "csrf_failed"
    FORBIDDEN = "forbidden"
    NOT_FOUND = "not_found"
    DUPLICATE = "duplicate"
    INVALID_STATE = "invalid_state"
    VERSION_CONFLICT = "version_conflict"
    PRECONDITION_REQUIRED = "precondition_required"
    IDEMPOTENCY_KEY_REUSED = "idempotency_key_reused"
    VALIDATION_FAILED = "validation_failed"
    PAYLOAD_TOO_LARGE = "payload_too_large"
    UNSUPPORTED_MEDIA_TYPE = "unsupported_media_type"
    RATE_LIMITED = "rate_limited"
    REQUIRES_CONNECTION = "requires_connection"
    INTERNAL_ERROR = "internal_error"


# Default code for HTTP statuses raised without an explicit domain code (e.g. router 404/405).
STATUS_TO_CODE: dict[int, ProblemCode] = {
    400: ProblemCode.BAD_REQUEST,
    401: ProblemCode.SESSION_EXPIRED,
    403: ProblemCode.FORBIDDEN,
    404: ProblemCode.NOT_FOUND,
    405: ProblemCode.BAD_REQUEST,
    409: ProblemCode.INVALID_STATE,
    412: ProblemCode.VERSION_CONFLICT,
    413: ProblemCode.PAYLOAD_TOO_LARGE,
    415: ProblemCode.UNSUPPORTED_MEDIA_TYPE,
    422: ProblemCode.VALIDATION_FAILED,
    428: ProblemCode.PRECONDITION_REQUIRED,
    429: ProblemCode.RATE_LIMITED,
}


class ProblemError(Exception):
    """Raise from domain code to return a specific problem."""

    def __init__(
        self,
        status: int,
        code: ProblemCode,
        detail: str | None = None,
        *,
        errors: list[dict[str, str]] | None = None,
        current: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail or code.value)
        self.status = status
        self.code = code
        self.detail = detail
        self.errors = errors
        self.current = current
        self.headers = headers


def problem_response(
    request: Request,
    status: int,
    code: ProblemCode,
    detail: str | None = None,
    *,
    errors: list[dict[str, str]] | None = None,
    current: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Build the Problem Details body; `type` is a relative URI documented per instance at /problems/{code}."""
    body: dict[str, Any] = {
        "type": f"/problems/{code.value}",
        "title": HTTPStatus(status).phrase,
        "status": status,
        "code": code.value,
        "instance": request.url.path,
        "request_id": getattr(request.state, "request_id", None),
    }
    if detail:
        body["detail"] = detail
    if errors:
        body["errors"] = errors
    if current is not None:
        body["current"] = current
    return JSONResponse(body, status_code=status, media_type=PROBLEM_MEDIA_TYPE, headers=headers)


def _pointer(loc: tuple[int | str, ...]) -> str:
    """Convert a Pydantic error location to an RFC 6901 JSON Pointer into the request body (or parameter)."""
    parts = list(loc)
    if parts and parts[0] == "body":
        parts = parts[1:]
    escaped = [str(p).replace("~", "~0").replace("/", "~1") for p in parts]
    return "/" + "/".join(escaped)


async def _on_problem(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ProblemError)
    log.info("problem_raised", status=exc.status, code=exc.code.value, path=request.url.path)
    return problem_response(
        request,
        exc.status,
        exc.code,
        exc.detail,
        errors=exc.errors,
        current=exc.current,
        headers=exc.headers,
    )


async def _on_http_exception(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code = STATUS_TO_CODE.get(exc.status_code, ProblemCode.BAD_REQUEST)
    log.info("http_error", status=exc.status_code, code=code.value, path=request.url.path)
    detail = (
        exc.detail
        if isinstance(exc.detail, str) and exc.detail != HTTPStatus(exc.status_code).phrase
        else None
    )
    return problem_response(request, exc.status_code, code, detail, headers=getattr(exc, "headers", None))


async def _on_validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors = [
        {
            "pointer": _pointer(tuple(err.get("loc", ()))),
            "detail": str(err.get("msg", "")),
            "code": str(err.get("type", "")),
        }
        for err in exc.errors()
    ]
    log.info("validation_failed", path=request.url.path, error_count=len(errors))
    return problem_response(
        request, 422, ProblemCode.VALIDATION_FAILED, "Request validation failed", errors=errors
    )


async def _on_unhandled(request: Request, exc: Exception) -> JSONResponse:
    # Full stack trace goes to the log with the request id; the client only gets a generic problem.
    log.exception("unhandled_exception", path=request.url.path, error_type=type(exc).__name__)
    return problem_response(request, 500, ProblemCode.INTERNAL_ERROR)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ProblemError, _on_problem)
    app.add_exception_handler(StarletteHTTPException, _on_http_exception)
    app.add_exception_handler(RequestValidationError, _on_validation_error)
    app.add_exception_handler(Exception, _on_unhandled)
