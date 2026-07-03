import { useEffect, useRef, useState } from "react";
import "./index.css";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const MAX_MB = 20;

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden>
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function friendlyError(e) {
  // fetch throws a TypeError when it can't reach the server at all.
  if (e instanceof TypeError) return "Could not reach the backend. Is it running?";
  return e.message;
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const [status, setStatus] = useState(null);
  const [connected, setConnected] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [meta, setMeta] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [askError, setAskError] = useState("");

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
      setSelectedFile(null);
      setUploadError("That file is not a PDF. Choose a .pdf file.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setSelectedFile(null);
      setUploadError(`That PDF is over ${MAX_MB} MB. Choose a smaller file.`);
      return;
    }
    setUploadError("");
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) {
      setUploadError("Choose a PDF first.");
      return;
    }
    setUploadError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await fetch(`${API}/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Upload failed. Try again.");
      }
      const data = await res.json();
      setStatus({ chunks: data.chunks, name: data.filename });
      setConnected(true);
      setAnswer("");
      setMeta(null);
    } catch (e) {
      setUploadError(friendlyError(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleAsk() {
    const q = question.trim();
    if (!q) {
      setAskError("Type a question to ask.");
      return;
    }
    if (!status) {
      setAskError("Load a document first.");
      return;
    }
    setAskError("");
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
        throw new Error(body.detail || "Query failed. Try again.");
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
      setAskError(friendlyError(e));
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
        <div className="masthead-right">
          <div className={`beacon ${connected ? "on" : "off"}`}>
            <span className="beacon-dot" />
            {connected ? "on this machine" : "backend offline"}
          </div>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
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
          <div className="row">
            <div
              className={`dropzone ${dragOver ? "over" : ""} ${selectedFile ? "has-file" : ""} ${uploadError ? "invalid" : ""}`}
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
            <button onClick={handleUpload} disabled={uploading} className="btn">
              {uploading ? "Loading\u2026" : "Load"}
            </button>
          </div>
          {uploadError ? (
            <p className="field-error">{uploadError}</p>
          ) : (
            status && (
              <p className="note">
                {status.name ? `${status.name} \u2014 ` : ""}
                <span className="mono">{status.chunks}</span> chunks embedded and
                stored.
              </p>
            )
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
              className={`text ${askError ? "invalid" : ""}`}
              placeholder="How many vacation days do employees get?"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                if (askError) setAskError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && !streaming && handleAsk()}
              disabled={!ready || streaming}
            />
            <button onClick={handleAsk} disabled={!ready || streaming} className="btn">
              {streaming ? "Answering\u2026" : "Ask"}
            </button>
          </div>
          {askError ? (
            <p className="field-error">{askError}</p>
          ) : (
            !ready && <p className="note">Load a document to start asking.</p>
          )}
        </div>
      </section>

      <div className="content-col">
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
    </div>
  );
}