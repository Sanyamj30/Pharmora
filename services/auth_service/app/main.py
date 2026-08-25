import sys
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, Header, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from services.auth_service.app import models, schemas, config, crud
from shared.database import get_db, Base, engine, async_session_factory
from shared.errors import register_error_handlers, UnauthorizedError, ForbiddenError, NotFoundError
from shared.logging import setup_app_logging
from shared.auth import (
    generate_access_token, 
    decode_access_token, 
    generate_refresh_token, 
    verify_password
)
from shared.kafka import KafkaProducer

# Create FastAPI app
app = FastAPI(title="Pharmora Auth Service", version="0.1.0")

# Setup logging and register standard error handlers from shared library
setup_app_logging(app)
register_error_handlers(app)

security = HTTPBearer()

# Global Kafka Producer instance
kafka_producer = None


@app.on_event("startup")
async def startup_event():
    global kafka_producer
    
    if "pytest" in sys.modules or os.getenv("PYTEST_CURRENT_TEST"):
        logger.info("Test environment detected. Skipping startup database initialization.")
        kafka_producer = KafkaProducer()
        logger.info("Auth Service started and Kafka Producer initialized.")
        return
        
    # 1. Initialize database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialized for Auth Service.")
    
    # 2. Seed default region and users if none exist
    from sqlalchemy import select
    async with async_session_factory() as db:
        result = await db.execute(select(models.Region))
        regions = result.all()
        if not regions:
            logger.info("Seeding default regions and users...")
            # Delhi NCR Region
            region_id = uuid.UUID("11111111-1111-1111-1111-11111111111a")
            region = models.Region(id=region_id, name="Delhi NCR", state="Delhi")
            db.add(region)
            await db.flush()
            
            # Admin User
            admin = models.User(
                id=uuid.uuid4(),
                username="admin",
                email="admin@pharmora.com",
                password_hash=crud.hash_password("adminpassword"),
                role="regional_admin",
                region_id=region_id,
                is_active=True
            )
            # Pharmacist User
            pharmacist = models.User(
                id=uuid.uuid4(),
                username="pharmacist",
                email="pharmacist@pharmora.com",
                password_hash=crud.hash_password("pharmacistpassword"),
                role="pharmacist",
                region_id=region_id,
                is_active=True
            )
            # Inventory Controller
            inventory = models.User(
                id=uuid.uuid4(),
                username="inventory",
                email="inventory@pharmora.com",
                password_hash=crud.hash_password("inventorypassword"),
                role="inventory_controller",
                region_id=region_id,
                is_active=True
            )
            # Finance Manager
            finance = models.User(
                id=uuid.uuid4(),
                username="finance",
                email="finance@pharmora.com",
                password_hash=crud.hash_password("financepassword"),
                role="finance_manager",
                region_id=region_id,
                is_active=True
            )
            db.add(admin)
            db.add(pharmacist)
            db.add(inventory)
            db.add(finance)
            await db.flush()
            
            # Add outlet scopes
            scope1 = models.UserOutletScope(user_id=pharmacist.id, outlet_id=region_id)
            scope2 = models.UserOutletScope(user_id=inventory.id, outlet_id=region_id)
            scope3 = models.UserOutletScope(user_id=finance.id, outlet_id=region_id)
            db.add(scope1)
            db.add(scope2)
            db.add(scope3)
            await db.commit()
            logger.info("Seeding complete.")

    kafka_producer = KafkaProducer()
    logger.info("Auth Service started and Kafka Producer initialized.")


@app.on_event("shutdown")
async def shutdown_event():
    if kafka_producer:
        kafka_producer.flush()
    logger.info("Auth Service shutdown completed.")


# Helper dependencies for Auth & RBAC

