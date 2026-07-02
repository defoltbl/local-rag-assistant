"""FastAPI application exposing the local RAG service."""
import os
import tempfile
import time

from fastapi import FastAPI, HTTPException, UploadFile
from pydantic import BaseModel

from app.llm import get_provider
from app.rag import RagIndex

app = FastAPI(title="Local RAG Assistant")

# Shared state for the running server: one provider, one in-memory index.
provider = get_provider()
index = RagIndex(provider)

SYSTEM_PROMPT = (
    "You are a helpful assistant. Answer the question using only the context "
    "provided. If the answer is not in the context, say you do not know. "
    "Always cite the page numbers you used."
)


class QueryRequest(BaseModel):
    question: str


class QueryResponse(BaseModel):
    answer: str
    pages: list[int]
    elapsed_seconds: float


@app.get("/health")
def health():
    return {"status": "ok", "document_loaded": index.is_ready()}


@app.post("/upload")
async def upload(file: UploadFile) -> dict:
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")

    # Save the upload to a temp file so pypdf can read it from disk.
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        chunk_count = index.build(tmp_path)
    finally:
        os.unlink(tmp_path)

    return {"filename": file.filename, "chunks": chunk_count}


@app.post("/query", response_model=QueryResponse)
def query(request: QueryRequest) -> QueryResponse:
    if not index.is_ready():
        raise HTTPException(
            status_code=400, detail="No document loaded. Upload a PDF first."
        )

    start = time.perf_counter()
    top = index.search(request.question)
    context = "\n\n".join(f"[page {c['page']}] {c['text']}" for c in top)
    user = f"Context:\n{context}\n\nQuestion: {request.question}"
    answer = provider.generate(SYSTEM_PROMPT, user)
    elapsed = time.perf_counter() - start

    pages = sorted({c["page"] for c in top})
    return QueryResponse(
        answer=answer, pages=pages, elapsed_seconds=round(elapsed, 1)
    )