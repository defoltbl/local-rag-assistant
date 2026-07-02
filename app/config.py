"""Central configuration for the RAG service."""

# Models served by the local Ollama instance
EMBED_MODEL = "nomic-embed-text"
GEN_MODEL = "llama3.1:8b"

# Chunking (characters)
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150

# Retrieval
TOP_K = 4