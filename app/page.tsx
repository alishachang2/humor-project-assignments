"use client";

import { useEffect, useState, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

type Caption = {
  id: string;
  content: string;
  image_id: string;
  imageUrl: string;
};

type UploadState = "idle" | "uploading" | "registering" | "generating" | "done" | "error";
type Tab = "rate" | "upload";

const API_BASE = "https://api.almostcrackd.ai";

const STEPS = [
  { key: "uploading", label: "Uploading image" },
  { key: "registering", label: "Registering image" },
  { key: "generating", label: "Generating captions" },
];

function ThumbUp({ filled }: { filled: boolean }) {
  const color = "var(--green)";
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbDown({ filled }: { filled: boolean }) {
  const color = "var(--status-error)";
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
      <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: "100%",
      background: "var(--bg2)",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      padding: "28px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "20px",
    }}>
      {children}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [index, setIndex] = useState(0);
  const [votedValue, setVotedValue] = useState<1 | -1 | null>(null);
  const [showGreeting, setShowGreeting] = useState(true);
  const [tab, setTab] = useState<Tab>("rate");
  const [profileOpen, setProfileOpen] = useState(false);

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatedCaptions, setGeneratedCaptions] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: "", visible: false });
  const toastTimer = useRef<any>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, visible: true });
    toastTimer.current = setTimeout(() => setToast({ msg: "", visible: false }), 2400);
  };

  const loadCaptions = async (userId?: string) => {
    const [{ data }, { data: votedData }] = await Promise.all([
      supabase
        .from("captions")
        .select("id, content, image_id, images(url)")
        .not("content", "is", null)
        .neq("content", "")
        .limit(200),
      userId
        ? supabase.from("caption_votes").select("caption_id").eq("profile_id", userId)
        : Promise.resolve({ data: [] }),
    ]);

    if (data) {
      const votedSet = new Set((votedData ?? []).map((v: any) => v.caption_id));
      const captionsWithImages = (data as any[])
        .map((caption) => ({
          id: caption.id,
          content: caption.content,
          image_id: caption.image_id,
          imageUrl: caption.images?.url ?? null,
        }))
        .filter((c) => c.imageUrl && !votedSet.has(c.id));

      const shuffled = captionsWithImages.sort(() => Math.random() - 0.5).slice(0, 10);
      setCaptions(shuffled);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/login");
      else {
        setUser(data.user);
        loadCaptions(data.user.id);
      }
    });
    const timer = setTimeout(() => setShowGreeting(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleNext = async () => {
    if (votedValue === null) return;
    const caption = captions[index];
    const { error } = await supabase.from("caption_votes").insert({
      caption_id: caption.id,
      profile_id: user.id,
      vote_value: votedValue,
      created_datetime_utc: new Date().toISOString(),
    });
    if (error) {
      if (error.code === "23505") {
        if (index + 1 >= captions.length) { await loadCaptions(user.id); setIndex(0); }
        else setIndex((i) => i + 1);
        setVotedValue(null);
        return;
      }
      alert("Failed to submit vote: " + error.message);
      return;
    }
    showToast(votedValue === 1 ? "Voted funny!" : "Voted not funny");
    if (index + 1 >= captions.length) { await loadCaptions(user.id); setIndex(0); }
    else setIndex((i) => i + 1);
    setVotedValue(null);
  };

  const getToken = async (): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  };

  const handleFileUpload = async (file: File) => {
    const supported = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic"];
    if (!supported.includes(file.type)) {
      setUploadError("Use JPEG, PNG, WebP, GIF, or HEIC.");
      setUploadState("error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);
    setUploadState("uploading");
    setUploadError(null);
    setGeneratedCaptions([]);
    setUploadedImageUrl(null);
    try {
      const token = await getToken();
      const presignRes = await fetch(`${API_BASE}/pipeline/generate-presigned-url`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      if (!presignRes.ok) throw new Error("Couldn't get upload URL");
      const { presignedUrl, cdnUrl } = await presignRes.json();
      await fetch(presignedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      setUploadedImageUrl(cdnUrl);
      setUploadState("registering");
      const registerRes = await fetch(`${API_BASE}/pipeline/upload-image-from-url`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: cdnUrl, isCommonUse: false }),
      });
      if (!registerRes.ok) throw new Error("Couldn't register image");
      const { imageId } = await registerRes.json();
      setUploadState("generating");
      const captionRes = await fetch(`${API_BASE}/pipeline/generate-captions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      if (!captionRes.ok) throw new Error("Couldn't generate captions");
      const caps = await captionRes.json();
      setGeneratedCaptions(Array.isArray(caps) ? caps : []);
      setUploadState("done");
    } catch (err: any) {
      setUploadError(err.message || "Something went wrong");
      setUploadState("error");
    }
  };

  const resetUpload = () => {
    setUploadState("idle");
    setUploadError(null);
    setUploadedImageUrl(null);
    setPreviewUrl(null);
    setGeneratedCaptions([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const currentStep = STEPS.findIndex(s => s.key === uploadState);
  const isLoading = ["uploading", "registering", "generating"].includes(uploadState);

  if (!user) return null;
  const caption = captions[index];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      <style>{`
        @keyframes fadeInOut {
          0%   { opacity: 0; transform: translateY(8px); }
          15%  { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-8px); }
        }
        @keyframes floatUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toastPop {
          0%   { opacity: 0; transform: translateX(-50%) scale(0.88) translateY(10px); }
          60%  { transform: translateX(-50%) scale(1.03) translateY(-1px); }
          100% { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
        @keyframes popIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .vote-btn { transition: all 0.15s ease; cursor: pointer; }
        .vote-btn:hover { transform: scale(1.06); }
        .vote-btn:active { transform: scale(0.93); }
        .next-btn { transition: all 0.18s ease; }
        .next-btn:hover:not(:disabled) { opacity: 0.85; }
        .tab-btn { transition: all 0.16s ease; cursor: pointer; }
        .tab-btn:hover { opacity: 0.8; }
      `}</style>

      {/* Toast */}
      {toast.visible && (
        <div style={{
          position: "fixed", bottom: "36px", left: "50%",
          background: "var(--bg2)",
          border: "1px solid var(--border)",
          borderRadius: "4px",
          padding: "10px 20px",
          fontSize: "12px", fontWeight: "600", color: "var(--text)",
          letterSpacing: "0.06em", textTransform: "uppercase",
          zIndex: 300, whiteSpace: "nowrap",
          animation: "toastPop 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ height: 3, backgroundColor: "var(--green)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 32px" }}>
          <div>
            <p style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 2 }}>The Humor Project</p>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1 }}>
              <em>Assignments.</em>
            </h1>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
              style={{ background: "none", border: "1px solid var(--border)", padding: "5px 10px", cursor: "pointer", fontSize: 11, color: "var(--text2)", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              {theme === "dark" ? "☀ Light" : theme === "light" ? "⊙ System" : "☾ Dark"}
            </button>

            <div ref={profileRef} style={{ position: "relative" }}>
              <button
                onClick={() => setProfileOpen(o => !o)}
                style={{
                  background: "var(--bg2)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "6px 12px",
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 11, color: "var(--text)", fontWeight: 500,
                  cursor: "pointer", letterSpacing: "0.04em",
                  outline: "none", transition: "opacity 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
              >
                {user.user_metadata?.avatar_url && (
                  <img src={user.user_metadata.avatar_url} alt="avatar" style={{ width: 18, height: 18, borderRadius: "50%" }} />
                )}
                {user.user_metadata?.given_name || user.user_metadata?.full_name || user.email}
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.5, transition: "transform 0.15s", transform: profileOpen ? "rotate(180deg)" : "none" }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {profileOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6, padding: 6, minWidth: 180,
                  animation: "popIn 0.15s ease forwards", zIndex: 200,
                }}>
                  <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                      {user.user_metadata?.full_name || user.user_metadata?.given_name || "Account"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>{user.email}</div>
                  </div>
                  <button
                    onClick={handleSignOut}
                    style={{
                      width: "100%", padding: "7px 10px", borderRadius: 4,
                      border: "none", background: "transparent",
                      color: "var(--text)", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", textAlign: "left",
                      display: "flex", alignItems: "center", gap: 8,
                      letterSpacing: "0.04em",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--bg2)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 24px 48px", gap: "16px",
      }}>

        {showGreeting ? (
          <div style={{
            width: "100%", maxWidth: "480px",
            background: "var(--bg2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "48px 40px", textAlign: "center",
            animation: "fadeInOut 2s ease forwards",
          }}>
            <p style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 12 }}>Welcome back</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, fontWeight: 400, color: "var(--text)", margin: "0 0 12px 0", letterSpacing: "-0.02em" }}>
              <em>Hey, {user.user_metadata?.given_name || "there"}.</em>
            </h2>
            <p style={{ fontSize: 14, color: "var(--text2)", margin: 0 }}>
              Signed in as <strong style={{ color: "var(--text)", fontWeight: 600 }}>{user.user_metadata?.email || user.email}</strong>
            </p>
          </div>

        ) : (
          <div style={{ width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "16px", animation: "floatUp 0.4s ease forwards" }}>

            {/* Tab Toggle */}
            <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
              {[
                { key: "rate", label: "Rate Captions" },
                { key: "upload", label: "Upload Image" },
              ].map((tb, i) => {
                const active = tab === tb.key;
                return (
                  <button
                    key={tb.key}
                    className="tab-btn"
                    onClick={() => { setTab(tb.key as Tab); if (tb.key === "rate") resetUpload(); }}
                    style={{
                      flex: 1, padding: "9px 16px",
                      border: "none",
                      borderLeft: i > 0 ? "1px solid var(--border)" : "none",
                      background: active ? "var(--accent)" : "var(--bg)",
                      color: active ? "var(--accent-fg)" : "var(--text2)",
                      fontSize: 11, fontWeight: active ? 600 : 400,
                      letterSpacing: "0.06em", textTransform: "uppercase" as const,
                    }}
                  >
                    {tb.label}
                  </button>
                );
              })}
            </div>

            {/* ── RATE TAB ── */}
            {tab === "rate" && (
              captions.length === 0 ? (
                <Card>
                  <p style={{ fontSize: 14, color: "var(--text2)", margin: 0 }}>No captions found.</p>
                </Card>
              ) : (
                <Card>
                  {/* Progress */}
                  <div style={{ width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text2)", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      <span>Rate this caption</span>
                      <span>{index + 1} / {captions.length}</span>
                    </div>
                    <div style={{ width: "100%", height: 3, background: "var(--border)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${((index + (votedValue !== null ? 1 : 0)) / captions.length) * 100}%`,
                        background: "var(--accent)",
                        borderRadius: 999,
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                  </div>

                  <div style={{ width: "100%", height: 1, background: "var(--border)" }} />

                  {/* Image */}
                  <div style={{ width: "100%", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
                    <img src={caption.imageUrl} alt={caption.content} style={{
                      width: "100%", maxHeight: "230px", objectFit: "contain", display: "block",
                      background: "var(--bg2)",
                    }} />
                  </div>

                  {/* Caption text */}
                  <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", lineHeight: 1.5, margin: 0, textAlign: "center" }}>
                    {caption?.content}
                  </p>

                  {/* Vote buttons */}
                  <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    <button
                      className="vote-btn"
                      onClick={() => setVotedValue(1)}
                      style={{
                        width: 56, height: 56, borderRadius: "50%",
                        border: `1.5px solid ${votedValue === 1 ? "var(--green)" : "var(--border)"}`,
                        background: votedValue === 1 ? "rgba(189,224,129,0.15)" : "var(--bg)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <ThumbUp filled={votedValue === 1} />
                    </button>

                    <button
                      className="vote-btn"
                      onClick={() => setVotedValue(-1)}
                      style={{
                        width: 56, height: 56, borderRadius: "50%",
                        border: `1.5px solid ${votedValue === -1 ? "var(--status-error)" : "var(--border)"}`,
                        background: votedValue === -1 ? "rgba(192,57,43,0.08)" : "var(--bg)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <ThumbDown filled={votedValue === -1} />
                    </button>
                  </div>

                  {/* Next button */}
                  <button
                    className="next-btn"
                    onClick={handleNext}
                    disabled={votedValue === null}
                    style={{
                      width: "100%", padding: "11px",
                      borderRadius: 4,
                      border: "1px solid var(--accent)",
                      background: votedValue !== null ? "var(--accent)" : "transparent",
                      color: votedValue !== null ? "var(--accent-fg)" : "var(--text2)",
                      fontSize: 11, fontWeight: 600,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      cursor: votedValue !== null ? "pointer" : "not-allowed",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Next →
                  </button>
                </Card>
              )
            )}

            {/* ── UPLOAD TAB ── */}
            {tab === "upload" && (
              <Card>
                <div style={{ textAlign: "center", width: "100%" }}>
                  <p style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 6 }}>Upload</p>
                  <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, fontWeight: 400, color: "var(--text)", margin: "0 0 4px 0", letterSpacing: "-0.02em" }}>
                    <em>Generate Captions.</em>
                  </h2>
                </div>

                {/* Idle / Error */}
                {(uploadState === "idle" || uploadState === "error") && (
                  <>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileUpload(f); }}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: "100%",
                        border: `1px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: 6, padding: "36px 24px",
                        textAlign: "center", cursor: "pointer",
                        background: dragOver ? "var(--bg2)" : "var(--bg)",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}>
                        <svg width="28" height="28" fill="none" stroke="var(--text2)" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                      <p style={{ color: "var(--text)", fontWeight: 600, fontSize: 13, margin: "0 0 4px 0" }}>Drop your image here</p>
                      <p style={{ color: "var(--text2)", fontSize: 11, margin: 0, letterSpacing: "0.04em" }}>or click to browse · JPEG, PNG, WebP, GIF, HEIC</p>
                    </div>
                    <input ref={fileInputRef} type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                      style={{ display: "none" }} />
                    {uploadState === "error" && uploadError && (
                      <div style={{
                        width: "100%",
                        background: "transparent", border: "1px solid var(--status-error)",
                        borderRadius: 4, padding: "10px 14px",
                        color: "var(--status-error)", fontSize: 12,
                      }}>
                        {uploadError}
                      </div>
                    )}
                  </>
                )}

                {/* Loading */}
                {isLoading && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
                    {previewUrl && (
                      <div style={{ position: "relative", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
                        <img src={previewUrl} alt="Preview" style={{ width: "100%", maxHeight: 160, objectFit: "contain", display: "block", filter: "brightness(0.6) saturate(0.7)" }} />
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: 32, height: 32, border: "2px solid rgba(255,255,255,0.2)", borderTop: "2px solid rgba(255,255,255,0.9)", borderRadius: "50%", animation: "spin 0.75s linear infinite" }} />
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {STEPS.map((step, i) => {
                        const done = i < currentStep;
                        const active = i === currentStep;
                        return (
                          <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                              background: done ? "var(--accent)" : "var(--bg2)",
                              border: `1.5px solid ${done ? "var(--accent)" : active ? "var(--text2)" : "var(--border)"}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "all 0.3s ease",
                            }}>
                              {done ? (
                                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5l2 2.5L8 3" stroke="var(--accent-fg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : active ? (
                                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--text2)", animation: "blink 1.2s ease infinite" }} />
                              ) : (
                                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--border)" }} />
                              )}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: done ? "var(--text)" : active ? "var(--text)" : "var(--text2)", transition: "color 0.3s ease" }}>
                              {step.label}{active ? "…" : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Done */}
                {uploadState === "done" && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
                    {(uploadedImageUrl || previewUrl) && (
                      <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
                        <img src={uploadedImageUrl || previewUrl!} alt="Uploaded" style={{ width: "100%", maxHeight: 180, objectFit: "contain", display: "block" }} />
                      </div>
                    )}
                    <div>
                      <p style={{ fontSize: 9, fontWeight: 600, color: "var(--text2)", margin: "0 0 10px 0", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                        Generated Captions · {generatedCaptions.length}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {generatedCaptions.length === 0 ? (
                          <p style={{ color: "var(--text2)", fontSize: 13 }}>No captions returned.</p>
                        ) : generatedCaptions.map((cap, i) => (
                          <div key={cap.id || i} style={{
                            background: "var(--bg2)", border: "1px solid var(--border)",
                            borderRadius: 4, padding: "10px 12px",
                            display: "flex", gap: 10, alignItems: "flex-start",
                          }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text2)", minWidth: 16, marginTop: 2 }}>{i + 1}.</span>
                            <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>
                              {cap.content || cap.caption || JSON.stringify(cap)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={resetUpload}
                      style={{
                        width: "100%", padding: "11px",
                        borderRadius: 4, border: "1px solid var(--accent)",
                        background: "var(--accent)", color: "var(--accent-fg)",
                        fontSize: 11, fontWeight: 600,
                        letterSpacing: "0.08em", textTransform: "uppercase",
                        cursor: "pointer", transition: "opacity 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                    >
                      Upload Another
                    </button>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
