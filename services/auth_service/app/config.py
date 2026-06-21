import os

class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+asyncpg://postgres:postgrespassword@localhost:5432/pharmora_auth"
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    JWT_ACCESS_EXPIRY_SECONDS: int = int(os.getenv("JWT_ACCESS_EXPIRY_SECONDS", "3600")) # 1 hour
    JWT_REFRESH_EXPIRY_SECONDS: int = int(os.getenv("JWT_REFRESH_EXPIRY_SECONDS", "604800")) # 7 days
    
    # Lockout: 5 attempts in 15 minutes
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15

settings = Settings()
