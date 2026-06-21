import os

class Settings:
    # Downstream service URLs
    AUTH_SERVICE_URL: str = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
    INVENTORY_SERVICE_URL: str = os.getenv("INVENTORY_SERVICE_URL", "http://localhost:8002")
    SALES_SERVICE_URL: str = os.getenv("SALES_SERVICE_URL", "http://localhost:8003")
    REPORTING_SERVICE_URL: str = os.getenv("REPORTING_SERVICE_URL", "http://localhost:8004")
    
    # Redis configuration
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # Rate limit thresholds
    RATE_LIMIT_USER_PER_MIN: int = int(os.getenv("RATE_LIMIT_USER_PER_MIN", "100"))
    RATE_LIMIT_OUTLET_PER_MIN: int = int(os.getenv("RATE_LIMIT_OUTLET_PER_MIN", "1000"))

settings = Settings()
