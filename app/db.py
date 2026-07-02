"""PostgreSQL + pgvector persistence layer.

Embedded chunks are stored here so they survive server restarts, and the
similarity search runs inside the database instead of in memory.
"""
import psycopg
from pgvector.psycopg import register_vector
from psycopg_pool import ConnectionPool

from app import config

_SCHEMA = f"""
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS chunks (
    id        SERIAL PRIMARY KEY,
    document  TEXT NOT NULL,
    page      INTEGER NOT NULL,
    content   TEXT NOT NULL,
    embedding vector({config.EMBED_DIM}) NOT NULL
);
"""

pool = ConnectionPool(
    config.DATABASE_URL,
    open=False,
    configure=register_vector,
    kwargs={"autocommit": True},
)


def init_db() -> None:
    """Create the extension and table, then open the connection pool."""
    with psycopg.connect(config.DATABASE_URL, autocommit=True) as conn:
        conn.execute(_SCHEMA)
    pool.open()


def close() -> None:
    pool.close()


def insert_chunks(document: str, rows: list) -> None:
    """Replace any existing chunks for this document with new ones.

    rows: a list of (page, content, embedding) tuples.
    """
    with pool.connection() as conn:
        conn.execute("DELETE FROM chunks WHERE document = %s", (document,))
        conn.cursor().executemany(
            "INSERT INTO chunks (document, page, content, embedding) "
            "VALUES (%s, %s, %s, %s)",
            [(document, page, content, emb) for page, content, emb in rows],
        )


def search(query_embedding, top_k: int) -> list:
    """Return the top_k chunks most similar to the query embedding.

    The `<=>` operator is pgvector's cosine distance: smaller means closer,
    so ordering ascending puts the most relevant chunks first.
    """
    with pool.connection() as conn:
        cur = conn.execute(
            "SELECT document, page, content FROM chunks "
            "ORDER BY embedding <=> %s LIMIT %s",
            (query_embedding, top_k),
        )
        return [
            {"document": doc, "page": page, "text": content}
            for doc, page, content in cur.fetchall()
        ]


def count_chunks() -> int:
    with pool.connection() as conn:
        return conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]