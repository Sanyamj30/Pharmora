import os


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./sales.db")
    KAFKA_BOOTSTRAP_SERVERS: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    KAFKA_MOCK: bool = os.getenv("KAFKA_MOCK", "false").lower() == "true"
    
    # 32-byte AES key for prescription encryption (base64 encoded or raw string)
    # Default is a dummy key for testing, override via environment
    PRESCRIPTION_AES_KEY: str = os.getenv("PRESCRIPTION_AES_KEY", "yP3hV1sA7iO9xW8qD2fG0kL4mN6bV8cX")


settings = Settings()
