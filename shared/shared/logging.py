import json
import time
import sys
import os
import hashlib
from typing import Any, Dict, List, Union
from loguru import logger
from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from shared.errors import get_trace_id

# Fields to mask in application logs
PII_PHI_FIELDS = {
    "patient_id", 
    "patient_id_encrypted", 
    "doctor_name", 
    "prescription_ref", 
    "email", 
    "phone",
    "password",
    "password_hash",
    "refresh_token",
    "token_hash"
}


def mask_value(val: Any) -> str:
    """Mask a value by keeping it partially masked using md5 hash snippet for uniqueness."""
    if val is None:
        return "None"
    val_str = str(val)
    if not val_str:
        return "MASKED_EMPTY"
    h = hashlib.md5(val_str.encode("utf-8")).hexdigest()[:8]
    return f"MASKED_{h}"


def mask_pii_phi(data: Any) -> Any:
    """Recursively mask fields matching PII/PHI field names in dictionaries and lists."""
    if isinstance(data, dict):
        masked_dict = {}
        for k, v in data.items():
            k_lower = k.lower()
            if k_lower in PII_PHI_FIELDS:
                masked_dict[k] = mask_value(v)
            else:
                masked_dict[k] = mask_pii_phi(v)
        return masked_dict
    elif isinstance(data, list):
        return [mask_pii_phi(item) for item in data]
    return data


def json_serializer(record):
    """Serialize loguru record into JSON for production logs."""
    log_record = {
        "timestamp": record["date"].isoformat(),
        "level": record["level"].name,
        "message": record["message"],
        "module": record["module"],
        "function": record["function"],
        "line": record["line"],
        "extra": record["extra"]
    }
    return json.dumps(log_record)


def configure_logging():
    """Configure loguru logging handlers based on environment settings."""
    logger.remove()  # Remove default handler
    
    log_format = os.getenv("LOG_FORMAT", "TEXT").upper()
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    if log_format == "JSON":
        # Production JSON logs format
        logger.add(
            sys.stdout,
            level=log_level,
            serialize=True,
            enqueue=True,
            backtrace=True,
            diagnose=False
        )
    else:
        # Development readable logs format
        fmt = (
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
            "<level>{message}</level> | "
            "<light-black>{extra}</light-black>"
        )
        logger.add(
            sys.stdout,
            level=log_level,
            format=fmt,
            enqueue=True,
            backtrace=True,
            diagnose=True
        )


class LoggingMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware to log HTTP requests, injecting trace ids and masking sensitive data."""
    async def dispatch(self, request: Request, call_next) -> Response:
        trace_id = get_trace_id(request)
        
        # Bind the trace ID to all logs within this request context
        with logger.contextualize(trace_id=trace_id):
            start_time = time.time()
            
            # Mask sensitive query parameters
            query_params = dict(request.query_params)
            masked_query_params = mask_pii_phi(query_params)
            
            # Log request receipt
            logger.info(
                f"Request started: {request.method} {request.url.path} "
                f"Params: {masked_query_params}"
            )

            try:
                response = await call_next(request)
                duration = time.time() - start_time
                
                # Log response details
                logger.info(
                    f"Request completed: {request.method} {request.url.path} "
                    f"Status: {response.status_code} Duration: {duration:.4f}s"
                )
                
                # Inject trace_id header into response
                response.headers["X-Trace-ID"] = trace_id
                return response
            except Exception as exc:
                duration = time.time() - start_time
                logger.error(
                    f"Request failed: {request.method} {request.url.path} "
                    f"Error: {str(exc)} Duration: {duration:.4f}s"
                )
                raise exc


def setup_app_logging(app: FastAPI):
    """Set up configured logger and attach logging middleware to FastAPI app."""
    configure_logging()
    app.add_middleware(LoggingMiddleware)
