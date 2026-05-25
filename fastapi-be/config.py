import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "VastuKart API"
    ENV_MODE: str = os.getenv("ENV_MODE", "dev") # dev, prod, test
    
    # Database
    MONGO_URL: str = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    DB_NAME: str = "vastukart_db"

    # Storage
    STORAGE_TYPE: str = os.getenv("STORAGE_TYPE", "local") # local, b2, cloudinary
    B2_KEY_ID: str = os.getenv("B2_KEY_ID", "")
    CLOUDINARY_URL: str = os.getenv("CLOUDINARY_URL", "")

    # Auth Shared Secret (Must match Flask)
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-key")

settings = Settings()