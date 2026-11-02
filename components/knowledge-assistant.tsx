"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { chunkText, isSupportedDocument, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_CHARS } from "@/lib/chunking";
import { retrieveChunks, type Citation } from "@/lib/retrieval";

type DocumentRow = {
  id: string;
  name: string;
  mime_type: string;
  byte_size: number;
  created_at: string;
};

type DemoDocument = DocumentRow & { content: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  preview?: boolean;
};

const SAMPLE_DOCUMENTS: DemoDocument[] = [
  {
    id: "sample-handbook",
    name: "team-handbook.md",
    mime_type: "text/markdown",
    byte_size: 1_342,
    created_at: "2026-10-28T15:00:00.000Z",
    content: `# Team Handbook\n\n## Flexible work\nOur team works asynchronously across time zones. Core collaboration hours are 10:00–14:00 UTC, Tuesday through Thursday. Teams should document decisions in the project workspace so colleagues can catch up later.\n\n## Learning budget\nEach team member has a yearly learning budget of $1,200. It can be used for courses, books, or conference tickets with manager approval. Submit receipts within 30 days of purchase.\n\n## Time away\nPlease request planned time away at least two weeks in advance. The team observes company holidays published at the start of each year.`,
  },
  {
    id: "sample-onboarding",
    name: "onboarding-guide.txt",
    mime_type: "text/plain",
    byte_size: 967,
    created_at: "2026-10-28T15:00:00.000Z",
    content: `# Getting started\n\nNew teammates receive a laptop and account access on their first day. Start with the security orientation, then meet your onboarding partner for a workspace tour.\n\n## First week\nRead the team handbook, set up multi-factor authentication, and schedule introductions with your immediate team. Your manager will share a first-month goals document by Friday.\n\n## Support\nFor account or equipment issues, contact the internal help desk at help@example.test. For team-specific questions, ask in the onboarding channel.`,
  },
  {
    id: "sample-incident",
    name: "incident-playbook.md",
    mime_type: "text/markdown",
    byte_size: 1_120,
    created_at: "2026-10-28T15:00:00.000Z",
    content: `# Incident response\n\n## Severity one\nThe incident lead opens a response channel, assigns an owner, and posts a customer-safe status update within 30 minutes. Record timestamps and decisions in the incident log.\n\n## Follow-up\nWithin five business days of resolution, hold a blameless review. The review should identify contributing factors, customer impact, and concrete follow-up actions with owners and due dates.\n\n## Escalation\nIf customer data may be affected, contact the security lead immediately. Preserve relevant logs and do not speculate about the cause in external communications.`,
  },
];

