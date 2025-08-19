from typing import Dict, List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "AI Self-Assessment Platform"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Database
    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgres@postgres:5432/assessment_db"
    )
    database_user: str = "postgres"
    database_password: str = "postgres"
    database_host: str = "postgres"
    database_port: str = "5432"
    database_name: str = "assessment_db"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Auth
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # Keycloak
    KEYCLOAK_URL: str = "http://keycloak:8080"
    KEYCLOAK_REALM: str = "assessment-platform"
    KEYCLOAK_CLIENT_ID: str = "assessment-backend"
    KEYCLOAK_CLIENT_SECRET: str = ""

    # AI/ML
    OLLAMA_BASE_URL: str = "http://ollama:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"
    ollama_base_url: str = "http://ollama:11434"
    EMBEDDING_MODEL: str = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
    
    # Multilingual AI/ML Configuration
    PRIMARY_EMBEDDING_MODEL: str = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
    ENABLE_LANGUAGE_SPECIFIC_RERANKING: bool = False  # Start with False, enable after testing
    RERANKING_MODELS: Dict[str, str] = {
        'hr': "Andrija/SRoBERTa",
        'en': "sentence-transformers/all-MiniLM-L6-v2"
    }
    SUPPORTED_LANGUAGES: List[str] = ["hr", "en"]
    DEFAULT_RESPONSE_LANGUAGE: str = "hr"
    CROSS_LANGUAGE_SEARCH_ENABLED: bool = True

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "case_sensitive": True}


settings = Settings()
