# Local RAG Assistant

A fully local retrieval-augmented generation (RAG) service that answers questions
about your PDF documents. Upload a PDF, ask a question, and get an answer grounded
in the document – streamed token by token and cited by page – running entirely on
your own machine through [Ollama](https://ollama.com). No API keys, no per-query
cost, and no document data ever leaves your computer.

![CI](https://github.com/defoltbl/local-rag-assistant/actions/workflows/ci.yml/badge.svg)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-black)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)

---

## Contents

- [Overview](#overview)
- [Key features](#key-features)
- [Architecture](#architecture)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Testing](#testing)
- [Engineering notes](#engineering-notes)
- [Author](#author)

---

## Overview

Large language models answer from their training data, which means they can be
confidently wrong about your specific documents. Retrieval-augmented generation
fixes this by retrieving the most relevant passages from a source document and
constraining the model to answer only from them. This project implements that
pattern end to end, as a small full-stack application that runs offline.

Every part of the pipeline is local: embeddings and text generation are served by
Ollama, and the document vectors are stored in PostgreSQL. Because the model is
instructed to answer strictly from retrieved context, it declines to answer when
the document does not contain the information, rather than inventing a response.

## Key features

- **Grounded answers with page citations.** Every answer reports the pages it
  actually referenced, kept distinct from the wider set of pages retrieval
  considered – an honest view of the model's sources.
- **Token-by-token streaming.** Answers stream to the browser over Server-Sent
  Events, so results appear as they are generated instead of after a long wait.
- **Persistent vector storage.** Embeddings live in PostgreSQL via the pgvector
  extension and survive restarts; similarity search runs inside the database.
- **Provider-agnostic model layer.** Generation and embeddings sit behind an
  interface, so the local Ollama backend can be swapped for another without
  touching the retrieval or API code.
- **One-command stack.** The database, models, backend, and frontend all start
  together with `docker compose up`.
- **Tested in CI.** A GitHub Actions pipeline lints and tests the backend and
  builds the frontend on every push.

## Architecture

```mermaid
flowchart LR
    U["React frontend"]
    A["FastAPI backend"]
    O["Ollama<br/>llama3.1:8b · nomic-embed-text"]
    P[("PostgreSQL<br/>+ pgvector")]

    U -->|"upload PDF"| A
    U -->|"ask question (SSE stream)"| A
    A -->|"embed chunks / query, generate answer"| O
    A -->|"store vectors / cosine search"| P
```

The backend is the only component that talks to the model and the database. The
frontend is a static single-page app that calls the backend's HTTP API.

## How it works

RAG combines document retrieval with a language model in three stages:

1. **Ingest.** The uploaded PDF is read page by page and split into overlapping
   character chunks. Each chunk is embedded into a vector that captures its
   meaning, and the vectors are stored in a pgvector table alongside their page
   numbers.
2. **Retrieve.** An incoming question is embedded with the same model, and a
   cosine-similarity search in PostgreSQL returns the handful of chunks closest
   in meaning to the question.
3. **Generate.** Those chunks are inserted into the prompt as context, with an
   instruction to answer only from them and to cite the pages used. The answer is
   streamed back to the client as it is produced.

## Tech stack

| Layer          | Technology                                                        |
|----------------|-------------------------------------------------------------------|
| Backend        | Python 3.12, FastAPI, Uvicorn                                      |
| Models         | Ollama – `llama3.1:8b` (generation), `nomic-embed-text` (embeddings) |
| Vector store   | PostgreSQL with the pgvector extension                            |
| Frontend       | React 19, Vite, Server-Sent Events                                |
| PDF parsing    | pypdf                                                              |
| Infrastructure | Docker, Docker Compose, GitHub Actions                            |

## Project structure

```
local-rag-assistant/
├── app/                      # FastAPI backend package
│   ├── config.py             # central settings (models, chunking, DB, CORS)
│   ├── llm.py                # LLMProvider interface + Ollama implementation
│   ├── rag.py                # PDF loading, chunking, RagIndex orchestration
│   ├── db.py                 # PostgreSQL + pgvector persistence layer
│   └── main.py               # API endpoints and app lifecycle
├── frontend/                 # React single-page app (Vite)
│   ├── src/App.jsx           # UI, streaming client, state
│   ├── src/index.css         # design system and theming
│   ├── Dockerfile            # multi-stage build → nginx
│   └── nginx.conf            # static serving with SPA fallback
├── tests/
│   └── test_api.py           # API tests (mock the model + DB, run in CI)
├── .github/workflows/ci.yml  # lint + test + build pipeline
├── Dockerfile                # backend image
├── docker-compose.yml        # full-stack orchestration
├── requirements.txt          # backend dependencies
├── ruff.toml                 # linter configuration
└── rag_poc.py                # original command-line proof-of-concept
```

## Getting started

### With Docker (recommended)

The entire stack comes up with a single command. Requires Docker.

```bash
docker compose up -d
```

The first run pulls the Ollama models (about 5 GB), so allow a few minutes. Track
progress with `docker compose logs -f ollama-init`; the models are ready once that
container exits.

- Frontend: <http://localhost:8080>
- Interactive API docs: <http://localhost:8000/docs>

Stop everything with `docker compose down`, adding `-v` to also remove the stored
data and downloaded models.

> Models run on CPU inside containers, so answers are slower than a native Ollama
> install with GPU acceleration. For fast local development, run the backend
> directly against a containerized database (below).

### Local development

Requires Python 3.12, Node 20, and [Ollama](https://ollama.com) running locally.

```bash
# Pull the models once
ollama pull nomic-embed-text
ollama pull llama3.1:8b

# Start only the database in Docker (published on host port 5433)
docker compose up -d db

# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (second terminal)
cd frontend
npm install
npm run dev
```

The backend serves on <http://127.0.0.1:8000> and the Vite dev server on
<http://localhost:5173>.

## Configuration

All settings have working defaults and can be overridden with environment
variables.

| Variable       | Default                                     | Purpose                                         |
|----------------|---------------------------------------------|-------------------------------------------------|
| `DATABASE_URL` | `postgresql://rag:rag@localhost:5433/rag`   | PostgreSQL connection string.                   |
| `OLLAMA_HOST`  | `http://localhost:11434`                    | Address of the Ollama server.                   |
| `CORS_ORIGINS` | localhost dev + `:8080`                      | Comma-separated origins allowed to call the API.|
| `VITE_API_URL` | `http://127.0.0.1:8000`                     | Backend base URL baked into the frontend build. |

Model names, chunk size, chunk overlap, and the number of retrieved chunks are
defined as constants in `app/config.py`.

## API reference

| Method | Endpoint        | Description                                          |
|--------|-----------------|------------------------------------------------------|
| GET    | `/health`       | Service status and the number of stored chunks.      |
| POST   | `/upload`       | Upload a PDF; it is chunked, embedded, and stored.   |
| POST   | `/query`        | Ask a question; returns the complete answer as JSON. |
| POST   | `/query/stream` | Ask a question; streams the answer token by token.   |

**Example – JSON query**

```bash
curl -X POST http://127.0.0.1:8000/query \
  -H "Content-Type: application/json" \
  -d '{ "question": "How many vacation days do employees get?" }'
```

```json
{
  "answer": "Full-time employees are entitled to 25 days of paid vacation per calendar year (page 3).",
  "cited_pages": [3],
  "retrieved_pages": [2, 3, 4, 5],
  "elapsed_seconds": 1.9
}
```

`cited_pages` are the pages the answer referenced; `retrieved_pages` are all the
pages similarity search pulled into context.

**Example – streaming query**

```bash
curl -N -X POST http://127.0.0.1:8000/query/stream \
  -H "Content-Type: application/json" \
  -d '{ "question": "How many vacation days do employees get?" }'
```

The response is a Server-Sent Event stream: one `data: {"token": "..."}` event per
token, followed by a final `data: {"done": true, "cited_pages": [...], ...}` event.

## Testing

```bash
pip install pytest
pytest
```

The tests mock the model and database, so they run without Ollama or PostgreSQL –
the same suite the CI pipeline runs on every push.

## Engineering notes

A few decisions worth highlighting:

- **The model layer is an interface, not a hardcoded call.** `LLMProvider` defines
  `embed`, `generate`, and `generate_stream`; `OllamaProvider` implements them. The
  retrieval and API layers depend only on the interface, which is what makes the
  backend swappable between local and hosted models.
- **Citations are parsed from the answer, not the retrieval net.** Reporting every
  retrieved page would overstate the sources, so the service extracts the pages the
  model actually referenced and reports them separately from what was retrieved.
- **Streaming from a POST endpoint.** The browser's native `EventSource` only
  supports GET, so the frontend reads the response body as a stream and parses the
  SSE frames manually, allowing a POST body carrying the question.
- **Similarity search runs in the database.** Rather than loading every vector into
  the application, pgvector's cosine-distance operator performs the nearest-neighborß
  search in SQL, and a connection pool reuses database connections across requests.

## Author

**Andrii Maksymenko**
[andrii-maksymenko.com](https://andrii-maksymenko.com) · [github.com/defoltbl](https://github.com/defoltbl)