import jwt
import os
import secrets
import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
from loguru import logger
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from shared.errors import UnauthorizedError

# Key configuration
_PRIVATE_KEY = None
_PUBLIC_KEY = None


def _initialize_keys():
    """Load RSA keypair from environment / files, or generate a transient pair for dev."""
    global _PRIVATE_KEY, _PUBLIC_KEY
    if _PRIVATE_KEY is not None and _PUBLIC_KEY is not None:
        return

    # Check for files in workspace root first as dev default
    private_key_env = os.getenv("JWT_PRIVATE_KEY", "jwt_private.pem")
    public_key_env = os.getenv("JWT_PUBLIC_KEY", "jwt_public.pem")

    # Helper to resolve key value (either file path or direct string)
    def resolve_key(val: Optional[str]) -> Optional[bytes]:
        if not val:
            return None
        if os.path.exists(val):
            try:
                with open(val, "rb") as f:
                    return f.read()
            except Exception:
                pass
        return val.encode("utf-8")

    # Auto-generate and save files if not present in dev mode
    if private_key_env == "jwt_private.pem" and not os.path.exists(private_key_env):
        logger.info("Generating and saving shared RSA key pair for local development...")
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        public_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        try:
            with open("jwt_private.pem", "wb") as f:
                f.write(private_pem)
            with open("jwt_public.pem", "wb") as f:
                f.write(public_pem)
        except Exception as e:
            logger.error(f"Failed to save shared development keys: {e}")

    private_bytes = resolve_key(private_key_env)
    public_bytes = resolve_key(public_key_env)

    if private_bytes and public_bytes:
        try:
            _PRIVATE_KEY = serialization.load_pem_private_key(
                private_bytes, password=None
            )
            _PUBLIC_KEY = serialization.load_pem_public_key(public_bytes)
            logger.info("JWT RSA keys loaded successfully from environment/files.")
            return
        except Exception as e:
            logger.error(f"Failed to load configured JWT keys: {e}. Falling back to dynamic generation.")

    # Fallback to generating a key pair in memory
    logger.warning("No valid JWT RSA key pair configured. Generating transient 2048-bit key pair for development.")
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    _PRIVATE_KEY = private_key
    _PUBLIC_KEY = private_key.public_key()


# Ensure keys are loaded/generated
_initialize_keys()


def generate_access_token(payload: Dict[str, Any], expires_in_seconds: int = 3600) -> str:
    """Generate an RS256 JWT access token with a specified lifetime."""
    _initialize_keys()
    
    claims = payload.copy()
    now = datetime.now(timezone.utc)
    claims.update({
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in_seconds)).timestamp())
    })
    
    private_pem = _PRIVATE_KEY.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    
    return jwt.encode(claims, private_pem, algorithm="RS256")


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate an RS256 JWT access token."""
    _initialize_keys()
    
    public_pem = _PUBLIC_KEY.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    
    try:
        # Allow disabling expiration verification via env var for local dev clock drift
        verify_exp = os.getenv("JWT_VERIFY_EXP", "true").lower() == "true"
        payload = jwt.decode(token, public_pem, algorithms=["RS256"], options={"verify_exp": verify_exp})
        return payload
    except jwt.ExpiredSignatureError:
        raise UnauthorizedError("Access token has expired")
    except jwt.InvalidTokenError as e:
        raise UnauthorizedError(f"Invalid access token: {str(e)}")


def generate_refresh_token() -> str:
    """Generate a cryptographically secure 32-byte hex refresh token."""
    return secrets.token_hex(32)


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False
