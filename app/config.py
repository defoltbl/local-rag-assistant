"""Central configuration for the RAG service."""
import os

# Models served by the local Ollama instance
EMBED_MODEL = "nomic-embed-text"
GEN_MODEL = "llama3.1:8b"
EMBED_DIM = 768  # dimension of nomic-embed-text vectors

# Chunking (characters)
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150

# Retrieval
TOP_K = 4

# Database (override with an environment variable in production)
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://rag:rag@localhost:5433/rag"
)

# Origins allowed to call the API (comma-separated env var in prod).
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:5174,http://127.0.0.1:5174,"
    "http://localhost:8080,http://127.0.0.1:8080",
).split(",")