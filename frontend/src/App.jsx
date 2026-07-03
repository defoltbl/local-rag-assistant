import { useEffect, useRef, useState } from "react";
import "./index.css";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function App() {
  const [status, setStatus] = useState(null); // { chunks } once a doc is loaded
  const [connected, setConnected] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [meta, setMeta] = useState(null); // { cited, retrieved, elapsed }
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");

  const fileRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((d) => {
        setConnected(true);
        if (d.chunks_stored > 0) setStatus({ chunks: d.chunks_stored });
      })
      .catch(() => setConnected(false));
  }, []);

  function pickFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("That is not a PDF. Choose a .pdf file.");
      return;
    }
    setError("");
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError("Choose a PDF first.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await fetch(`${API}/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Upload failed.");
      }
      const data = await res.json();
      setStatus({ chunks: data.chunks, name: data.filename });
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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop();

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
  const thinking = streaming && !answer;

  return (
    <div className="page">
      <header className="masthead reveal" style={{ "--d": "0ms" }}>
        <div className="wordmark">
          <span className="wordmark-main">local rag</span>
          <span className="wordmark-sub">assistant</span>
        </div>
        <div className={`beacon ${connected ? "on" : "off"}`}>
          <span className="beacon-dot" />
          {connected ? "on this machine" : "backend offline"}
        </div>
      </header>

      <p className="tagline reveal" style={{ "--d": "80ms" }}>
        Ask questions about a PDF. Retrieved, answered, and cited entirely on
        your own machine.
      </p>

      <section className="step reveal" style={{ "--d": "160ms" }}>
        <div className="step-mark">1</div>
        <div className="step-body">
          <h2>Load a document</h2>
          <div
            className={`dropzone ${dragOver ? "over" : ""} ${selectedFile ? "has-file" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <svg className="dz-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 16V4m0 0L7 9m5-5l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="dz-text">
              {selectedFile ? selectedFile.name : "Drop a PDF here, or click to browse"}
            </span>
          </div>
          <div className="row end">
            <button
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className="btn"
            >
              {uploading ? "Loading\u2026" : "Load"}
            </button>
          </div>
          {status && (
            <p className="note">
              {status.name ? `${status.name} \u2014 ` : ""}
              <span className="mono">{status.chunks}</span> chunks embedded and
              stored.
            </p>
          )}
        </div>
      </section>

      <section className={`step reveal ${ready ? "" : "muted"}`} style={{ "--d": "240ms" }}>
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
          {thinking ? (
            <div className="thinking">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="thinking-label">Retrieving from your document</span>
            </div>
          ) : (
            <p className="excerpt">
              {answer}
              {streaming && <span className="caret" />}
            </p>
          )}

          {meta && (
            <footer className="citations">
              <div className="cite-group">
                <span className="cite-label">cited</span>
                {meta.cited.length ? (
                  meta.cited.map((p, i) => (
                    <span key={p} className="chip cited" style={{ "--i": i }}>{p}</span>
                  ))
                ) : (
                  <span className="chip none">none</span>
                )}
              </div>
              <div className="cite-group">
                <span className="cite-label">retrieved</span>
                {meta.retrieved.map((p, i) => (
                  <span key={p} className="chip" style={{ "--i": i }}>{p}</span>
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