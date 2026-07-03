import { useEffect, useRef, useState } from "react";
import "./index.css";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function App() {
  const [status, setStatus] = useState(null); // { chunks } once a doc is loaded
  const [connected, setConnected] = useState(false);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [meta, setMeta] = useState(null); // { cited, retrieved, elapsed }
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");

  const fileRef = useRef(null);

  // On load, check the backend and how many chunks are already stored.
  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((d) => {
        setConnected(true);
        if (d.chunks_stored > 0) setStatus({ chunks: d.chunks_stored });
      })
      .catch(() => setConnected(false));
  }, []);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF first.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Upload failed.");
      }
      const data = await res.json();
      setFileName(data.filename);
      setStatus({ chunks: data.chunks });
      setAnswer("");
      setMeta(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleAsk() {
    const q = question.trim();
    if (!q) return;
    setError("");
    setAnswer("");
    setMeta(null);
    setStreaming(true);

    try {
      const res = await fetch(`${API}/query/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Query failed.");
      }

      // Read the Server-Sent Events stream. Events are separated by a blank
      // line; each carries a JSON payload after "data: ".
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop(); // keep any partial event for the next chunk

        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith("data:")) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.done) {
            setMeta({
              cited: payload.cited_pages,
              retrieved: payload.retrieved_pages,
              elapsed: payload.elapsed_seconds,
            });
          } else if (payload.token) {
            setAnswer((prev) => prev + payload.token);
          }
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setStreaming(false);
    }
  }

  const ready = !!status;

  return (
    <div className="page">
      <header className="masthead">
        <div className="wordmark">
          <span className="wordmark-main">local rag</span>
          <span className="wordmark-sub">assistant</span>
        </div>
        <div className={`beacon ${connected ? "on" : "off"}`}>
          <span className="beacon-dot" />
          {connected ? "on this machine" : "backend offline"}
        </div>
      </header>

      <p className="tagline">
        Ask questions about a PDF. Retrieved, answered, and cited entirely on
        your own machine.
      </p>

      <section className="step">
        <div className="step-mark">1</div>
        <div className="step-body">
          <h2>Load a document</h2>
          <div className="row">
            <input ref={fileRef} type="file" accept="application/pdf" className="file" />
            <button onClick={handleUpload} disabled={uploading} className="btn">
              {uploading ? "Loading\u2026" : "Load"}
            </button>
          </div>
          {status && (
            <p className="note">
              {fileName ? `${fileName} \u2014 ` : ""}
              <span className="mono">{status.chunks}</span> chunks embedded and
              stored.
            </p>
          )}
        </div>
      </section>

      <section className={`step ${ready ? "" : "muted"}`}>
        <div className="step-mark">2</div>
        <div className="step-body">
          <h2>Ask</h2>
          <div className="row">
            <input
              type="text"
              className="text"
              placeholder="How many vacation days do employees get?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ready && !streaming && handleAsk()}
              disabled={!ready || streaming}
            />
            <button onClick={handleAsk} disabled={!ready || streaming} className="btn">
              {streaming ? "Answering\u2026" : "Ask"}
            </button>
          </div>
          {!ready && <p className="note">Load a document to start asking.</p>}
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      {(answer || streaming) && (
        <section className="answer-surface">
          <p className="excerpt">
            {answer}
            {streaming && <span className="caret" />}
          </p>

          {meta && (
            <footer className="citations">
              <div className="cite-group">
                <span className="cite-label">cited</span>
                {meta.cited.length ? (
                  meta.cited.map((p) => (
                    <span key={p} className="chip cited">{p}</span>
                  ))
                ) : (
                  <span className="chip none">none</span>
                )}
              </div>
              <div className="cite-group">
                <span className="cite-label">retrieved</span>
                {meta.retrieved.map((p) => (
                  <span key={p} className="chip">{p}</span>
                ))}
              </div>
              <span className="elapsed mono">{meta.elapsed}s</span>
            </footer>
          )}
        </section>
      )}
    </div>
  );
}