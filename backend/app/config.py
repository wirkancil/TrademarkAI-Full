from pydantic import Field
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # API Keys
    openai_api_key: str
    pinecone_api_key: str
    
    # Server Settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    
    # File Upload Settings
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    allowed_extensions: str = ".pdf"  # Will be parsed to list
    upload_dir: str = "uploads"
    
    # CORS Settings
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174"  # Will be parsed to list
    
    # Pinecone Settings
    pinecone_index_name: str = "trademark-search"
    pinecone_environment: str = "us-east-1"
    pinecone_index_host: str = ""
    
    # Embedding Configuration
    embedding_dimension: int = 1536
    chunk_size: int = 1000
    chunk_overlap: int = 200
    openai_embedding_model: str = "text-embedding-3-small"
    
    # Similarity Settings
    similarity_threshold: float = 0.15  # Lowered from 0.3 to 0.15 for more sensitive search
    default_top_k: int = 10  # Increased from 5 to 10 for more results
    
    class Config:
        env_file = ".env"
        case_sensitive = False

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Parse string fields to lists
        if isinstance(self.allowed_extensions, str):
            self.allowed_extensions = [ext.strip() for ext in self.allowed_extensions.split(",") if ext.strip()]
        if isinstance(self.cors_origins, str):
            self.cors_origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        
        # Ensure chunk_size and chunk_overlap are integers
        self.chunk_size = int(self.chunk_size)
        self.chunk_overlap = int(self.chunk_overlap)
        self.default_top_k = int(self.default_top_k)

# Create settings instance
settings = Settings()