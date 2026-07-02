# Local RAG Assistant

A fully local retrieval-augmented generation (RAG) service that answers questions
about your PDF documents. It runs entirely on your own machine through
[Ollama](https://ollama.com) – no API keys, no per-query cost, and no document
data ever leaves your computer.

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-black)

## Overview

Ask a question about a PDF and get an answer grounded in the document, with the
page numbers it drew from. Because retrieval constrains the model to the
document's own text, the assistant answers from the source rather than from the
model's training data – and says when the answer is not in the document instead
of inventing one.

The whole pipeline is local: embeddings and generation are both served by Ollama.

## How it works

RAG combines document retrieval with a language model in three steps:

1. **Ingest** – the PDF is read page by page, split into overlapping text chunks,
   and each chunk is converted into an embedding (a vector capturing its meaning).
   The vectors are held in an in-memory index.
2. **Retrieve** – an incoming question is embedded the same way, and cosine
   similarity selects the handful of chunks closest in meaning to the question.
3. **Generate** – those chunks are passed to the language model as context, with
   an instruction to answer only from them and to cite the pages used.

The language-model calls sit behind a small `LLMProvider` interface. The RAG and
API layers depend on that interface, never on Ollama directly, so the backend can
be swapped (for example, to a hosted API for a cloud deployment) by adding one
class – without changing the rest of the code.

## Tech stack

- **Python 3.12**
- **FastAPI** + **Uvicorn** – async web framework and server
- **Ollama** – `llama3.1:8b` for generation, `nomic-embed-text` for embeddings
- **NumPy** – in-memory vector storage and similarity search
- **pypdf** – PDF text extraction

## Getting started

### Prerequisites

- Python 3.12+
- [Ollama](https://ollama.com) installed and running

Pull the two models once:

```bash
ollama pull nomic-embed-text
ollama pull llama3.1:8b
```

### Installation

```bash
git clone https://github.com/defoltbl/local-rag-assistant.git
cd local-rag-assistant

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

### Running

```bash
uvicorn app.main:app --reload
```

Then open the interactive API docs at http://127.0.0.1:8000/docs to upload a PDF
and ask questions in the browser.

## API

| Method | Endpoint  | Description                                        |
|--------|-----------|----------------------------------------------------|
| GET    | `/health` | Service status and whether a document is loaded.   |
| POST   | `/upload` | Upload a PDF; it is chunked and embedded in memory.|
| POST   | `/query`  | Ask a question against the loaded document.        |

Example query:

```bash
curl -X POST http://127.0.0.1:8000/query \
  -H "Content-Type: application/json" \
  -d '{ "question": "How many vacation days do employees get?" }'
```

```json
{
  "answer": "According to page 3, full-time employees are entitled to 25 days of paid vacation per calendar year.",
  "pages": [2, 3, 4, 5],
  "elapsed_seconds": 4.3
}
```

## Roadmap

- [x] Phase 1 – command-line proof-of-concept
- [x] Phase 2 – FastAPI service with a pluggable LLM provider
- [ ] Phase 3 – persistent storage with pgvector on PostgreSQL
- [ ] Phase 4 – precise citations and streaming responses
- [ ] Phase 5 – minimal web frontend
- [ ] Phase 6 – deployment to Azure with a CI pipeline

## Author

Andrii Maksymenko – [andrii-maksymenko.com](https://andrii-maksymenko.com) – [github.com/defoltbl](https://github.com/defoltbl)
