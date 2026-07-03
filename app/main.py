"""FastAPI application exposing the local RAG service."""
import json
import os
import re
import tempfile
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app import config, db
from app.llm import get_provider
from app.rag import RagIndex


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create the schema and open the database connection pool.
    db.init_db()
    yield
    # Shutdown: release the pool.
    db.close()


app = FastAPI(title="Local RAG Assistant", lifespan=lifespan)

# Allow the React dev server (different port) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

provider = get_provider()
index = RagIndex(provider)

SYSTEM_PROMPT = (
    "You are a helpful assistant. Answer the question using only the context "
    "provided. If the answer is not in the context, say you do not know. "
    "Always cite the page numbers you used, in the form (page N)."
)


class QueryRequest(BaseModel):
    question: str


class QueryResponse(BaseModel):
    answer: str
    cited_pages: list[int]      # pages the answer actually referenced
    retrieved_pages: list[int]  # pages retrieval pulled (the wider net)
    elapsed_seconds: float


def cited_pages(answer: str) -> list[int]:
    """Extract the page numbers the model referenced in its answer text."""
    found = re.findall(r"pages?\s*(\d+)", answer, re.IGNORECASE)
    return sorted({int(p) for p in found})


def build_prompt(question: str):
    """Retrieve context for a question and return (user_prompt, retrieved_pages)."""
    top = index.search(question)
    context = "\n\n".join(f"[page {c['page']}] {c['text']}" for c in top)
    user = f"Context:\n{context}\n\nQuestion: {question}"
    retrieved = sorted({c["page"] for c in top})
    return user, retrieved


@app.get("/health")
def health():
    return {"status": "ok", "chunks_stored": db.count_chunks()}


@app.post("/upload")
async def upload(file: UploadFile) -> dict:
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        chunk_count = index.build(tmp_path, file.filename)
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
    user, retrieved = build_prompt(request.question)
    answer = provider.generate(SYSTEM_PROMPT, user)
    elapsed = time.perf_counter() - start

    return QueryResponse(
        answer=answer,
        cited_pages=cited_pages(answer),
        retrieved_pages=retrieved,
        elapsed_seconds=round(elapsed, 1),
    )


@app.post("/query/stream")
def query_stream(request: QueryRequest) -> StreamingResponse:
    if not index.is_ready():
        raise HTTPException(
            status_code=400, detail="No document loaded. Upload a PDF first."
        )

    user, retrieved = build_prompt(request.question)

    def event_stream():
        # Each event is a JSON object on a `data:` line (SSE). JSON-encoding
        # the token avoids newline characters breaking the SSE framing.
        start = time.perf_counter()
        parts = []
        for token in provider.generate_stream(SYSTEM_PROMPT, user):
            parts.append(token)
            yield f"data: {json.dumps({'token': token})}\n\n"

        answer = "".join(parts)
        done = {
            "done": True,
            "cited_pages": cited_pages(answer),
            "retrieved_pages": retrieved,
            "elapsed_seconds": round(time.perf_counter() - start, 1),
        }
        yield f"data: {json.dumps(done)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")