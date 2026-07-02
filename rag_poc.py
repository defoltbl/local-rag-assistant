"""
RAG proof-of-concept: query a PDF fully locally with Ollama.

Usage:
    python rag_poc.py <path-to-pdf>
"""
import sys
import time
import numpy as np
import ollama
from pypdf import PdfReader

EMBED_MODEL = "nomic-embed-text"
GEN_MODEL = "llama3.1:8b"
CHUNK_SIZE = 800        # characters per chunk
CHUNK_OVERLAP = 150     # characters shared between neighbouring chunks
TOP_K = 4               # how many chunks to retrieve per query


def load_pdf(path):
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
            end = start + CHUNK_SIZE
            chunks.append({"page": page_num, "text": text[start:end]})
            start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def embed(text):
    """Return a normalised embedding vector for a piece of text."""
    resp = ollama.embeddings(model=EMBED_MODEL, prompt=text)
    vec = np.array(resp["embedding"], dtype=np.float32)
    return vec / np.linalg.norm(vec)


def build_index(chunks):
    """Embed every chunk once and stack the vectors into a matrix."""
    return np.vstack([embed(c["text"]) for c in chunks])


def retrieve(query, chunks, vectors):
    """Return the TOP_K chunks most similar to the query."""
    q = embed(query)
    scores = vectors @ q            # cosine similarity (vectors are normalised)
    top = np.argsort(scores)[::-1][:TOP_K]
    return [chunks[i] for i in top]


def answer(query, context_chunks):
    """Ask the local model to answer using only the retrieved context."""
    context = "\n\n".join(
        f"[page {c['page']}] {c['text']}" for c in context_chunks
    )
    system = (
        "You are a helpful assistant. Answer the question using only the "
        "context provided. If the answer is not in the context, say you do "
        "not know. Always cite the page numbers you used."
    )
    user = f"Context:\n{context}\n\nQuestion: {query}"
    resp = ollama.chat(
        model=GEN_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp["message"]["content"]


def main():
    if len(sys.argv) < 2:
        print("Usage: python rag_poc.py <path-to-pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    print(f"Loading {pdf_path} ...")
    pages = load_pdf(pdf_path)
    chunks = chunk_pages(pages)

    print(f"Split into {len(chunks)} chunks. Embedding locally ...")
    vectors = build_index(chunks)

    print("Index ready. Ask questions (empty line to quit).\n")
    while True:
        query = input("> ").strip()
        if not query:
            break
        start = time.perf_counter()
        top = retrieve(query, chunks, vectors)
        response = answer(query, top)
        elapsed = time.perf_counter() - start
        print(f"\n{response}\n")
        print(f"(answered in {elapsed:.1f}s)\n")


if __name__ == "__main__":
    main()