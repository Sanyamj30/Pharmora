import os
# Force Mock modes for testing
os.environ["KAFKA_MOCK"] = "true"
os.environ["REDIS_URL"] = "redis://non-existent-local-url:6379/0" # Triggers fallback
os.environ["AUTH_SERVICE_URL"] = "http://localhost:9999"
os.environ["INVENTORY_SERVICE_URL"] = "http://localhost:9999"
os.environ["SALES_SERVICE_URL"] = "http://localhost:9999"

import pytest
import pytest_asyncio
import asyncio
import uuid
import time
from httpx import AsyncClient, ASGITransport

from services.api_gateway.app.main import app
from services.api_gateway.app import middleware
from services.auth_service.app import crud
from shared.auth import generate_access_token

# Valid UUID constants for testing outlet scope routing
OUTLET_1 = "d2c67e76-32ef-4934-bc2c-7389201991ad"
OUTLET_2 = "e2c67e76-32ef-4934-bc2c-7389201991ae"
OUTLET_3 = "f2c67e76-32ef-4934-bc2c-7389201991af"


# Helper to generate signed JWTs for testing
def get_test_jwt(role: str, user_id: str = None, outlet_scope: list = None) -> str:
    user_id = user_id or str(uuid.uuid4())
    outlet_scope = outlet_scope or [OUTLET_1, OUTLET_2]
    claims = {
        "sub": user_id,
        "role": role,
        "region": "South Region",
        "outlet_scope": outlet_scope
    }
    return generate_access_token(claims, expires_in_seconds=3600)


@pytest_asyncio.fixture
async def client():
    # Clear in-memory structures before each test
    middleware._IN_MEMORY_RATE_LIMITS.clear()
    middleware._IN_MEMORY_IDEMPOTENCY.clear()
    crud._IN_MEMORY_BLOCKLIST.clear()
    
    await app.router.startup()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    await app.router.shutdown()


# ----------------------------------------------------
# API Gateway Tests
# ----------------------------------------------------

# Property 5: JWT Gateway Validation
@pytest.mark.asyncio
async def test_jwt_gateway_validation_bypass_and_enforcement(client):
    """Verify that bypass routes work without JWT, and protected routes enforce valid JWT."""
    # 1. Bypass route (login) should proceed
    response = await client.post("/auth/login", json={"username": "a", "password": "b"})
    assert response.status_code != 401

    # 2. Protected route without JWT -> returns 401
    response2 = await client.get(f"/inventory/{OUTLET_1}/stock")
    assert response2.status_code == 401
    assert "missing or invalid" in response2.json()["error"]["message"].lower()

    # 3. Protected route with invalid JWT -> returns 401
    response3 = await client.get(f"/inventory/{OUTLET_1}/stock", headers={"Authorization": "Bearer invalidtoken"})
    assert response3.status_code == 401
    assert "token validation failed" in response3.json()["error"]["message"].lower()


