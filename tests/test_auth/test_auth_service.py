import os
# Force Mock modes for testing
os.environ["KAFKA_MOCK"] = "true"
os.environ["REDIS_URL"] = "redis://non-existent-local-url:6379/0" # Triggers fallback

import pytest
import pytest_asyncio
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from services.auth_service.app.main import app, kafka_producer
from services.auth_service.app import models, schemas, crud, config
from shared.database import Base, get_db
from shared.auth import decode_access_token

# Test SQLite Engine
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
test_session_factory = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


# Override FastAPI get_db dependency
async def override_get_db():
    async with test_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()
        finally:
            await session.close()


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_test_db():
    """Create all tables in the SQLite test database and seed mock data before each test."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    # Seed default region and users
    async with test_session_factory() as db:
        region = models.Region(id=uuid.uuid4(), name="Test Region", state="Karnataka")
        db.add(region)
        await db.flush()
        
        # Admin user (password: adminpassword)
        admin = models.User(
            id=uuid.uuid4(),
            username="test_admin",
            email="admin@test.com",
            password_hash=crud.hash_password("adminpassword"),
            role="regional_admin",
            region_id=region.id,
            is_active=True
        )
        # Pharmacist user (password: pharmacistpassword)
        pharmacist = models.User(
            id=uuid.uuid4(),
            username="test_pharmacist",
            email="pharma@test.com",
            password_hash=crud.hash_password("pharmacistpassword"),
            role="pharmacist",
            region_id=region.id,
            is_active=True
        )
        db.add(admin)
        db.add(pharmacist)
        
        # Add outlet scope mapping to pharmacist
        scope = models.UserOutletScope(user_id=pharmacist.id, outlet_id=uuid.uuid4())
        db.add(scope)
        
        await db.commit()
        
    yield
    
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    # Clear in-memory blocklist
    crud._IN_MEMORY_BLOCKLIST.clear()
    # Mock startup of FastAPI app manually for lifespan event simulation
    await app.router.startup()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    await app.router.shutdown()


# ----------------------------------------------------
# Core Auth Tests
# ----------------------------------------------------

# Feature: pharmora, Property 1: JWT Issuance Correctness
@pytest.mark.asyncio
async def test_property_1_jwt_issuance_correctness(client):
    """Verify that logging in with valid credentials issues a structurally correct access token and refresh token."""
    login_data = {"username": "test_pharmacist", "password": "pharmacistpassword"}
    response = await client.post("/auth/login", json=login_data)
    
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "Bearer"
    
    # Verify access token structure and contents
    claims = decode_access_token(data["access_token"])
    assert claims["role"] == "pharmacist"
    assert "outlet_scope" in claims
    assert len(claims["outlet_scope"]) == 1


# Feature: pharmora, Property 2: Failed Login Counter Monotonicity
@pytest.mark.asyncio
async def test_property_2_failed_login_counter_monotonicity(client):
    """Verify that failed login attempts strictly increment the failed attempt count in the database."""
    async with test_session_factory() as db:
        user = await crud.get_user_by_username(db, "test_pharmacist")
        assert user.failed_login_attempts == 0

    # 1. First failure
    login_data = {"username": "test_pharmacist", "password": "wrongpassword"}
    response = await client.post("/auth/login", json=login_data)
    assert response.status_code == 401
    
    async with test_session_factory() as db:
        user = await crud.get_user_by_username(db, "test_pharmacist")
        assert user.failed_login_attempts == 1

    # 2. Second failure
    response = await client.post("/auth/login", json=login_data)
    assert response.status_code == 401
    
    async with test_session_factory() as db:
        user = await crud.get_user_by_username(db, "test_pharmacist")
        assert user.failed_login_attempts == 2


@pytest.mark.asyncio
async def test_account_lockout_after_five_failed_attempts(client):
    """Verify account locks out after 5 consecutive failures and emits a Kafka notification event."""
    login_data = {"username": "test_pharmacist", "password": "wrongpassword"}
    
    # Clean previous events
    if kafka_producer and kafka_producer.use_mock:
        kafka_producer.producer.events.clear()

    # Fail 5 times
    for i in range(5):
        response = await client.post("/auth/login", json=login_data)
        assert response.status_code == 401
        
    # Check database lockout state
    async with test_session_factory() as db:
        user = await crud.get_user_by_username(db, "test_pharmacist")
        assert user.failed_login_attempts == 5
        assert user.locked_until is not None
        
    # 6th attempt should explicitly notify account is locked
    response = await client.post("/auth/login", json=login_data)
    assert response.status_code == 401
    assert "locked" in response.json()["error"]["message"].lower()

    # Verify Kafka notification event was emitted
    if kafka_producer and kafka_producer.use_mock:
        events = kafka_producer.producer.events
        assert len(events) == 1
        assert events[0]["topic"] == "auth.account_locked"
        assert events[0]["value"]["username"] == "test_pharmacist"
        assert "locked_until" in events[0]["value"]


# Feature: pharmora, Property 3: Refresh Token Rotation
@pytest.mark.asyncio
async def test_property_3_refresh_token_rotation_and_replay_detection(client):
    """Verify that using a refresh token rotates it, and reusing a rotated token revokes all user sessions."""
    # 1. Login to get initial refresh token
    login_data = {"username": "test_pharmacist", "password": "pharmacistpassword"}
    response = await client.post("/auth/login", json=login_data)
    token_1 = response.json()["refresh_token"]
    
    # 2. First refresh (should succeed and return token_2)
    response2 = await client.post("/auth/refresh", json={"refresh_token": token_1})
    assert response2.status_code == 200
    token_2 = response2.json()["refresh_token"]
    assert token_1 != token_2
    
    # Check old token is revoked in DB
    async with test_session_factory() as db:
        old_token = await crud.get_refresh_token(db, token_1)
        assert old_token.revoked is True
        
    # 3. Reuse old refresh token (Replay attack!)
    response3 = await client.post("/auth/refresh", json={"refresh_token": token_1})
    assert response3.status_code == 401
    assert "compromised" in response3.json()["error"]["message"].lower()
    
    # Check that ALL active tokens for the user have been revoked
    async with test_session_factory() as db:
        stmt = select(models.RefreshToken).where(
            models.RefreshToken.user_id == old_token.user_id,
            models.RefreshToken.revoked == False
        )
        res = await db.execute(stmt)
        active_tokens = res.scalars().all()
        assert len(active_tokens) == 0


# Feature: pharmora, Property 4: Logout Invalidates Refresh Token
@pytest.mark.asyncio
async def test_property_4_logout_invalidates_refresh_token(client):
    """Verify that logging out revokes the token and makes subsequent refreshes fail."""
    # 1. Login
    login_data = {"username": "test_pharmacist", "password": "pharmacistpassword"}
    response = await client.post("/auth/login", json=login_data)
    refresh_token = response.json()["refresh_token"]
    
    # 2. Logout
    logout_res = await client.post("/auth/logout", json={"refresh_token": refresh_token})
    assert logout_res.status_code == 204
    
    # 3. Subsequent refresh should fail
    refresh_res = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_res.status_code == 401


@pytest.mark.asyncio
async def test_user_management_by_admin(client):
    """Verify admin user creation, retrieval, and deactivation token revocation lifecycle."""
    # 1. Log in as admin to get access token
    admin_login = {"username": "test_admin", "password": "adminpassword"}
    admin_login_res = await client.post("/auth/login", json=admin_login)
    assert admin_login_res.status_code == 200
    admin_token = admin_login_res.json()["access_token"]
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # 2. Create new user
    new_user_data = {
        "username": "new_pharmacist",
        "email": "new_pharma@test.com",
        "password": "newpassword123",
        "role": "pharmacist",
        "outlet_scope": [str(uuid.uuid4())]
    }
    
    create_res = await client.post("/auth/users", json=new_user_data, headers=headers)
    assert create_res.status_code == 201
    user_id = create_res.json()["id"]
    
    # 3. Log in as new user
    user_login = {"username": "new_pharmacist", "password": "newpassword123"}
    user_login_res = await client.post("/auth/login", json=user_login)
    assert user_login_res.status_code == 200
    user_token = user_login_res.json()["access_token"]
    
    user_headers = {"Authorization": f"Bearer {user_token}"}
    
    # Verify new user can access their own profile
    profile_res = await client.get(f"/auth/users/{user_id}", headers=user_headers)
    assert profile_res.status_code == 200
    assert profile_res.json()["username"] == "new_pharmacist"
    
    # 4. Deactivate user using Admin DELETE
    deactivate_res = await client.delete(f"/auth/users/{user_id}", headers=headers)
    assert deactivate_res.status_code == 204
    
    # 5. Verify deactivated user can no longer access their profile (immediate token revocation check)
    profile_after_res = await client.get(f"/auth/users/{user_id}", headers=user_headers)
    assert profile_after_res.status_code == 401
    assert "revoked" in profile_after_res.json()["error"]["message"].lower()
    
    # 6. Verify deactivated user can no longer login
    user_login_after = await client.post("/auth/login", json=user_login)
    assert user_login_after.status_code == 401
    assert "deactivated" in user_login_after.json()["error"]["message"].lower()