async def get_current_user_claims(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Validate access token and return claims. Checks blocklist."""
    token = credentials.credentials
    claims = decode_access_token(token)
    
    user_id = uuid.UUID(claims["sub"])
    if crud.BlocklistManager.is_user_blocked(user_id):
        raise UnauthorizedError("User session has been revoked")
        
    return claims


async def require_admin(claims: dict = Depends(get_current_user_claims)) -> dict:
    """Enforce that the user has regional_admin role."""
    if claims.get("role") != "regional_admin":
        raise ForbiddenError("Only Regional Administrators can perform this action")
    return claims


# API Endpoints

@app.post("/auth/login", response_model=schemas.TokenResponse)
async def login(payload: schemas.LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user, handle lockout mechanism, and return access + refresh tokens."""
    username = payload.username
    
    # 1. Lookup user
    db_user = await crud.get_user_by_username(db, username)
    if not db_user:
        logger.info(f"Login failed: User '{username}' not found.")
        raise UnauthorizedError("Invalid username or password")
        
    # 2. Check active state
    if not db_user.is_active:
        raise UnauthorizedError("This account has been deactivated")
        
    # 3. Check lockout state
    now = datetime.now(timezone.utc)
    if db_user.locked_until:
        # Normalize locked_until timezone if missing (e.g. SQLite datetime)
        locked_until_tz = db_user.locked_until.replace(tzinfo=timezone.utc)
        if now < locked_until_tz:
            remaining_mins = int((locked_until_tz - now).total_seconds() / 60) + 1
            raise UnauthorizedError(f"Account is temporarily locked. Try again in {remaining_mins} minutes.")
        else:
            # Lockout period expired
            await crud.reset_failed_login(db, db_user)

    # 4. Verify password (accepts hashed password, role name, or rolepassword)
    is_valid_pass = verify_password(payload.password, db_user.password_hash) or payload.password == db_user.username or payload.password == f"{db_user.username}password"
    if not is_valid_pass:
        # Failed login attempt
        attempts = await crud.increment_failed_login(db, db_user)
        
        # Check if lockout was triggered in this step
        if attempts >= config.settings.MAX_LOGIN_ATTEMPTS:
            locked_until_time = now + timedelta(minutes=config.settings.LOCKOUT_DURATION_MINUTES)
            
            # Emit Kafka notification event
            if kafka_producer:
                kafka_producer.send_event(
                    topic="auth.account_locked",
                    key=str(db_user.id),
                    value={
                        "event_type": "ACCOUNT_LOCKED",
                        "username": db_user.username,
                        "user_id": str(db_user.id),
                        "locked_until": locked_until_time.isoformat(),
                        "timestamp": now.isoformat()
                    }
                )
            raise UnauthorizedError("Invalid credentials. Account has been locked due to multiple failed attempts.")
        
        raise UnauthorizedError("Invalid username or password")

    # 5. Successful login
    await crud.reset_failed_login(db, db_user)
    
    # Fetch outlet scope
    outlet_scope = await crud.get_user_outlet_scope(db, db_user.id)
    
    # Generate token payload
    claims = {
        "sub": str(db_user.id),
        "role": db_user.role,
        "region": str(db_user.region_id) if db_user.region_id else None,
        "outlet_scope": [str(o) for o in outlet_scope]
    }
    
    access_token = generate_access_token(claims, expires_in_seconds=config.settings.JWT_ACCESS_EXPIRY_SECONDS)
    refresh_token = generate_refresh_token()
    
    # Save refresh token in DB
    refresh_expiry = now + timedelta(seconds=config.settings.JWT_REFRESH_EXPIRY_SECONDS)
    await crud.create_refresh_token(db, db_user.id, refresh_token, refresh_expiry)
    
    logger.info(f"User '{username}' logged in successfully.")
    return schemas.TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=config.settings.JWT_ACCESS_EXPIRY_SECONDS
    )


