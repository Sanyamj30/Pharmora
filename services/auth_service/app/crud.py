import uuid
import hashlib
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import redis
from loguru import logger

from services.auth_service.app import models, schemas, config
from shared.auth import hash_password

# Initialize Redis client, fallback to in-memory dictionary if Redis is not available
_REDIS_CLIENT = None
_IN_MEMORY_BLOCKLIST = {}  # Fallback for dev/tests: {key: expiry_timestamp}

try:
    _REDIS_CLIENT = redis.Redis.from_url(config.settings.REDIS_URL, decode_responses=True)
    # Ping to check connection
    _REDIS_CLIENT.ping()
    logger.info(f"Connected to Redis for token blocklist at {config.settings.REDIS_URL}")
except Exception as e:
    logger.warning(f"Redis is not available ({e}). Falling back to in-memory blocklist.")
    _REDIS_CLIENT = None


def hash_token_str(token: str) -> str:
    """Hash the token string using SHA-256 to store in the database."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class BlocklistManager:
    """Manages active token / user revocation blocklist with Redis or in-memory fallback."""
    
    @staticmethod
    def block_user(user_id: uuid.UUID, ttl_seconds: int = 3600):
        key = f"blocked_user:{user_id}"
        if _REDIS_CLIENT:
            try:
                _REDIS_CLIENT.setex(key, ttl_seconds, "true")
                return
            except Exception as e:
                logger.error(f"Redis error during user block: {e}")
        
        # Fallback
        expiry = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        _IN_MEMORY_BLOCKLIST[key] = expiry
        logger.info(f"[Mock Redis] Blocked user {user_id} in-memory until {expiry}")

    @staticmethod
    def is_user_blocked(user_id: uuid.UUID) -> bool:
        key = f"blocked_user:{user_id}"
        if _REDIS_CLIENT:
            try:
                val = _REDIS_CLIENT.get(key)
                return val == "true"
            except Exception as e:
                logger.error(f"Redis error during user block check: {e}")
        
        # Fallback
        if key in _IN_MEMORY_BLOCKLIST:
            expiry = _IN_MEMORY_BLOCKLIST[key]
            if datetime.now(timezone.utc) < expiry:
                return True
            else:
                del _IN_MEMORY_BLOCKLIST[key]  # Clean expired key
        return False


# User CRUD Operations

async def get_user_by_username(db: AsyncSession, username: str) -> Optional[models.User]:
    stmt = select(models.User).where(models.User.username == username)
    result = await db.execute(stmt)
    return result.scalars().first()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> Optional[models.User]:
    stmt = select(models.User).where(models.User.id == user_id)
    result = await db.execute(stmt)
    return result.scalars().first()


async def get_user_outlet_scope(db: AsyncSession, user_id: uuid.UUID) -> List[uuid.UUID]:
    stmt = select(models.UserOutletScope.outlet_id).where(models.UserOutletScope.user_id == user_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_user(db: AsyncSession, user_in: schemas.UserCreate) -> models.User:
    hashed_pwd = hash_password(user_in.password)
    
    # Create user
    db_user = models.User(
        username=user_in.username,
        email=user_in.email,
        password_hash=hashed_pwd,
        role=user_in.role,
        region_id=user_in.region_id,
        is_active=True
    )
    db.add(db_user)
    await db.flush()  # Populates db_user.id
    
    # Add outlet scopes
    for outlet_id in user_in.outlet_scope:
        scope = models.UserOutletScope(user_id=db_user.id, outlet_id=outlet_id)
        db.add(scope)
        
    await db.commit()
    await db.refresh(db_user)
    return db_user


async def update_user(db: AsyncSession, db_user: models.User, user_in: schemas.UserUpdate) -> models.User:
    update_data = user_in.model_dump(exclude_unset=True)
    
    # Handle password hashing
    if "password" in update_data and update_data["password"]:
        db_user.password_hash = hash_password(update_data["password"])
        
    # Handle other standard fields
    for field in ["email", "role", "region_id", "is_active"]:
        if field in update_data:
            setattr(db_user, field, update_data[field])
            
    # Handle outlet scope updates if passed
    if "outlet_scope" in update_data and update_data["outlet_scope"] is not None:
        # Delete old scope
        stmt = delete(models.UserOutletScope).where(models.UserOutletScope.user_id == db_user.id)
        await db.execute(stmt)
        # Add new scope
        for outlet_id in update_data["outlet_scope"]:
            scope = models.UserOutletScope(user_id=db_user.id, outlet_id=outlet_id)
            db.add(scope)
            
    # If user is deactivated, block them immediately
    if user_in.is_active is False:
        BlocklistManager.block_user(db_user.id)
        await revoke_all_user_tokens(db, db_user.id)

    db_user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(db_user)
    return db_user


# Account Lockout Operations

async def increment_failed_login(db: AsyncSession, db_user: models.User) -> int:
    """Increment failed login attempts. If threshold reached, lock account."""
    db_user.failed_login_attempts += 1
    
    if db_user.failed_login_attempts >= config.settings.MAX_LOGIN_ATTEMPTS:
        lockout_duration = timedelta(minutes=config.settings.LOCKOUT_DURATION_MINUTES)
        db_user.locked_until = datetime.now(timezone.utc) + lockout_duration
        logger.warning(f"User account '{db_user.username}' locked until {db_user.locked_until}")
        
    await db.commit()
    await db.refresh(db_user)
    return db_user.failed_login_attempts


async def reset_failed_login(db: AsyncSession, db_user: models.User) -> None:
    """Reset failed login attempts and unlock account."""
    db_user.failed_login_attempts = 0
    db_user.locked_until = None
    await db.commit()


# Token Operations

async def create_refresh_token(
    db: AsyncSession, 
    user_id: uuid.UUID, 
    token_val: str, 
    expires_at: datetime
) -> models.RefreshToken:
    token_hash = hash_token_str(token_val)
    db_token = models.RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        revoked=False
    )
    db.add(db_token)
    await db.commit()
    await db.refresh(db_token)
    return db_token


async def get_refresh_token(db: AsyncSession, token_val: str) -> Optional[models.RefreshToken]:
    token_hash = hash_token_str(token_val)
    stmt = select(models.RefreshToken).where(models.RefreshToken.token_hash == token_hash)
    result = await db.execute(stmt)
    return result.scalars().first()


async def revoke_refresh_token(db: AsyncSession, db_token: models.RefreshToken) -> None:
    db_token.revoked = True
    await db.commit()


async def revoke_all_user_tokens(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Revoke all active refresh tokens for a user."""
    stmt = select(models.RefreshToken).where(
        models.RefreshToken.user_id == user_id, 
        models.RefreshToken.revoked == False
    )
    result = await db.execute(stmt)
    active_tokens = result.scalars().all()
    for token in active_tokens:
        token.revoked = True
    await db.commit()
