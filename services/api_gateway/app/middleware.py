import time
import uuid
import json
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import redis
from loguru import logger

from services.api_gateway.app.config import settings
from shared.auth import decode_access_token
from services.auth_service.app.crud import BlocklistManager # Reuse blocklist manager

# Initialize Redis client, fallback to in-memory dictionary if Redis is not available
_REDIS_CLIENT = None
_IN_MEMORY_RATE_LIMITS = {}  # {key: [timestamps]}
_IN_MEMORY_IDEMPOTENCY = {}  # {key: (status_code, headers, body_str, expiry_time)}

try:
    _REDIS_CLIENT = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    _REDIS_CLIENT.ping()
    logger.info(f"Gateway connected to Redis at {settings.REDIS_URL}")
except Exception as e:
    logger.warning(f"Gateway Redis not available ({e}). Using in-memory fallback for rate limiting & idempotency.")
    _REDIS_CLIENT = None


def is_bypass_path(path: str) -> bool:
    """Return True if the path does not require authentication."""
    path_lower = path.lower()
    return path_lower in ["/auth/login", "/auth/refresh", "/docs", "/openapi.json"]


def is_authorized(role: str, path: str, method: str) -> bool:
    """RBAC validation logic according to user roles."""
    if role == "regional_admin":
        return True
        
    path_lower = path.lower()
    method_upper = method.upper()
    
    # Pharmacist Role
    if role == "pharmacist":
        # Read-only inventory access
        if path_lower.startswith("/inventory/"):
            return method_upper == "GET"
        # Full sales access
        if path_lower.startswith("/sales/"):
            return True
        return False
        
    # Inventory Controller Role
    if role == "inventory_controller":
        # Full inventory access
        if path_lower.startswith("/inventory/"):
            return True
        # No sales access
        if path_lower.startswith("/sales/"):
            return False
        return False
        
    # Finance Manager Role
    if role == "finance_manager":
        # Read-only reporting access
        if path_lower.startswith("/reporting/") or path_lower.startswith("/sales/invoices/"):
            return method_upper == "GET"
        return False
        
    return False


def get_outlet_id_from_path(path: str) -> Optional[str]:
    """
    Extract outlet_id if path follows the pattern:
    /inventory/{outlet_id}/... or /sales/{outlet_id}/...
    """
    parts = path.strip("/").split("/")
    if len(parts) >= 2:
        # Check if the second parameter is a valid UUID
        potential_uuid = parts[1]
        try:
            uuid.UUID(potential_uuid)
            return potential_uuid
        except ValueError:
            pass
    return None


# Rate Limiter implementation (Sliding Window)

def check_rate_limit(key: str, limit: int, window_seconds: int = 60) -> bool:
    """
    Check if the rate limit for the key has been exceeded.
    Returns True if allowed, False if throttled.
    """
    now = time.time()
    cutoff = now - window_seconds
    
    if _REDIS_CLIENT:
        try:
            # Pipeline for atomic operations
            pipe = _REDIS_CLIENT.pipeline()
            pipe.zremrangebyscore(key, 0, cutoff)
            pipe.zadd(key, {str(now): now})
            pipe.zcard(key)
            pipe.expire(key, window_seconds)
            results = pipe.execute()
            
            current_count = results[2]
            return current_count <= limit
        except Exception as e:
            logger.error(f"Redis rate limiter error: {e}")
            # Fall back to in-memory if Redis call fails mid-operation
            
    # In-memory sliding window fallback
    if key not in _IN_MEMORY_RATE_LIMITS:
        _IN_MEMORY_RATE_LIMITS[key] = []
        
    # Remove older timestamps
    timestamps = [t for t in _IN_MEMORY_RATE_LIMITS[key] if t > cutoff]
    timestamps.append(now)
    _IN_MEMORY_RATE_LIMITS[key] = timestamps
    
    return len(timestamps) <= limit


# Idempotency Helper

def get_cached_idempotency_response(key: str) -> Optional[Tuple[int, dict, str]]:
    """Lookup idempotency key. Returns (status_code, headers, body_str) or None."""
    redis_key = f"idempotency:{key}"
    if _REDIS_CLIENT:
        try:
            cached = _REDIS_CLIENT.get(redis_key)
            if cached:
                data = json.loads(cached)
                return data["status_code"], data["headers"], data["body"]
        except Exception as e:
            logger.error(f"Redis idempotency get error: {e}")
            
    # Fallback
    if redis_key in _IN_MEMORY_IDEMPOTENCY:
        status_code, headers, body, expiry = _IN_MEMORY_IDEMPOTENCY[redis_key]
        if time.time() < expiry:
            return status_code, headers, body
        else:
            del _IN_MEMORY_IDEMPOTENCY[redis_key]
            
    return None


