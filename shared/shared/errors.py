from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field
from typing import Optional
import uuid

# OpenTelemetry imports for tracing
try:
    from opentelemetry import trace
except ImportError:
    trace = None


def get_trace_id(request: Request = None) -> str:
    """Extract trace_id from current OpenTelemetry span, request headers, or generate a new one."""
    if trace:
        span = trace.get_current_span()
        if span and span.get_span_context().is_valid:
            return trace.format_trace_id(span.get_span_context().trace_id)
    
    if request:
        # Check for X-Trace-ID header
        trace_header = request.headers.get("x-trace-id") or request.headers.get("X-Trace-ID")
        if trace_header:
            return trace_header
            
    return str(uuid.uuid4())


class ErrorDetails(BaseModel):
    code: str = Field(..., description="Unique error code identifier")
    message: str = Field(..., description="Human readable description of the error")
    trace_id: str = Field(..., description="Unique trace identifier for troubleshooting")
    timestamp: str = Field(..., description="ISO timestamp when the error occurred")


class ErrorResponse(BaseModel):
    error: ErrorDetails


class AppException(Exception):
    """Base application exception for all Pharmora microservices."""
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class ValidationError(AppException):
    def __init__(self, message: str):
        super().__init__("VALIDATION_ERROR", message, status_code=400)


class UnauthorizedError(AppException):
    def __init__(self, message: str = "Authentication credentials are missing or invalid"):
        super().__init__("UNAUTHORIZED", message, status_code=401)


class ForbiddenError(AppException):
    def __init__(self, message: str = "Access to this resource is denied"):
        super().__init__("FORBIDDEN", message, status_code=403)


class NotFoundError(AppException):
    def __init__(self, message: str):
        super().__init__("NOT_FOUND", message, status_code=404)


class ConflictError(AppException):
    def __init__(self, message: str):
        super().__init__("CONFLICT", message, status_code=409)


class BusinessRuleError(AppException):
    def __init__(self, code: str, message: str):
        super().__init__(code, message, status_code=422)


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    trace_id = get_trace_id(request)
    error_response = ErrorResponse(
        error=ErrorDetails(
            code=exc.code,
            message=exc.message,
            trace_id=trace_id,
            timestamp=datetime.now(timezone.utc).isoformat()
        )
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response.model_dump()
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    trace_id = get_trace_id(request)
    # Combine validation error messages
    error_msg = "; ".join([f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in exc.errors()])
    error_response = ErrorResponse(
        error=ErrorDetails(
            code="VALIDATION_ERROR",
            message=error_msg,
            trace_id=trace_id,
            timestamp=datetime.now(timezone.utc).isoformat()
        )
    )
    return JSONResponse(
        status_code=400,
        content=error_response.model_dump()
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    trace_id = get_trace_id(request)
    error_response = ErrorResponse(
        error=ErrorDetails(
            code="INTERNAL_SERVER_ERROR",
            message="An unexpected error occurred",
            trace_id=trace_id,
            timestamp=datetime.now(timezone.utc).isoformat()
        )
    )
    return JSONResponse(
        status_code=500,
        content=error_response.model_dump()
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
