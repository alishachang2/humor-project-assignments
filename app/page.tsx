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

// Derived from theme — warm orange/coral palette
const t = {
  cardBg: "rgba(255, 250, 240, 0.82)",
  cardBorder: "rgba(180, 90, 40, 0.18)",
  cardShadow: "rgba(180, 90, 40, 0.15)",
  accent: "#c8522a",         // burnt orange — primary action
  accentLight: "rgba(200, 82, 42, 0.12)",
  accentMid: "rgba(200, 82, 42, 0.22)",
  accentHover: "#b04020",
  yes: "#7daa5a",            // warm olive green for "funny"
  yesLight: "rgba(125, 170, 90, 0.15)",
  no: "#c8522a",             // burnt orange for "not funny"
  noLight: "rgba(200, 82, 42, 0.1)",
  text: "#2e1a0e",
  textSoft: "rgba(46, 26, 14, 0.55)",
  tabActiveBg: "rgba(200, 82, 42, 0.14)",
  divider: "rgba(180, 90, 40, 0.14)",
  inputBg: "rgba(255, 248, 235, 0.7)",
  stripAlt: "rgba(245, 200, 66, 0.18)",  // pale yellow tint for alt caption rows
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
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
      ...style,
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
          return { ...caption, imageUrl: imageData?.url };
        })
      );
      setCaptions(captionsWithImages);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/login");
      else setUser(data.user);
    });
    loadCaptions();
    const timer = setTimeout(() => setShowGreeting(false), 2200);
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
    showToast(votedValue === 1 ? "🌸 Voted funny!" : "🍂 Voted not funny");
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
      setUploadError("Use JPEG, PNG, WebP, GIF, or HEIC please ✿");
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
      fontFamily: "'Nunito', 'Trebuchet MS', sans-serif",
      display: "flex",
      flexDirection: "column",
      position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Caveat:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }

        @keyframes floatUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes greetFade {
          0%   { opacity: 0; transform: translateY(14px) scale(0.97); }
          18%  { opacity: 1; transform: translateY(0) scale(1); }
          78%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-10px); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toastPop {
          0%   { opacity: 0; transform: translateX(-50%) scale(0.85) translateY(10px); }
          65%  { transform: translateX(-50%) scale(1.04) translateY(-2px); }
          100% { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
        }
        @keyframes petalRock {
          0%, 100% { transform: rotate(-4deg); }
          50%       { transform: rotate(4deg); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.15; }
        }
        @keyframes popIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.93); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .vote-btn { transition: all 0.15s ease; cursor: pointer; }
        .vote-btn:hover { transform: scale(1.06) rotate(-2deg); }
        .vote-btn:active { transform: scale(0.93); }

        .next-btn { transition: all 0.18s ease; }
        .next-btn:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.06); }

        .tab-btn { transition: all 0.16s ease; cursor: pointer; }
        .tab-btn:hover { filter: brightness(0.96); }

        .pill-btn { transition: all 0.16s ease; cursor: pointer; }
        .pill-btn:hover { filter: brightness(0.94); }
      `}</style>

      {/* Toast */}
      {toast.visible && (
        <div style={{
          position: "fixed", bottom: "36px", left: "50%",
          background: "rgba(255, 250, 240, 0.96)",
          backdropFilter: "blur(12px)",
          border: `1.5px solid ${t.cardBorder}`,
          borderRadius: "999px",
          padding: "10px 26px",
          fontSize: "14px", fontWeight: "800", color: t.text,
          zIndex: 300, whiteSpace: "nowrap",
          boxShadow: `0 6px 24px ${t.cardShadow}`,
          animation: "toastPop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards",
          fontFamily: "'Nunito', sans-serif",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Navbar ── */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px",
        background: "rgba(255, 248, 235, 0.55)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: theme.navBorder,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "36px", height: "36px",
            background: t.accentLight,
            borderRadius: "50%",
            border: `1.5px solid ${t.cardBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "18px",
            animation: "petalRock 3s ease infinite",
          }}>
            🌸
          </div>
          <span style={{
            fontFamily: "'Caveat', cursive",
            fontSize: "23px", fontWeight: "700", color: t.text,
          }}>
            Humor Project
          </span>
        </div>

        {/* Profile pill + popup */}
        <div ref={profileRef} style={{ position: "relative" }}>
          <button
            className="pill-btn"
            onClick={() => setProfileOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              background: profileOpen ? t.accentLight : "rgba(255, 248, 235, 0.65)",
              backdropFilter: "blur(8px)",
              border: `1.5px solid ${profileOpen ? t.accent : t.cardBorder}`,
              borderRadius: "999px",
              padding: "6px 14px 6px 7px",
              fontFamily: "'Nunito', sans-serif",
              fontSize: "14px", fontWeight: "700", color: t.text,
            }}
          >
            {user.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="avatar"
                style={{ width: "26px", height: "26px", borderRadius: "50%", border: `1.5px solid ${t.cardBorder}` }} />
            ) : (
              <div style={{
                width: "26px", height: "26px", borderRadius: "50%",
                background: t.accentLight, border: `1.5px solid ${t.cardBorder}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px",
              }}>🌿</div>
            )}
            {user.user_metadata?.given_name || user.user_metadata?.full_name?.split(" ")[0] || "you"}
            <span style={{ fontSize: "9px", color: t.textSoft, marginLeft: "2px" }}>
              {profileOpen ? "▲" : "▼"}
            </span>
          </button>

          {/* Dropdown popup */}
          {profileOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 10px)", right: 0,
              background: "rgba(255, 250, 240, 0.97)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: `1.5px solid ${t.cardBorder}`,
              borderRadius: "20px",
              padding: "8px",
              minWidth: "196px",
              boxShadow: `0 12px 36px ${t.cardShadow}`,
              animation: "popIn 0.2s cubic-bezier(0.34,1.56,0.64,1) forwards",
              zIndex: 200,
            }}>
              {/* User info */}
              <div style={{
                padding: "10px 14px 12px",
                borderBottom: `1px dashed ${t.divider}`,
                marginBottom: "6px",
              }}>
                <div style={{ fontSize: "13px", fontWeight: "800", color: t.text }}>
                  {user.user_metadata?.full_name || user.user_metadata?.given_name || "Friend"}
                </div>
                <div style={{ fontSize: "11px", color: t.textSoft, marginTop: "3px", fontWeight: "600" }}>
                  {user.email}
                </div>
              </div>

              {/* Sign out */}
              <button
                onClick={handleSignOut}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "13px",
                  border: `1.5px solid rgba(180,90,40,0.25)`,
                  background: t.accentLight,
                  color: t.text,
                  fontSize: "14px", fontWeight: "800",
                  cursor: "pointer",
                  fontFamily: "'Nunito', sans-serif",
                  textAlign: "left",
                  display: "flex", alignItems: "center", gap: "8px",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = t.accentMid; }}
                onMouseLeave={e => { e.currentTarget.style.background = t.accentLight; }}
              >
                <span>👋</span> Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main ── */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "92px 24px 48px",
        minHeight: "100vh", boxSizing: "border-box", gap: "16px",
        position: "relative", zIndex: 1,
      }}>

        {showGreeting ? (
          <div style={{
            width: "100%", maxWidth: "460px",
            background: t.cardBg,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: "28px",
            border: `2px solid ${t.cardBorder}`,
            padding: "52px 44px", textAlign: "center",
            boxShadow: `0 10px 40px ${t.cardShadow}`,
            animation: "greetFade 2.2s ease forwards",
          }}>
            <div style={{ fontSize: "52px", marginBottom: "16px", display: "inline-block", animation: "petalRock 2s ease infinite" }}>🌸</div>
            <h1 style={{
              fontFamily: "'Caveat', cursive",
              fontSize: "42px", fontWeight: "700", color: t.text, margin: "0 0 10px 0",
            }}>
              Hi, {user.user_metadata?.given_name || "there"}!
            </h1>
            <p style={{ fontSize: "15px", color: t.textSoft, margin: "0", fontWeight: "600" }}>
              Signed in as <span style={{ color: t.text, fontWeight: "800" }}>{user.email}</span>
            </p>
          </div>

        ) : (
          <div style={{
            width: "100%", maxWidth: "500px",
            display: "flex", flexDirection: "column", gap: "16px",
            animation: "floatUp 0.4s ease forwards",
          }}>

            {/* ── Tab Toggle ── */}
            <div style={{
              display: "flex", gap: "6px",
              background: "rgba(255,248,235,0.5)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderRadius: "20px",
              border: `1.5px solid ${t.cardBorder}`,
              padding: "5px",
              boxShadow: `0 4px 16px ${t.cardShadow}`,
            }}>
              {[
                { key: "rate", label: "Rate Captions", emoji: "⭐" },
                { key: "upload", label: "Upload Image", emoji: "🌿" },
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
                      border: active ? `1.5px solid ${t.cardBorder}` : "1.5px solid transparent",
                      background: active ? t.tabActiveBg : "transparent",
                      color: active ? t.text : t.textSoft,
                      fontSize: "14px", fontWeight: active ? "800" : "600",
                      fontFamily: "'Nunito', sans-serif",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                    }}
                  >
                    <span>{tb.emoji}</span> {tb.label}
                  </button>
                );
              })}
            </div>

            {/* ── RATE TAB ── */}
            {tab === "rate" && (
              captions.length === 0 ? (
                <Card>
                  <p style={{ fontSize: "16px", color: t.textSoft, fontWeight: "700", margin: 0 }}>
                    No captions found yet 🍂
                  </p>
                </Card>
              ) : (
                <Card>
                  {/* Progress */}
                  <div style={{ width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: t.textSoft, fontWeight: "700", marginBottom: "8px" }}>
                      <span>rate this one ✦</span>
                      <span>{index + 1} of {captions.length}</span>
                    </div>
                    <div style={{ width: "100%", height: "6px", background: t.divider, borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${((index + (votedValue !== null ? 1 : 0)) / captions.length) * 100}%`,
                        background: `linear-gradient(90deg, ${t.accent}, #f0834a)`,
                        borderRadius: "999px",
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                  </div>

                  <div style={{ width: "100%", height: 0, borderTop: `1px dashed ${t.divider}` }} />

                  {/* Image */}
                  <div style={{
                    width: "100%", borderRadius: "16px", overflow: "hidden",
                    border: `1.5px solid ${t.cardBorder}`,
                  }}>
                    <img src={caption.imageUrl} alt={caption.content} style={{
                      width: "100%", maxHeight: "220px", objectFit: "contain", display: "block",
                      background: "rgba(255,248,235,0.6)",
                    }} />
                  </div>

                  {/* Caption text */}
                  <p style={{
                    fontFamily: "'Caveat', cursive",
                    fontSize: "22px", fontWeight: "600", color: t.text,
                    lineHeight: "1.4", margin: "0", textAlign: "center",
                  }}>
                    {caption?.content}
                  </p>

                  {/* Vote buttons */}
                  <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                    {[
                      { val: 1 as const, emoji: "👍", label: "Funny!", color: t.yes, lightColor: t.yesLight },
                      { val: -1 as const, emoji: "👎", label: "Not funny", color: t.accent, lightColor: t.noLight },
                    ].map(({ val, emoji, label, color, lightColor }) => {
                      const selected = votedValue === val;
                      return (
                        <button
                          key={val}
                          className="vote-btn"
                          onClick={() => setVotedValue(val)}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
                            padding: "14px 28px",
                            borderRadius: "18px",
                            border: `1.5px solid ${selected ? color : color + "50"}`,
                            background: selected ? lightColor + "cc" : "rgba(255,248,235,0.5)",
                            boxShadow: selected
                              ? `inset 0 2px 8px rgba(0,0,0,0.1), 0 0 0 3px ${color}25`
                              : "none",
                            fontFamily: "'Nunito', sans-serif",
                          }}
                        >
                          <span style={{ fontSize: "30px", lineHeight: 1 }}>{emoji}</span>
                          <span style={{
                            fontSize: "11px", fontWeight: "800",
                            color: selected ? color : t.textSoft,
                            textTransform: "uppercase", letterSpacing: "0.06em",
                            transition: "color 0.15s ease",
                          }}>{label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Next button */}
                  <button
                    className="next-btn"
                    onClick={handleNext}
                    disabled={votedValue === null}
                    style={{
                      width: "100%", padding: "13px",
                      borderRadius: "16px",
                      border: "none",
                      background: votedValue !== null
                        ? `linear-gradient(135deg, ${t.accent}, #f0834a)`
                        : "rgba(180,90,40,0.1)",
                      boxShadow: votedValue === null
                        ? `inset 0 2px 6px rgba(0,0,0,0.1)`
                        : `0 4px 16px rgba(200,82,42,0.35)`,
                      color: votedValue !== null ? "#fff8f0" : t.textSoft,
                      fontSize: "15px", fontWeight: "800",
                      cursor: votedValue !== null ? "pointer" : "not-allowed",
                      fontFamily: "'Nunito', sans-serif",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {votedValue !== null ? "Next →" : "pick one first ✦"}
                  </button>
                </Card>
              )
            )}

            {/* ── UPLOAD TAB ── */}
            {tab === "upload" && (
              <Card>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "38px", marginBottom: "8px" }}>🌿</div>
                  <h2 style={{
                    fontFamily: "'Caveat', cursive",
                    fontSize: "28px", fontWeight: "700", color: t.text, margin: "0 0 4px 0",
                  }}>
                    Generate Captions
                  </h2>
                  <p style={{ fontSize: "13px", color: t.textSoft, margin: "0", fontWeight: "600" }}>
                    Upload an image, get AI-generated captions
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
                        borderRadius: "18px", padding: "36px 24px",
                        textAlign: "center", cursor: "pointer",
                        background: dragOver ? t.accentLight : t.inputBg,
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ fontSize: "38px", marginBottom: "10px", display: "inline-block", animation: dragOver ? "petalRock 0.5s ease infinite" : "none" }}>
                        {dragOver ? "🌸" : "🖼️"}
                      </div>
                      <p style={{ color: t.text, fontWeight: "800", fontSize: "15px", margin: "0 0 4px 0" }}>
                        Drop your image here
                      </p>
                      <p style={{ color: t.textSoft, fontSize: "12px", margin: "0", fontWeight: "600" }}>
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
                        background: "rgba(200,82,42,0.08)", border: `1.5px solid rgba(200,82,42,0.25)`,
                        borderRadius: "14px", padding: "12px 16px",
                        color: t.text, fontSize: "14px", fontWeight: "700",
                      }}>
                        🍂 {uploadError}
                      </div>
                    )}
                  </>
                )}

                {/* Loading state */}
                {isLoading && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
                    {previewUrl && (
                      <div style={{ position: "relative", borderRadius: "14px", overflow: "hidden", border: `1.5px solid ${t.cardBorder}` }}>
                        <img src={previewUrl} alt="Preview" style={{
                          width: "100%", maxHeight: "160px", objectFit: "cover",
                          display: "block", filter: "brightness(0.6) saturate(0.75)",
                        }} />
                        <div style={{
                          position: "absolute", inset: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <div style={{
                            width: "38px", height: "38px",
                            border: "3px solid rgba(255,255,255,0.2)",
                            borderTop: "3px solid rgba(255,255,255,0.9)",
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
                              width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0,
                              background: done
                                ? `linear-gradient(135deg, ${t.accent}, #f0834a)`
                                : active ? t.accentLight : t.divider,
                              border: `1.5px solid ${done ? t.accent : active ? t.accent + "80" : t.cardBorder}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "all 0.3s ease", fontSize: "11px", color: "#fff8f0", fontWeight: "900",
                            }}>
                              {done ? "✓" : active
                                ? <span style={{ animation: "blink 1s ease infinite", color: t.accent, fontSize: "8px" }}>●</span>
                                : <span style={{ color: t.textSoft, fontSize: "8px" }}>○</span>
                              }
                            </div>
                            <span style={{
                              fontSize: "14px", fontWeight: active ? "800" : "600",
                              color: done ? t.accent : active ? t.text : t.textSoft,
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

                {/* Done state */}
                {uploadState === "done" && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "14px" }}>
                    {(uploadedImageUrl || previewUrl) && (
                      <div style={{ borderRadius: "14px", overflow: "hidden", border: `1.5px solid ${t.cardBorder}` }}>
                        <img src={uploadedImageUrl || previewUrl!} alt="Uploaded" style={{
                          width: "100%", maxHeight: "180px", objectFit: "cover", display: "block",
                        }} />
                      </div>
                    )}
                    <div>
                      <p style={{
                        fontSize: "11px", fontWeight: "800", color: t.textSoft,
                        margin: "0 0 10px 0", textTransform: "uppercase", letterSpacing: "0.1em",
                      }}>
                        ✦ Generated Captions · {generatedCaptions.length}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {generatedCaptions.length === 0 ? (
                          <p style={{ color: t.textSoft, fontSize: "14px", fontWeight: "600" }}>Nothing came back 🍂</p>
                        ) : generatedCaptions.map((cap, i) => (
                          <div key={cap.id || i} style={{
                            background: i % 2 === 0 ? t.inputBg : t.stripAlt,
                            border: `1.5px solid ${t.cardBorder}`,
                            borderRadius: "14px", padding: "11px 15px",
                            display: "flex", gap: "10px", alignItems: "flex-start",
                          }}>
                            <span style={{ fontSize: "11px", fontWeight: "900", color: t.textSoft, minWidth: "18px", marginTop: "3px" }}>
                              {i + 1}.
                            </span>
                            <span style={{
                              fontFamily: "'Caveat', cursive",
                              fontSize: "18px", color: t.text, lineHeight: "1.4",
                            }}>
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
                        borderRadius: "16px", border: "none",
                        background: `linear-gradient(135deg, ${t.accent}, #f0834a)`,
                        color: "#fff8f0",
                        fontSize: "15px", fontWeight: "800",
                        cursor: "pointer", fontFamily: "'Nunito', sans-serif",
                        boxShadow: `0 4px 16px rgba(200,82,42,0.3)`,
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.filter = "brightness(1.06)"; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.filter = ""; }}
                    >
                      🌸 Upload Another
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