def cache_idempotency_response(key: str, status_code: int, headers: dict, body_str: str, ttl_seconds: int = 86400):
    """Store the response in cache for 24 hours."""
    redis_key = f"idempotency:{key}"
    
    # Filter headers to cache
    safe_headers = {}
    for h in ["content-type"]:
        if h in headers:
            safe_headers[h] = headers[h]
            
    data = {
        "status_code": status_code,
        "headers": safe_headers,
        "body": body_str
    }
    
    if _REDIS_CLIENT:
        try:
            _REDIS_CLIENT.setex(redis_key, ttl_seconds, json.dumps(data))
            return
        except Exception as e:
            logger.error(f"Redis idempotency set error: {e}")
            
    # Fallback
    expiry = time.time() + ttl_seconds
    _IN_MEMORY_IDEMPOTENCY[redis_key] = (status_code, safe_headers, body_str, expiry)


# Main Gateway Middleware Function

async def api_gateway_middleware(request: Request, call_next) -> Response:
    # 0. Bypass CORS Preflight Options
    if request.method == "OPTIONS":
        return await call_next(request)
        
    # 1. Bypass check
    path = request.url.path
    if is_bypass_path(path):
        return await call_next(request)
        
    # 2. Rate Limiting Check: Outlet Level (if outlet_id exists in path)
    outlet_id = get_outlet_id_from_path(path)
    if outlet_id:
        outlet_allowed = check_rate_limit(
            key=f"rate:outlet:{outlet_id}", 
            limit=settings.RATE_LIMIT_OUTLET_PER_MIN
        )
        if not outlet_allowed:
            return JSONResponse(
                status_code=429,
                content={"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Outlet rate limit exceeded"}}
            )

    # 3. JWT Verification
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return JSONResponse(
            status_code=401,
            content={"error": {"code": "UNAUTHORIZED", "message": "Missing or invalid authorization header"}}
        )
        
    token = auth_header.split(" ")[1]
    try:
        claims = decode_access_token(token)
    except Exception as e:
        return JSONResponse(
            status_code=401,
            content={"error": {"code": "UNAUTHORIZED", "message": f"Token validation failed: {str(e)}"}}
        )
        
    user_id = claims.get("sub")
    role = claims.get("role")
    outlet_scope = claims.get("outlet_scope", [])
    region = claims.get("region")
    
    # 4. Check session blocklist
    if BlocklistManager.is_user_blocked(uuid.UUID(user_id)):
        return JSONResponse(
            status_code=401,
            content={"error": {"code": "UNAUTHORIZED", "message": "User session has been revoked"}}
        )

    # 5. Rate Limiting Check: User Level
    user_allowed = check_rate_limit(
        key=f"rate:user:{user_id}", 
        limit=settings.RATE_LIMIT_USER_PER_MIN
    )
    if not user_allowed:
        return JSONResponse(
            status_code=429,
            content={"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "User rate limit exceeded"}}
        )

    # 6. RBAC Authorization
    if not is_authorized(role, path, request.method):
        return JSONResponse(
            status_code=403,
            content={"error": {"code": "FORBIDDEN", "message": "Insufficient permissions to perform this action"}}
        )

    # 7. Outlet Scope Validation
    if outlet_id and role != "regional_admin":
        if outlet_id not in outlet_scope:
            return JSONResponse(
                status_code=403,
                content={"error": {"code": "FORBIDDEN", "message": "Access denied: outlet is outside authorized scope"}}
            )

    # Inject Gateway validation headers into request state to be forwarded downstream
    # (FastAPI proxies will add these to HTTP headers)
    request.state.user_id = user_id
    request.state.user_role = role
    request.state.outlet_scope = ",".join(outlet_scope)
    request.state.region = region or ""

    # 8. Idempotency Key Handling for mutating actions
    idempotency_key = request.headers.get("X-Idempotency-Key")
    if request.method in ["POST", "PATCH", "DELETE"] and idempotency_key:
        cached_resp = get_cached_idempotency_response(idempotency_key)
        if cached_resp:
            status_code, cached_headers, body = cached_resp
            # Return cached response directly
            return Response(
                content=body,
                status_code=status_code,
                headers=cached_headers
            )
            
        # Proceed with request, intercept the output
        response = await call_next(request)
        
        # Only cache successful/semi-successful mutation results (2xx/3xx/4xx that aren't 5xx errors)
        if response.status_code < 500:
            # Consume the response body
            body_bytes = b""
            async for chunk in response.body_iterator:
                body_bytes += chunk
            body_str = body_bytes.decode("utf-8")
            
            # Cache it
            cache_idempotency_response(
                key=idempotency_key,
                status_code=response.status_code,
                headers=dict(response.headers),
                body_str=body_str
            )
            
            # Reconstruct response since iterator was consumed
            return Response(
                content=body_bytes,
                status_code=response.status_code,
                headers=dict(response.headers)
            )
        return response

    return await call_next(request)