const INITIAL_PROMPT = "Ask a question to discover what your documents say.";

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    sparkle: "M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Zm7 10 .9 2.1L22 16l-2.1.9L19 19l-.9-2.1L16 16l2.1-.9L19 13Z",
    file: "M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7Zm0 1v6h6M8 13h8m-8 4h8",
    upload: "M12 16V4m0 0L7 9m5-5 5 5M4 20h16",
    arrow: "M7 17 17 7M7 7h10v10",
    send: "m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13",
    trash: "M3 6h18m-2 0-1 14H6L5 6m4 0V4h6v2m-5 4v7m4-7v7",
    check: "m5 12 4 4L19 6",
    lock: "M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4",
    plus: "M12 5v14m-7-7h14",
    menu: "M4 6h16M4 12h16M4 18h16",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.file} /></svg>;
}

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(0)} KB`;
}

function prettyDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function KnowledgeAssistant({
  initialEmail,
  initialDocuments,
  databaseConfigured,
}: {
  initialEmail: string | null;
  initialDocuments: DocumentRow[];
  databaseConfigured: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(initialEmail);
  const [documents, setDocuments] = useState<DocumentRow[]>(initialDocuments);
  const [demoDocuments, setDemoDocuments] = useState<DemoDocument[]>(SAMPLE_DOCUMENTS);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [tab, setTab] = useState<"ask" | "documents">("ask");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const demoMode = !databaseConfigured;
  const canChat = demoMode || (Boolean(email) && providerConfigured);
  const totalDocs = demoMode ? demoDocuments.length : documents.length;

  useEffect(() => {
    let active = true;
    fetch("/api/status", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((status) => {
        if (!active || !status) return;
        setProviderConfigured(Boolean(status.providerConfigured));
        setProviderError(status.providerError ?? null);
      })
      .catch(() => {
        if (active) setProviderError("Could not check the AI provider configuration.");
      });
    return () => { active = false; };
  }, []);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: authMode, email: authEmail, password: authPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not authenticate.");
      if (data.confirmationRequired) {
        setAuthMessage("Check your inbox to confirm your email, then sign in.");
      } else {
        setEmail(data.email ?? authEmail);
        setAuthMessage(authMode === "sign-up" ? "Account created. You’re signed in." : "Welcome back.");
        router.refresh();
      }
      setAuthPassword("");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not authenticate.");
    }
    setAuthBusy(false);
  }

  async function signOut() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sign-out" }),
    });
    setEmail(null);
    setDocuments([]);
    setMessages([]);
    router.refresh();
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!files.length) return;
    setNotice("");
    setUploading(true);
    const selected = Array.from(files);
    for (const file of selected) {
      if (!isSupportedDocument(file.name, file.type)) {
        setNotice(`${file.name}: only text and Markdown files are supported.`);
        continue;
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        setNotice(`${file.name}: file exceeds the 500 KB limit.`);
        continue;
      }
      try {
        const content = await file.text();
        if (!content.trim() || content.length > MAX_DOCUMENT_CHARS) {
          setNotice(`${file.name}: documents must contain up to 40,000 characters.`);
          continue;
        }
        if (demoMode) {
          const localDoc: DemoDocument = {
            id: `local-${crypto.randomUUID()}`,
            name: file.name,
            mime_type: file.type || "text/plain",
            byte_size: file.size,
            created_at: new Date().toISOString(),
            content,
          };
          setDemoDocuments((current) => [localDoc, ...current]);
          setNotice(`${file.name} added to this browser session only. It is not uploaded or saved.`);
        } else {
          if (!email) {
            setNotice("Sign in before adding documents.");
            break;
          }
          const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: file.name, content, mimeType: file.type || "text/plain" }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Could not add document.");
          setDocuments((current) => [data.document, ...current]);
          setNotice(`${file.name} uploaded and indexed.`);
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : `Could not read ${file.name}.`);
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function deleteDocument(document: DocumentRow) {
    setNotice("");
    if (demoMode) {
      setDemoDocuments((current) => current.filter((entry) => entry.id !== document.id));
      setMessages((current) => current.filter((message) => message.preview !== true));
      setNotice(`${document.name} removed from this browser session.`);
      return;
    }
    const response = await fetch(`/api/documents?id=${encodeURIComponent(document.id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error ?? "Could not delete document.");
      return;
    }
    setDocuments((current) => current.filter((entry) => entry.id !== document.id));
    setNotice(`${document.name} deleted.`);
  }

  async function askQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || busy) return;
    if (!canChat) {
      setNotice(email ? "AI is unavailable until an AI provider is configured." : "Sign in to ask questions.");
      return;
    }
    setBusy(true);
    setQuestion("");
    setMessages((current) => [...current, { role: "user", content: prompt }]);

    if (demoMode) {
      const localChunks = demoDocuments.flatMap((document) =>
        chunkText(document.content).map((chunk) => ({
          id: `${document.id}-${chunk.index}`,
          documentId: document.id,
          documentName: document.name,
          content: chunk.content,
          chunkIndex: chunk.index,
        })),
      );
      const citations = retrieveChunks(prompt, localChunks, 5);
      const content = citations.length
        ? "These are the closest matching excerpts from your local demo documents. This is a retrieval preview—not an AI-generated answer."
        : "No matching excerpt found in the local demo documents. Try different wording or add a document.";
      setMessages((current) => [...current, { role: "assistant", content, citations, preview: true }]);
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not answer this question.");
      setMessages((current) => [...current, { role: "assistant", content: data.answer, citations: data.citations }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error instanceof Error ? error.message : "The request failed. Please try again.",
      }]);
    } finally {
      setBusy(false);
    }
  }

  const visibleDocs = demoMode ? demoDocuments : documents;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Knowly home">
          <span className="brand-mark"><Icon name="sparkle" size={20} /></span>
          <span>knowly<span className="brand-period">.</span></span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <button className={`side-link ${tab === "ask" ? "selected" : ""}`} onClick={() => setTab("ask")}>
          <Icon name="sparkle" size={17} /> Ask your knowledge
        </button>
        <button className={`side-link ${tab === "documents" ? "selected" : ""}`} onClick={() => setTab("documents")}>
          <Icon name="file" size={17} /> Your documents <span className="side-count">{totalDocs}</span>
        </button>
        <div className="sidebar-bottom">
          <div className="secure-note"><Icon name="lock" size={16} /><span>Your sources stay yours.<br />Private by design.</span></div>
          <div className="profile-row">
            <div className="avatar">{email ? email.slice(0, 1).toUpperCase() : "G"}</div>
            <div className="profile-copy"><strong>{email ?? "Guest workspace"}</strong><span>{demoMode ? "Local demo" : "Personal workspace"}</span></div>
            {email && <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={signOut}><Icon name="arrow" size={16} /></button>}
          </div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs">Workspace <span>/</span> <strong>{tab === "ask" ? "Ask your knowledge" : "Your documents"}</strong></div>
          <div className="topbar-actions">
            <span className={`mode-pill ${demoMode ? "demo" : ""}`}><span className="status-dot" />{demoMode ? "DEMO MODE" : providerConfigured ? "AI READY" : "AI NOT CONFIGURED"}</span>
            {email && <button className="user-chip" onClick={signOut}><span className="avatar small">{email.slice(0, 1).toUpperCase()}</span><span>{email}</span></button>}
          </div>
        </header>

        <div className="content">
          {demoMode && (
            <div className="demo-banner">
              <span className="demo-icon"><Icon name="sparkle" size={17} /></span>
              <div><strong>You’re exploring the local demo</strong><p>Sample documents and uploads stay in this browser session. Retrieval previews show exact excerpts—no AI answers or server uploads are simulated.</p></div>
              <span className="banner-tag">NOT CONNECTED</span>
            </div>
          )}
          {!demoMode && !providerConfigured && (
            <div className="config-banner"><Icon name="lock" size={17} /><div><strong>AI answers are unavailable</strong><p>{providerError ?? "Configure LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL on the server to enable answers."} Documents remain private and can still be managed.</p></div></div>
          )}

          {tab === "ask" ? (
            <div className="ask-layout">
              <div className="page-heading">
                <div className="eyebrow"><span className="heading-dot" /> YOUR PRIVATE KNOWLEDGE SPACE</div>
                <h1>Answers, grounded<br />in <span>your knowledge.</span></h1>
                <p>Ask a question. Get a clear answer connected to the exact passages in your documents.</p>
              </div>

              {demoMode ? (
                <div className="demo-question">
                  <div className="demo-question-heading"><div><span className="mini-label">TRY A SAMPLE QUESTION</span><p>See how source-backed search works.</p></div><span className="outline-pill">RETRIEVAL ONLY</span></div>
                  <div className="suggestion-row">
                    {["What’s the learning budget?", "When should incidents be reviewed?", "What happens during onboarding?"].map((item) =>
                      <button key={item} className="suggestion" onClick={() => setQuestion(item)}>{item}<Icon name="arrow" size={14} /></button>,
                    )}
                  </div>
                </div>
              ) : !email ? (
                <section className="auth-card">
                  <div className="auth-lock"><Icon name="lock" size={19} /></div>
                  <h2>Your private workspace awaits</h2>
                  <p>Sign in to upload documents and ask questions about them.</p>
                  <form onSubmit={handleAuth} className="auth-form">
                    <label>Email address<input type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@company.com" required /></label>
                    <label>Password<input type="password" autoComplete={authMode === "sign-in" ? "current-password" : "new-password"} minLength={8} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 8 characters" required /></label>
                    <button className="primary-button full" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "sign-in" ? "Sign in" : "Create account"}<Icon name="arrow" size={16} /></button>
                  </form>
                  {authMessage && <p className="auth-feedback" role="status">{authMessage}</p>}
                  <p className="auth-switch">{authMode === "sign-in" ? "New here?" : "Already have an account?"} <button onClick={() => { setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in"); setAuthMessage(""); }}>{authMode === "sign-in" ? "Create an account" : "Sign in"}</button></p>
                </section>
              ) : (
                <section className="welcome-strip">
                  <span className="welcome-check"><Icon name="check" size={18} /></span>
                  <div><strong>Ready to explore your sources</strong><p>Add a document or ask about the {documents.length} already in your workspace.</p></div>
                  <button className="text-button" onClick={() => setTab("documents")}>Manage sources <Icon name="arrow" size={14} /></button>
                </section>
              )}

              <section className={`conversation ${messages.length ? "has-messages" : ""}`}>
                <div className="conversation-header"><div><span className="live-dot" /> SOURCE-GROUNDED CHAT</div><span>{demoMode ? "LOCAL RETRIEVAL" : providerConfigured ? "PRIVATE SESSION" : "PROVIDER REQUIRED"}</span></div>
                {messages.length === 0 ? (
                  <div className="empty-chat"><div className="empty-icon"><Icon name="sparkle" size={21} /></div><strong>{INITIAL_PROMPT}</strong><span>Answers are grounded in your documents, not the open web.</span></div>
                ) : (
                  <div className="messages">
                    {messages.map((message, index) => (
                      <article key={`${index}-${message.role}`} className={`message ${message.role}`}>
                        <div className="message-author">{message.role === "user" ? "YOU" : demoMode ? "RETRIEVAL PREVIEW" : "KNOWLY"}</div>
                        <p>{message.content}</p>
                        {message.citations && message.citations.length > 0 && <div className="citations"><div className="citation-heading">MATCHED SOURCE EXCERPTS <span>{message.citations.length}</span></div>
                          {message.citations.map((citation, citeIndex) => (
                            <div className="citation-card" key={`${citation.documentId}-${citation.chunkIndex}`}>
                              <div><span className="citation-number">[{citeIndex + 1}]</span><strong>{citation.documentName}</strong><span>Passage {citation.chunkIndex + 1}</span></div>
                              <blockquote>{citation.snippet}</blockquote>
                            </div>
                          ))}
                        </div>}
                      </article>
                    ))}
                    {busy && <div className="typing"><span /><span /><span /> Searching your sources…</div>}
                  </div>
                )}
                <form className="composer" onSubmit={askQuestion}>
                  <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }} placeholder={demoMode ? "Ask about the sample docs or your own…" : providerConfigured ? "Ask a question about your documents…" : "AI answers need a configured provider"} maxLength={1_600} rows={2} aria-label="Your question" />
                  <div className="composer-bottom"><span>ENTER TO SEND · SHIFT + ENTER FOR A NEW LINE</span><button aria-label="Send question" disabled={!question.trim() || busy || (!demoMode && (!email || !providerConfigured))} className="send-button"><Icon name="send" size={17} /></button></div>
                </form>
                <div className="chat-footnote"><Icon name="lock" size={13} /> {demoMode ? "Local demo content is not sent to any AI service." : "Your documents are only visible to your account."}</div>
              </section>

              <div className="trust-row"><span><Icon name="lock" size={15} /> PRIVATE BY DEFAULT</span><i /> <span>EXACT SOURCE EXCERPTS</span><i /> <span>YOU STAY IN CONTROL</span></div>
            </div>
          ) : (
            <section className="documents-page">
              <div className="docs-heading">
                <div><div className="eyebrow"><span className="heading-dot" /> YOUR KNOWLEDGE BASE</div><h1>Your <span>documents.</span></h1><p>Upload text files and Markdown to make your knowledge searchable.</p></div>
                <button className="primary-button" onClick={() => fileInput.current?.click()} disabled={uploading || (!demoMode && !email)}><Icon name="plus" size={17} /> Add documents</button>
              </div>
              <div className="upload-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadFiles(event.dataTransfer.files); }}>
                <input ref={fileInput} type="file" multiple accept=".txt,.md,.markdown,text/plain,text/markdown" hidden onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); }} />
                <div className="upload-symbol"><Icon name="upload" size={22} /></div>
                <div><strong>Drop your files here, or <button className="inline-button" onClick={() => fileInput.current?.click()}>browse</button></strong><p>Markdown and plain text · 500 KB max per file · 40,000 characters max</p></div>
                {uploading && <span className="uploading-label">Adding…</span>}
              </div>
              {notice && <p className="notice" role="status">{notice}</p>}
              {!demoMode && !email && <div className="auth-required"><Icon name="lock" size={17} /> Sign in to upload and manage private documents.</div>}
              <div className="docs-list-header"><div><h2>Sources <span>{totalDocs}</span></h2><p>{demoMode ? "Demo sources live only in this browser session" : "Only you can access these files"}</p></div><span className="list-sort">RECENTLY ADDED <Icon name="menu" size={14} /></span></div>
              {visibleDocs.length ? <div className="doc-list">
                {visibleDocs.map((document) => <article className="doc-row" key={document.id}>
                  <div className="file-icon"><Icon name="file" size={19} /></div>
                  <div className="doc-info"><strong>{document.name}</strong><span>{document.mime_type.includes("markdown") || /\.md|\.markdown$/i.test(document.name) ? "MARKDOWN" : "PLAIN TEXT"} <i /> {formatBytes(document.byte_size)} <i /> {prettyDate(document.created_at)}</span></div>
                  {demoMode && document.id.startsWith("sample-") && <span className="sample-tag">SAMPLE</span>}
                  <button className="icon-button delete-button" aria-label={`Delete ${document.name}`} title="Delete document" onClick={() => void deleteDocument(document)}><Icon name="trash" size={16} /></button>
                </article>)}
              </div> : <div className="docs-empty"><div className="empty-icon"><Icon name="file" size={21} /></div><strong>No sources yet</strong><span>Add a text or Markdown file to get started.</span></div>}
              <div className="storage-note"><Icon name="lock" size={14} /> {demoMode ? "Files stay in this tab only; refresh to clear your session." : "Stored securely with account-scoped access controls."}</div>
            </section>
          )}
          {notice && tab === "ask" && <div className="floating-notice" role="status">{notice}</div>}
        </div>
        <footer className="app-footer"><span>KNOWLY <i>·</i> PRIVATE KNOWLEDGE, MADE USEFUL</span><span>YOUR WORKSPACE <b>↗</b></span></footer>
      </section>
    </main>
  );
}
