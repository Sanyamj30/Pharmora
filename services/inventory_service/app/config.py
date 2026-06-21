import os

class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+asyncpg://postgres:postgrespassword@localhost:5432/pharmora_inventory"
    )
    KAFKA_BOOTSTRAP_SERVERS: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    KAFKA_MOCK: bool = os.getenv("KAFKA_MOCK", "false").lower() == "true"

settings = Settings()