@pytest.mark.asyncio
async def test_jwt_revoked_session_rejection(client):
    """Verify that a JWT belonging to a blocked user session is immediately rejected."""
    user_id = str(uuid.uuid4())
    token = get_test_jwt(role="pharmacist", user_id=user_id)
    
    # Block user session
    crud.BlocklistManager.block_user(uuid.UUID(user_id))
    
    response = await client.get(f"/inventory/{OUTLET_1}/stock", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "revoked" in response.json()["error"]["message"].lower()


# Property 6: RBAC Enforcement
@pytest.mark.asyncio
async def test_rbac_enforcement_rules(client):
    """Verify endpoint access permissions based on role matrix."""
    pharmacist_token = get_test_jwt(role="pharmacist")
    controller_token = get_test_jwt(role="inventory_controller")
    finance_token = get_test_jwt(role="finance_manager")

    # 1. Pharmacist: GET inventory is allowed, POST inventory receipt is forbidden
    res1 = await client.get(
        f"/inventory/{OUTLET_1}/stock", 
        headers={"Authorization": f"Bearer {pharmacist_token}"}
    )
    assert res1.status_code == 200 # Allowed (returns mocked response)

    res2 = await client.post(
        f"/inventory/{OUTLET_1}/receipts", 
        json={"sku": "SKU1"}, 
        headers={"Authorization": f"Bearer {pharmacist_token}"}
    )
    assert res2.status_code == 403 # Forbidden

    # 2. Inventory Controller: POST inventory receipt is allowed, POST checkout is forbidden
    res3 = await client.post(
        f"/inventory/{OUTLET_1}/receipts", 
        json={"sku": "SKU1"}, 
        headers={"Authorization": f"Bearer {controller_token}"}
    )
    assert res3.status_code == 201 # Allowed (returns mocked 201 response)

    res4 = await client.post(
        "/sales/transactions", 
        json={"items": []}, 
        headers={"Authorization": f"Bearer {controller_token}"}
    )
    assert res4.status_code == 403 # Forbidden

    # 3. Finance Manager: GET reporting is allowed, other routes forbidden
    res5 = await client.get(
        "/reporting/sales", 
        headers={"Authorization": f"Bearer {finance_token}"}
    )
    assert res5.status_code == 200 # Allowed (returns mocked response)

    res6 = await client.get(
        f"/inventory/{OUTLET_1}/stock", 
        headers={"Authorization": f"Bearer {finance_token}"}
    )
    assert res6.status_code == 403 # Forbidden


# Property 7: Outlet Scope Enforcement
@pytest.mark.asyncio
async def test_outlet_scope_enforcement(client):
    """Verify that users can only query data for outlets within their authorized scope."""
    # User only has access to OUTLET_1 and OUTLET_2
    token = get_test_jwt(role="pharmacist", outlet_scope=[OUTLET_1, OUTLET_2])
    
    # 1. Accessing OUTLET_1 -> Allowed
    res1 = await client.get(
        f"/inventory/{OUTLET_1}/stock", 
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res1.status_code == 200
    
    # 2. Accessing OUTLET_3 -> Forbidden
    res2 = await client.get(
        f"/inventory/{OUTLET_3}/stock", 
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res2.status_code == 403
    assert "outside authorized scope" in res2.json()["error"]["message"].lower()

    # 3. Admin accessing OUTLET_3 -> Allowed (Scope bypass for admins)
    admin_token = get_test_jwt(role="regional_admin", outlet_scope=[OUTLET_1])
    res3 = await client.get(
        f"/inventory/{OUTLET_3}/stock", 
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res3.status_code == 200


@pytest.mark.asyncio
async def test_user_rate_limiting(client):
    """Verify that exceeding user rate limit returns 429 Too Many Requests."""
    token = get_test_jwt(role="pharmacist")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Temporarily set limit to 5 for testing
    middleware.settings.RATE_LIMIT_USER_PER_MIN = 5
    
    # Perform 5 allowed requests
    for _ in range(5):
        res = await client.get(f"/inventory/{OUTLET_1}/stock", headers=headers)
        assert res.status_code == 200
        
    # 6th request should fail with 429
    res = await client.get(f"/inventory/{OUTLET_1}/stock", headers=headers)
    assert res.status_code == 429
    assert "limit exceeded" in res.json()["error"]["message"].lower()


@pytest.mark.asyncio
async def test_idempotency_key_caching(client):
    """Verify that duplicate requests with same idempotency key return cached response."""
    token = get_test_jwt(role="pharmacist")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Idempotency-Key": "unique-idempotency-key-1"
    }
    
    # 1. First request
    res1 = await client.post("/sales/transactions", json={"items": []}, headers=headers)
    assert res1.status_code == 201
    val1 = res1.json()
    assert "invoice_number" in val1
    
    # 2. Send duplicate request
    res2 = await client.post("/sales/transactions", json={"items": []}, headers=headers)
    assert res2.status_code == 201
    val2 = res2.json()
    
    # Ensure they are exactly identical (cached)
    assert val1["invoice_number"] == val2["invoice_number"]
