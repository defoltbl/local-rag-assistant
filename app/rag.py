"""PDF loading, chunking, and an in-memory vector index."""
import numpy as np
from pypdf import PdfReader

from app import config
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
    """Holds the embedded chunks for one document, in memory."""

    def __init__(self, provider: LLMProvider):
        self.provider = provider
        self.chunks = []
        self.vectors = None

    def build(self, path: str) -> int:
        """Load, chunk, and embed a PDF. Returns the number of chunks."""
        pages = load_pdf(path)
        self.chunks = chunk_pages(pages)
        self.vectors = np.vstack(
            [self.provider.embed(c["text"]) for c in self.chunks]
        )
        return len(self.chunks)

    def is_ready(self) -> bool:
        return self.vectors is not None

    def search(self, query: str):
        """Return the TOP_K chunks most similar to the query."""
        q = self.provider.embed(query)
        scores = self.vectors @ q
        top = np.argsort(scores)[::-1][:config.TOP_K]
        return [self.chunks[i] for i in top]