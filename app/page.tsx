"use client";

import { useEffect, useState, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { theme } from "@/lib/theme";

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

const t = {
  cardBg: "rgba(255, 250, 240, 0.82)",
  cardBorder: "rgba(180, 90, 40, 0.18)",
  cardShadow: "rgba(180, 90, 40, 0.15)",
  accent: "#c8522a",
  accentLight: "rgba(200, 82, 42, 0.12)",
  accentMid: "rgba(200, 82, 42, 0.22)",
  yes: "#7daa5a",
  yesLight: "rgba(125, 170, 90, 0.15)",
  noLight: "rgba(200, 82, 42, 0.1)",
  text: "#2e1a0e",
  textSoft: "rgba(46, 26, 14, 0.55)",
  tabActiveBg: "rgba(200, 82, 42, 0.14)",
  divider: "rgba(180, 90, 40, 0.14)",
  inputBg: "rgba(255, 248, 235, 0.7)",
  stripAlt: "rgba(245, 200, 66, 0.18)",
};

function ThumbUp({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbDown({ filled, color }: { filled: boolean; color: string }) {
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
      background: t.cardBg,
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      borderRadius: "28px",
      border: `2px solid ${t.cardBorder}`,
      padding: "30px 34px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "20px",
      boxShadow: `0 8px 32px ${t.cardShadow}, 0 2px 8px rgba(0,0,0,0.06)`,
    }}>
      {children}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
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

  const loadCaptions = async () => {
    const { count } = await supabase.from("captions").select("*", { count: "exact", head: true });
    const total = count ?? 0;
    const randomOffset = Math.floor(Math.random() * Math.max(0, total - 10));
    const { data } = await supabase.from("captions").select("id, content, image_id").range(randomOffset, randomOffset + 9);
    if (data) {
      const captionsWithImages = await Promise.all(
        data.map(async (caption) => {
          const { data: imageData } = await supabase.from("images").select("url").eq("id", caption.image_id).single();
          return { ...caption, imageUrl: imageData?.url ?? null };
        })
      );
      setCaptions(captionsWithImages.filter((c) => c.imageUrl));
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/login");
      else setUser(data.user);
    });
    loadCaptions();
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
    if (error) { alert("Failed to submit vote: " + error.message); return; }
    showToast(votedValue === 1 ? "Voted funny!" : "Voted not funny");
    if (index + 1 >= captions.length) { await loadCaptions(); setIndex(0); }
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
    <div style={{
      minHeight: "100vh",
      background: theme.background,
      fontFamily: "Inter, sans-serif",
      display: "flex",
      flexDirection: "column",
      position: "relative",
    }}>
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
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.15; }
        }
        @keyframes popIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .vote-btn { transition: all 0.15s ease; cursor: pointer; }
        .vote-btn:hover { transform: scale(1.06); }
        .vote-btn:active { transform: scale(0.93); }

        .next-btn { transition: all 0.18s ease; }
        .next-btn:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.06); }

        .tab-btn { transition: all 0.16s ease; cursor: pointer; }
        .tab-btn:hover { opacity: 0.85; }
      `}</style>

      {/* Toast */}
      {toast.visible && (
        <div style={{
          position: "fixed", bottom: "36px", left: "50%",
          background: theme.card,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: theme.border,
          borderRadius: "999px",
          padding: "10px 26px",
          fontSize: "14px", fontWeight: "600", color: theme.textPrimary,
          zIndex: 300, whiteSpace: "nowrap",
          boxShadow: `0 6px 24px rgba(180,90,40,0.2)`,
          animation: "toastPop 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Original Navbar ── */}
      <div style={{
        position: "fixed",
        top: "20px",
        left: "0",
        right: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: "24px",
            height: "24px",
            background: theme.icon,
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="14" height="14" fill="none" stroke={theme.iconStroke} strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <circle cx="9" cy="9" r="1.5" fill={theme.iconStroke} stroke="none" />
              <circle cx="15" cy="9" r="1.5" fill={theme.iconStroke} stroke="none" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 15c1.5 1.5 3 2 4 2s2.5-.5 4-2" />
            </svg>
          </div>
          <span style={{ color: theme.textPrimary, fontWeight: "600", fontSize: "14px" }}>Humor Project</span>
        </div>

        {/* Right side: profile pill (clickable) */}
        <div ref={profileRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Clickable profile pill */}
          <button
            onClick={() => setProfileOpen(o => !o)}
            style={{
              background: theme.card,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: profileOpen ? `1px solid rgba(180,90,40,0.4)` : theme.border,
              borderRadius: "999px",
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "14px",
              color: theme.textPrimary,
              fontWeight: "500",
              cursor: "pointer",
              fontFamily: "Inter, sans-serif",
              transition: "all 0.15s ease",
              outline: "none",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            {user.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt="avatar"
                style={{ width: "22px", height: "22px", borderRadius: "50%" }}
              />
            )}
            {user.user_metadata?.given_name || user.user_metadata?.full_name || user.email}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.5, transition: "transform 0.15s ease", transform: profileOpen ? "rotate(180deg)" : "none" }}>
              <path d="M2 3.5L5 6.5L8 3.5" stroke={theme.textPrimary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Profile dropdown */}
          {profileOpen && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              background: "rgba(255, 250, 240, 0.97)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: theme.border,
              borderRadius: "16px",
              padding: "8px",
              minWidth: "190px",
              boxShadow: `0 12px 36px rgba(180,90,40,0.15)`,
              animation: "popIn 0.18s cubic-bezier(0.34,1.56,0.64,1) forwards",
              zIndex: 200,
            }}>
              {/* User info */}
              <div style={{
                padding: "10px 12px 11px",
                borderBottom: `1px solid rgba(180,90,40,0.1)`,
                marginBottom: "6px",
              }}>
                <div style={{ fontSize: "13px", fontWeight: "700", color: theme.textPrimary }}>
                  {user.user_metadata?.full_name || user.user_metadata?.given_name || "Account"}
                </div>
                <div style={{ fontSize: "11px", color: theme.textSecondary, marginTop: "2px" }}>
                  {user.email}
                </div>
              </div>

              {/* Sign out */}
              <button
                onClick={handleSignOut}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "transparent",
                  color: theme.textPrimary,
                  fontSize: "13px", fontWeight: "600",
                  cursor: "pointer",
                  fontFamily: "Inter, sans-serif",
                  textAlign: "left",
                  display: "flex", alignItems: "center", gap: "8px",
                  transition: "background 0.12s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,82,42,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
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

      {/* ── Main ── */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "80px 24px 48px",
        minHeight: "100vh", boxSizing: "border-box", gap: "16px",
        position: "relative", zIndex: 1,
      }}>

        {showGreeting ? (
          <div style={{
            width: "100%", maxWidth: "500px",
            background: theme.card,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: "24px",
            border: theme.border,
            padding: "52px 48px", textAlign: "center",
            animation: "fadeInOut 2s ease forwards",
          }}>
            <h1 style={{
              fontSize: "36px", fontWeight: "700", color: theme.textPrimary,
              margin: "0 0 12px 0", letterSpacing: "-0.5px",
            }}>
              Hey, {user.user_metadata?.given_name || "there"} 👋
            </h1>
            <p style={{ fontSize: "16px", color: theme.textSecondary, margin: "0" }}>
              You're signed in as <strong style={{ color: theme.textPrimary }}>{user.user_metadata?.email || user.email}</strong>
            </p>
          </div>

        ) : (
          <div style={{
            width: "100%", maxWidth: "500px",
            display: "flex", flexDirection: "column", gap: "16px",
            animation: "floatUp 0.4s ease forwards",
          }}>

            {/* Tab Toggle */}
            <div style={{
              display: "flex", gap: "6px",
              background: theme.card,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderRadius: "20px",
              border: theme.border,
              padding: "5px",
            }}>
              {[
                { key: "rate", label: "Rate Captions" },
                { key: "upload", label: "Upload Image" },
              ].map((tb) => {
                const active = tab === tb.key;
                return (
                  <button
                    key={tb.key}
                    className="tab-btn"
                    onClick={() => { setTab(tb.key as Tab); if (tb.key === "rate") resetUpload(); }}
                    style={{
                      flex: 1, padding: "10px 16px",
                      borderRadius: "15px",
                      border: "none",
                      background: active ? t.tabActiveBg : "transparent",
                      color: active ? theme.textPrimary : theme.textSecondary,
                      fontSize: "14px", fontWeight: active ? "600" : "400",
                      fontFamily: "Inter, sans-serif",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
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
                  <p style={{ fontSize: "16px", color: theme.textSecondary, fontWeight: "500", margin: 0 }}>
                    No captions found.
                  </p>
                </Card>
              ) : (
                <Card>
                  {/* Progress */}
                  <div style={{ width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: theme.textSecondary, marginBottom: "8px" }}>
                      <span>Rate this caption</span>
                      <span>{index + 1} / {captions.length}</span>
                    </div>
                    <div style={{ width: "100%", height: "4px", background: "rgba(180,90,40,0.12)", borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${((index + (votedValue !== null ? 1 : 0)) / captions.length) * 100}%`,
                        background: `linear-gradient(90deg, ${t.accent}, #f0834a)`,
                        borderRadius: "999px",
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                  </div>

                  <div style={{ width: "100%", height: "1px", background: t.divider }} />

                  {/* Image */}
                  <div style={{ width: "100%", borderRadius: "14px", overflow: "hidden", border: `1px solid ${t.cardBorder}` }}>
                    <img src={caption.imageUrl} alt={caption.content} style={{
                      width: "100%", maxHeight: "230px", objectFit: "contain", display: "block",
                      background: "rgba(255,248,235,0.5)",
                    }} />
                  </div>

                  {/* Caption text */}
                  <p style={{
                    fontSize: "16px", fontWeight: "600", color: theme.textPrimary,
                    lineHeight: "1.4", margin: "0", textAlign: "center",
                  }}>
                    {caption?.content}
                  </p>

                  {/* Vote buttons — SVG icons only, no labels */}
                  <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                    {/* Thumbs up */}
                    <button
                      className="vote-btn"
                      onClick={() => setVotedValue(1)}
                      style={{
                        width: "56px", height: "56px",
                        borderRadius: "50%",
                        border: `1.5px solid ${votedValue === 1 ? t.yes : t.yes + "50"}`,
                        background: votedValue === 1 ? t.yesLight : "rgba(255,248,235,0.4)",
                        boxShadow: votedValue === 1 ? `0 0 0 3px ${t.yes}25, inset 0 1px 4px rgba(0,0,0,0.06)` : "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <ThumbUp filled={votedValue === 1} color={t.yes} />
                    </button>

                    {/* Thumbs down */}
                    <button
                      className="vote-btn"
                      onClick={() => setVotedValue(-1)}
                      style={{
                        width: "56px", height: "56px",
                        borderRadius: "50%",
                        border: `1.5px solid ${votedValue === -1 ? t.accent : t.accent + "50"}`,
                        background: votedValue === -1 ? t.noLight : "rgba(255,248,235,0.4)",
                        boxShadow: votedValue === -1 ? `0 0 0 3px ${t.accent}25, inset 0 1px 4px rgba(0,0,0,0.06)` : "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <ThumbDown filled={votedValue === -1} color={t.accent} />
                    </button>
                  </div>

                  {/* Next button */}
                  <button
                    className="next-btn"
                    onClick={handleNext}
                    disabled={votedValue === null}
                    style={{
                      width: "100%", padding: "12px",
                      borderRadius: "14px",
                      border: "none",
                      background: votedValue !== null
                        ? `linear-gradient(135deg, ${t.accent}, #f0834a)`
                        : "rgba(180,90,40,0.08)",
                      boxShadow: votedValue === null
                        ? `inset 0 2px 6px rgba(0,0,0,0.08)`
                        : `0 4px 16px rgba(200,82,42,0.3)`,
                      color: votedValue !== null ? "#fff8f0" : theme.textSecondary,
                      fontSize: "15px", fontWeight: "600",
                      cursor: votedValue !== null ? "pointer" : "not-allowed",
                      fontFamily: "Inter, sans-serif",
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
                  <h2 style={{ fontSize: "18px", fontWeight: "700", color: theme.textPrimary, margin: "0 0 4px 0" }}>
                    Generate Captions
                  </h2>
                  <p style={{ fontSize: "13px", color: theme.textSecondary, margin: "0" }}>
                    Upload an image to generate AI captions
                  </p>
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
                        border: `1.5px dashed ${dragOver ? t.accent : t.cardBorder}`,
                        borderRadius: "16px", padding: "36px 24px",
                        textAlign: "center", cursor: "pointer",
                        background: dragOver ? t.accentLight : t.inputBg,
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ marginBottom: "10px", display: "flex", justifyContent: "center" }}>
                        <svg width="32" height="32" fill="none" stroke={theme.textSecondary} strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                      <p style={{ color: theme.textPrimary, fontWeight: "600", fontSize: "15px", margin: "0 0 4px 0" }}>
                        Drop your image here
                      </p>
                      <p style={{ color: theme.textSecondary, fontSize: "12px", margin: "0" }}>
                        or click to browse · JPEG, PNG, WebP, GIF, HEIC
                      </p>
                    </div>
                    <input ref={fileInputRef} type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                      style={{ display: "none" }} />
                    {uploadState === "error" && uploadError && (
                      <div style={{
                        width: "100%",
                        background: "rgba(200,82,42,0.08)", border: `1px solid rgba(200,82,42,0.25)`,
                        borderRadius: "12px", padding: "12px 16px",
                        color: theme.textPrimary, fontSize: "14px", fontWeight: "500",
                      }}>
                        {uploadError}
                      </div>
                    )}
                  </>
                )}

                {/* Loading */}
                {isLoading && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
                    {previewUrl && (
                      <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", border: `1px solid ${t.cardBorder}` }}>
                        <img src={previewUrl} alt="Preview" style={{
                          width: "100%", maxHeight: "160px", objectFit: "cover",
                          display: "block", filter: "brightness(0.6) saturate(0.7)",
                        }} />
                        <div style={{
                          position: "absolute", inset: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <div style={{
                            width: "36px", height: "36px",
                            border: "2.5px solid rgba(255,255,255,0.2)",
                            borderTop: "2.5px solid rgba(255,255,255,0.9)",
                            borderRadius: "50%",
                            animation: "spin 0.75s linear infinite",
                          }} />
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {STEPS.map((step, i) => {
                        const done = i < currentStep;
                        const active = i === currentStep;
                        return (
                          <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{
                              width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0,
                              background: done ? t.accent : active ? t.accentLight : "rgba(180,90,40,0.08)",
                              border: `1.5px solid ${done ? t.accent : active ? t.accent + "60" : t.cardBorder}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "all 0.3s ease",
                            }}>
                              {done ? (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5l2 2.5L8 3" stroke="#fff8f0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : active ? (
                                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.accent, animation: "blink 1.2s ease infinite" }} />
                              ) : (
                                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: t.cardBorder }} />
                              )}
                            </div>
                            <span style={{
                              fontSize: "14px", fontWeight: active ? "600" : "400",
                              color: done ? t.accent : active ? theme.textPrimary : theme.textSecondary,
                              transition: "color 0.3s ease",
                            }}>
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
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "14px" }}>
                    {(uploadedImageUrl || previewUrl) && (
                      <div style={{ borderRadius: "12px", overflow: "hidden", border: `1px solid ${t.cardBorder}` }}>
                        <img src={uploadedImageUrl || previewUrl!} alt="Uploaded" style={{
                          width: "100%", maxHeight: "180px", objectFit: "cover", display: "block",
                        }} />
                      </div>
                    )}
                    <div>
                      <p style={{
                        fontSize: "11px", fontWeight: "600", color: theme.textSecondary,
                        margin: "0 0 10px 0", textTransform: "uppercase", letterSpacing: "0.08em",
                      }}>
                        Generated Captions · {generatedCaptions.length}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {generatedCaptions.length === 0 ? (
                          <p style={{ color: theme.textSecondary, fontSize: "14px" }}>No captions returned.</p>
                        ) : generatedCaptions.map((cap, i) => (
                          <div key={cap.id || i} style={{
                            background: i % 2 === 0 ? t.inputBg : t.stripAlt,
                            border: `1px solid ${t.cardBorder}`,
                            borderRadius: "12px", padding: "11px 14px",
                            display: "flex", gap: "10px", alignItems: "flex-start",
                          }}>
                            <span style={{ fontSize: "11px", fontWeight: "700", color: theme.textSecondary, minWidth: "18px", marginTop: "2px" }}>
                              {i + 1}.
                            </span>
                            <span style={{ fontSize: "14px", color: theme.textPrimary, lineHeight: "1.5" }}>
                              {cap.content || cap.caption || JSON.stringify(cap)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={resetUpload}
                      style={{
                        width: "100%", padding: "12px",
                        borderRadius: "14px", border: "none",
                        background: `linear-gradient(135deg, ${t.accent}, #f0834a)`,
                        color: "#fff8f0",
                        fontSize: "15px", fontWeight: "600",
                        cursor: "pointer", fontFamily: "Inter, sans-serif",
                        boxShadow: `0 4px 16px rgba(200,82,42,0.3)`,
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.filter = "brightness(1.06)"; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.filter = ""; }}
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