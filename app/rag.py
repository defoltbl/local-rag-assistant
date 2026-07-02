"""PDF loading, chunking, and the RAG index (backed by PostgreSQL + pgvector)."""
from pypdf import PdfReader

from app import config, db
from app.llm import LLMProvider


def load_pdf(path: str):
    """Return a list of (page_number, text) tuples for non-empty pages."""
    reader = PdfReader(path)
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append((i + 1, text))
    return pages


def chunk_pages(pages):
    """Split each page into overlapping character windows."""
    chunks = []
    for page_num, text in pages:
        start = 0
        while start < len(text):
            end = start + config.CHUNK_SIZE
            chunks.append({"page": page_num, "text": text[start:end]})
            start += config.CHUNK_SIZE - config.CHUNK_OVERLAP
    return chunks


class RagIndex:
    """Orchestrates the RAG pipeline. Storage lives in PostgreSQL (see db.py)."""

    def __init__(self, provider: LLMProvider):
        self.provider = provider

    def build(self, path: str, document: str) -> int:
        """Load, chunk, embed a PDF and persist it. Returns the chunk count."""
        pages = load_pdf(path)
        chunks = chunk_pages(pages)
        rows = [
            (c["page"], c["text"], self.provider.embed(c["text"]))
            for c in chunks
        ]
        db.insert_chunks(document, rows)
        return len(chunks)

    def is_ready(self) -> bool:
        return db.count_chunks() > 0

    def search(self, query: str):
        q = self.provider.embed(query)
        return db.search(q, config.TOP_K)