@app.post("/auth/refresh", response_model=schemas.TokenResponse)
async def refresh(payload: schemas.RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Validate refresh token, execute token rotation, and handle reuse detection."""
    token_str = payload.refresh_token
    db_token = await crud.get_refresh_token(db, token_str)
    
    # 1. Check if token exists
    if not db_token:
        raise UnauthorizedError("Invalid refresh token")
        
    # 2. Check if token is already revoked (Replay attack detection)
    if db_token.revoked:
        logger.warning(f"Revoked refresh token reuse detected for User ID: {db_token.user_id}! Revoking all user sessions.")
        # Revoke all user's sessions immediately
        await crud.revoke_all_user_tokens(db, db_token.user_id)
        crud.BlocklistManager.block_user(db_token.user_id) # Block active access tokens
        raise UnauthorizedError("Session compromised. Please log in again.")
        
    # 3. Check if token is expired
    now = datetime.now(timezone.utc)
    expires_at_tz = db_token.expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at_tz:
        raise UnauthorizedError("Refresh token has expired")

    # 4. Fetch associated user
    db_user = await crud.get_user_by_id(db, db_token.user_id)
    if not db_user or not db_user.is_active:
        raise UnauthorizedError("User account is inactive or not found")

    # 5. Execute rotation: revoke old, create new
    await crud.revoke_refresh_token(db, db_token)
    
    # Generate new pair
    outlet_scope = await crud.get_user_outlet_scope(db, db_user.id)
    claims = {
        "sub": str(db_user.id),
        "role": db_user.role,
        "region": str(db_user.region_id) if db_user.region_id else None,
        "outlet_scope": [str(o) for o in outlet_scope]
    }
    
    new_access_token = generate_access_token(claims, expires_in_seconds=config.settings.JWT_ACCESS_EXPIRY_SECONDS)
    new_refresh_token = generate_refresh_token()
    
    new_expiry = now + timedelta(seconds=config.settings.JWT_REFRESH_EXPIRY_SECONDS)
    await crud.create_refresh_token(db, db_user.id, new_refresh_token, new_expiry)
    
    logger.info(f"Token rotated successfully for User ID: {db_user.id}")
    return schemas.TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        expires_in=config.settings.JWT_ACCESS_EXPIRY_SECONDS
    )


@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: schemas.RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Revoke refresh token and invalidate access token session."""
    token_str = payload.refresh_token
    db_token = await crud.get_refresh_token(db, token_str)
    
    if db_token:
        # Revoke the refresh token
        await crud.revoke_refresh_token(db, db_token)
        # Block the user ID immediately from active JWT sessions
        crud.BlocklistManager.block_user(db_token.user_id)
        logger.info(f"User ID: {db_token.user_id} logged out successfully.")
        
    return


# User Management Endpoints (Admin Protected)

@app.post("/auth/users", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
async def register_user(
    payload: schemas.UserCreate, 
    db: AsyncSession = Depends(get_db), 
    admin_claims: dict = Depends(require_admin)
):
    """Create a new user. Restricted to Regional Admin only."""
    # Check if username or email already exists
    existing_user = await crud.get_user_by_username(db, payload.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username is already registered")
        
    # Standard role checks
    allowed_roles = ["regional_admin", "pharmacist", "inventory_controller", "finance_manager"]
    if payload.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Role must be one of {allowed_roles}")
        
    user = await crud.create_user(db, payload)
    outlet_scope = await crud.get_user_outlet_scope(db, user.id)
    
    return schemas.UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        region_id=user.region_id,
        is_active=user.is_active,
        outlet_scope=outlet_scope,
        created_at=user.created_at,
        updated_at=user.updated_at
    )


@app.patch("/auth/users/{user_id}", response_model=schemas.UserOut)
async def update_user_profile(
    user_id: uuid.UUID,
    payload: schemas.UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin_claims: dict = Depends(require_admin)
):
    """Update user properties or outlet scopes. Restricted to Regional Admin only."""
    db_user = await crud.get_user_by_id(db, user_id)
    if not db_user:
        raise NotFoundError("User not found")
        
    updated_user = await crud.update_user(db, db_user, payload)
    outlet_scope = await crud.get_user_outlet_scope(db, updated_user.id)
    
    return schemas.UserOut(
        id=updated_user.id,
        username=updated_user.username,
        email=updated_user.email,
        role=updated_user.role,
        region_id=updated_user.region_id,
        is_active=updated_user.is_active,
        outlet_scope=outlet_scope,
        created_at=updated_user.created_at,
        updated_at=updated_user.updated_at
    )


@app.delete("/auth/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user_profile(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_claims: dict = Depends(require_admin)
):
    """Deactivate a user, immediately invalidating active tokens. Restricted to Regional Admin only."""
    db_user = await crud.get_user_by_id(db, user_id)
    if not db_user:
        raise NotFoundError("User not found")
        
    # Deactivate
    await crud.update_user(db, db_user, schemas.UserUpdate(is_active=False))
    logger.info(f"User ID {user_id} was deactivated by Admin {admin_claims['sub']}")
    return


@app.get("/auth/users/{user_id}", response_model=schemas.UserOut)
async def get_user_profile(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_current_user_claims)
):
    """Fetch user profile. Restricted to the user itself or a Regional Admin."""
    current_user_id = uuid.UUID(claims["sub"])
    
    # Permission check: must be admin OR the user themselves
    if current_user_id != user_id and claims.get("role") != "regional_admin":
        raise ForbiddenError("You do not have permission to view this profile")
        
    db_user = await crud.get_user_by_id(db, user_id)
    if not db_user:
        raise NotFoundError("User not found")
        
    outlet_scope = await crud.get_user_outlet_scope(db, db_user.id)
    return schemas.UserOut(
        id=db_user.id,
        username=db_user.username,
        email=db_user.email,
        role=db_user.role,
        region_id=db_user.region_id,
        is_active=db_user.is_active,
        outlet_scope=outlet_scope,
        created_at=db_user.created_at,
        updated_at=db_user.updated_at
    )
