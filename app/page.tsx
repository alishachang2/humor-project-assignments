"use client";

import { useEffect, useState, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

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

const c = {
  bg: "#f7f4ee",
  bgDot: "#e8e2d6",
  yellow: "#f5d76e",
  yellowLight: "#fef9e4",
  green: "#c8dea0",
  greenDark: "#8ab86e",
  pink: "#f4b8c8",
  pinkLight: "#fde8ef",
  blue: "#a8d4e0",
  blueLight: "#e0f4f8",
  text: "#3d3226",
  textSoft: "#8a7a6a",
  white: "#fffef9",
  border: "#e0d8cc",
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: "100%",
      background: c.white,
      borderRadius: "24px",
      border: `2.5px solid ${c.border}`,
      padding: "28px 32px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "18px",
      boxShadow: `5px 5px 0 ${c.border}`,
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
    showToast(votedValue === 1 ? "🌸 Voted funny!" : "🐦 Voted not funny");
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
      const uploadRes = await fetch(presignedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!uploadRes.ok) throw new Error("Couldn't upload image");
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
      background: c.bg,
      fontFamily: "'Nunito', 'Trebuchet MS', sans-serif",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Caveat:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }

        @keyframes floatUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes greetFade {
          0%   { opacity: 0; transform: translateY(14px) scale(0.97); }
          18%  { opacity: 1; transform: translateY(0) scale(1); }
          78%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-10px) scale(0.97); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toastPop {
          0%   { opacity: 0; transform: translateX(-50%) scale(0.85) translateY(10px); }
          65%  { transform: translateX(-50%) scale(1.05) translateY(-2px); }
          100% { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
        }
        @keyframes petal {
          0%, 100% { transform: rotate(-5deg) scale(1); }
          50%       { transform: rotate(5deg) scale(1.05); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes popIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .tab-btn { transition: all 0.18s ease; }
        .tab-btn:hover { transform: translateY(-2px); }

        .vote-btn { transition: all 0.15s ease; }
        .vote-btn:hover { transform: scale(1.07) rotate(-2deg); }
        .vote-btn:active { transform: scale(0.93); }

        .next-btn { transition: all 0.18s ease; }
        .next-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 4px 6px 0 #3d3226 !important;
        }

        .upload-again:hover { transform: translateY(-2px); box-shadow: 4px 6px 0 #3d3226 !important; }
      `}</style>

      {/* Dot background */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `radial-gradient(circle, ${c.bgDot} 1.5px, transparent 1.5px)`,
        backgroundSize: "28px 28px",
      }} />

      {/* Decorative blobs */}
      <div style={{ position: "fixed", width: 360, height: 360, background: c.yellow, borderRadius: "50%", filter: "blur(70px)", opacity: 0.3, top: -100, right: -80, zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "fixed", width: 280, height: 280, background: c.green, borderRadius: "50%", filter: "blur(60px)", opacity: 0.3, bottom: -60, left: -60, zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "fixed", width: 220, height: 220, background: c.pink, borderRadius: "50%", filter: "blur(55px)", opacity: 0.3, bottom: 120, right: 30, zIndex: 0, pointerEvents: "none" }} />

      {/* Toast */}
      {toast.visible && (
        <div style={{
          position: "fixed", bottom: "36px", left: "50%",
          background: c.white,
          border: `2.5px solid ${c.greenDark}`,
          borderRadius: "999px",
          padding: "10px 26px",
          fontSize: "15px", fontWeight: "800", color: c.text,
          zIndex: 300, whiteSpace: "nowrap",
          boxShadow: `3px 3px 0 ${c.greenDark}`,
          animation: "toastPop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards",
          fontFamily: "'Nunito', sans-serif",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Navbar */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px",
        background: `${c.white}e8`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: `2px solid ${c.border}`,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "38px", height: "38px",
            background: c.yellow,
            borderRadius: "50%",
            border: `2.5px solid ${c.text}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "19px",
            boxShadow: `2px 2px 0 ${c.text}`,
            animation: "petal 3s ease infinite",
          }}>
            🌸
          </div>
          <span style={{
            fontFamily: "'Caveat', cursive",
            fontSize: "24px", fontWeight: "700", color: c.text,
          }}>
            Humor Project
          </span>
        </div>

        {/* Profile pill */}
        <div ref={profileRef} style={{ position: "relative" }}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              background: profileOpen ? c.yellow : c.yellowLight,
              border: `2.5px solid ${profileOpen ? c.text : c.border}`,
              borderRadius: "999px",
              padding: "7px 14px 7px 8px",
              cursor: "pointer",
              fontFamily: "'Nunito', sans-serif",
              fontSize: "14px", fontWeight: "800", color: c.text,
              transition: "all 0.16s ease",
              boxShadow: profileOpen ? `2px 2px 0 ${c.text}` : "none",
            }}
          >
            {user.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="avatar"
                style={{ width: "26px", height: "26px", borderRadius: "50%", border: `2px solid ${c.border}` }} />
            ) : (
              <div style={{
                width: "26px", height: "26px", borderRadius: "50%",
                background: c.green, border: `2px solid ${c.text}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px",
              }}>🌿</div>
            )}
            {user.user_metadata?.given_name || user.user_metadata?.full_name?.split(" ")[0] || "you"}
            <span style={{ fontSize: "9px", color: c.textSoft }}>{profileOpen ? "▲" : "▼"}</span>
          </button>

          {/* Popup */}
          {profileOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 10px)", right: 0,
              background: c.white,
              border: `2.5px solid ${c.border}`,
              borderRadius: "20px",
              padding: "8px",
              minWidth: "190px",
              boxShadow: `4px 4px 0 ${c.border}`,
              animation: "popIn 0.2s cubic-bezier(0.34,1.56,0.64,1) forwards",
              zIndex: 200,
            }}>
              {/* User info header */}
              <div style={{
                padding: "10px 14px 12px",
                borderBottom: `2px dashed ${c.border}`,
                marginBottom: "6px",
              }}>
                <div style={{ fontSize: "13px", fontWeight: "900", color: c.text }}>
                  {user.user_metadata?.full_name || user.user_metadata?.given_name || "Friend"}
                </div>
                <div style={{ fontSize: "11px", color: c.textSoft, marginTop: "3px", fontWeight: "600" }}>
                  {user.email}
                </div>
              </div>

              {/* Sign out btn */}
              <button
                onClick={handleSignOut}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "13px",
                  border: `2px solid ${c.pink}`,
                  background: c.pinkLight,
                  color: c.text,
                  fontSize: "14px", fontWeight: "800",
                  cursor: "pointer",
                  fontFamily: "'Nunito', sans-serif",
                  textAlign: "left",
                  display: "flex", alignItems: "center", gap: "8px",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = c.pink; }}
                onMouseLeave={e => { e.currentTarget.style.background = c.pinkLight; }}
              >
                <span>👋</span> Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "96px 24px 48px",
        minHeight: "100vh", boxSizing: "border-box", gap: "16px",
        position: "relative", zIndex: 1,
      }}>

        {showGreeting ? (
          <div style={{
            width: "100%", maxWidth: "460px",
            background: c.white, borderRadius: "28px",
            border: `2.5px solid ${c.border}`,
            padding: "52px 44px", textAlign: "center",
            boxShadow: `6px 6px 0 ${c.border}`,
            animation: "greetFade 2.2s ease forwards",
          }}>
            <div style={{ fontSize: "54px", marginBottom: "16px", display: "inline-block", animation: "petal 2s ease infinite" }}>🌸</div>
            <h1 style={{
              fontFamily: "'Caveat', cursive",
              fontSize: "42px", fontWeight: "700", color: c.text, margin: "0 0 10px 0",
            }}>
              Hi, {user.user_metadata?.given_name || "there"}!
            </h1>
            <p style={{ fontSize: "15px", color: c.textSoft, margin: "0", fontWeight: "600" }}>
              Signed in as <span style={{ color: c.text }}>{user.email}</span>
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
              display: "flex", gap: "8px",
              background: c.white, borderRadius: "20px",
              border: `2.5px solid ${c.border}`,
              padding: "6px",
              boxShadow: `4px 4px 0 ${c.border}`,
            }}>
              {[
                { key: "rate", label: "Rate Captions", emoji: "⭐" },
                { key: "upload", label: "Upload Image", emoji: "🌿" },
              ].map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    className="tab-btn"
                    onClick={() => { setTab(t.key as Tab); if (t.key === "rate") resetUpload(); }}
                    style={{
                      flex: 1, padding: "10px 16px",
                      borderRadius: "14px",
                      border: active ? `2px solid ${c.text}` : "2px solid transparent",
                      background: active ? c.yellow : "transparent",
                      color: c.text, fontSize: "14px", fontWeight: "800",
                      cursor: "pointer", fontFamily: "'Nunito', sans-serif",
                      boxShadow: active ? `2px 2px 0 ${c.text}` : "none",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                    }}
                  >
                    <span>{t.emoji}</span> {t.label}
                  </button>
                );
              })}
            </div>

            {/* ── RATE TAB ── */}
            {tab === "rate" && (
              captions.length === 0 ? (
                <Card>
                  <p style={{ fontSize: "16px", color: c.textSoft, fontWeight: "700", margin: 0 }}>
                    No captions found yet 🐦
                  </p>
                </Card>
              ) : (
                <Card>
                  {/* Progress */}
                  <div style={{ width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: c.textSoft, fontWeight: "700", marginBottom: "7px" }}>
                      <span>rate this one ✦</span>
                      <span>{index + 1} of {captions.length}</span>
                    </div>
                    <div style={{ width: "100%", height: "9px", background: c.border, borderRadius: "999px", overflow: "hidden", border: `1.5px solid ${c.text}18` }}>
                      <div style={{
                        height: "100%",
                        width: `${((index + (votedValue !== null ? 1 : 0)) / captions.length) * 100}%`,
                        background: `linear-gradient(90deg, ${c.greenDark}, ${c.green})`,
                        borderRadius: "999px",
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                  </div>

                  <div style={{ width: "100%", height: 0, borderTop: `1.5px dashed ${c.border}` }} />

                  {/* Image */}
                  <div style={{
                    width: "100%", borderRadius: "16px", overflow: "hidden",
                    border: `2px solid ${c.border}`,
                    boxShadow: `3px 3px 0 ${c.border}`,
                  }}>
                    <img src={caption.imageUrl} alt={caption.content} style={{
                      width: "100%", maxHeight: "220px", objectFit: "contain", display: "block",
                      background: c.yellowLight,
                    }} />
                  </div>

                  {/* Caption text */}
                  <p style={{
                    fontFamily: "'Caveat', cursive",
                    fontSize: "21px", fontWeight: "600", color: c.text,
                    lineHeight: "1.4", margin: "0", textAlign: "center",
                  }}>
                    {caption?.content}
                  </p>

                  {/* Vote buttons */}
                  <div style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
                    {[
                      { val: 1 as const, emoji: "👍", label: "Funny!", bg: c.green, activeBorder: c.greenDark },
                      { val: -1 as const, emoji: "👎", label: "Not funny", bg: c.pink, activeBorder: "#d4869a" },
                    ].map(({ val, emoji, label, bg, activeBorder }) => {
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
                            border: `2.5px solid ${selected ? c.text : activeBorder + "70"}`,
                            background: selected ? bg : c.white,
                            boxShadow: selected ? `3px 3px 0 ${c.text}` : `2px 2px 0 ${activeBorder}40`,
                            cursor: "pointer",
                            fontFamily: "'Nunito', sans-serif",
                          }}
                        >
                          <span style={{ fontSize: "30px", lineHeight: 1 }}>{emoji}</span>
                          <span style={{
                            fontSize: "11px", fontWeight: "800",
                            color: selected ? c.text : c.textSoft,
                            textTransform: "uppercase", letterSpacing: "0.06em",
                          }}>{label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Next */}
                  <button
                    className="next-btn"
                    onClick={handleNext}
                    disabled={votedValue === null}
                    style={{
                      width: "100%", padding: "13px",
                      borderRadius: "16px",
                      border: votedValue !== null ? `2.5px solid ${c.text}` : `2px solid ${c.border}`,
                      background: votedValue !== null ? c.greenDark : c.border,
                      boxShadow: votedValue !== null ? `3px 3px 0 ${c.text}` : `inset 0 2px 6px rgba(0,0,0,0.09)`,
                      color: votedValue !== null ? c.white : c.textSoft,
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
                    fontSize: "28px", fontWeight: "700", color: c.text, margin: "0 0 4px 0",
                  }}>
                    Generate Captions
                  </h2>
                  <p style={{ fontSize: "13px", color: c.textSoft, margin: "0", fontWeight: "600" }}>
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
                        border: `2.5px dashed ${dragOver ? c.greenDark : c.border}`,
                        borderRadius: "20px", padding: "36px 24px",
                        textAlign: "center", cursor: "pointer",
                        background: dragOver ? c.green + "28" : c.yellowLight,
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ fontSize: "40px", marginBottom: "10px", display: "inline-block", animation: dragOver ? "petal 0.5s ease infinite" : "none" }}>
                        {dragOver ? "🌸" : "🖼️"}
                      </div>
                      <p style={{ color: c.text, fontWeight: "800", fontSize: "15px", margin: "0 0 4px 0" }}>
                        Drop your image here
                      </p>
                      <p style={{ color: c.textSoft, fontSize: "12px", margin: "0", fontWeight: "600" }}>
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
                        background: c.pinkLight, border: `2px solid ${c.pink}`,
                        borderRadius: "14px", padding: "12px 16px",
                        color: c.text, fontSize: "14px", fontWeight: "700",
                      }}>
                        🌷 {uploadError}
                      </div>
                    )}
                  </>
                )}

                {/* Loading */}
                {isLoading && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
                    {previewUrl && (
                      <div style={{ position: "relative", borderRadius: "16px", overflow: "hidden", border: `2px solid ${c.border}` }}>
                        <img src={previewUrl} alt="Preview" style={{
                          width: "100%", maxHeight: "160px", objectFit: "cover",
                          display: "block", filter: "brightness(0.62) saturate(0.7)",
                        }} />
                        <div style={{
                          position: "absolute", inset: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <div style={{
                            width: "38px", height: "38px",
                            border: "3px solid rgba(255,255,255,0.25)",
                            borderTop: "3px solid #fff",
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
                              width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0,
                              background: done ? c.greenDark : active ? c.yellow : c.border,
                              border: `2px solid ${done ? c.greenDark : active ? c.text : c.border}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "all 0.3s ease", fontSize: "12px", fontWeight: "900", color: c.white,
                            }}>
                              {done ? "✓" : active ? (
                                <span style={{ animation: "blink 1s ease infinite", color: c.text }}>●</span>
                              ) : (
                                <span style={{ color: c.textSoft }}>○</span>
                              )}
                            </div>
                            <span style={{
                              fontSize: "14px", fontWeight: active ? "800" : "600",
                              color: done ? c.greenDark : active ? c.text : c.textSoft,
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
                      <div style={{ borderRadius: "16px", overflow: "hidden", border: `2px solid ${c.border}`, boxShadow: `3px 3px 0 ${c.border}` }}>
                        <img src={uploadedImageUrl || previewUrl!} alt="Uploaded" style={{
                          width: "100%", maxHeight: "180px", objectFit: "cover", display: "block",
                        }} />
                      </div>
                    )}
                    <div>
                      <p style={{
                        fontSize: "11px", fontWeight: "800", color: c.textSoft,
                        margin: "0 0 10px 0", textTransform: "uppercase", letterSpacing: "0.1em",
                      }}>
                        ✦ Generated Captions · {generatedCaptions.length}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {generatedCaptions.length === 0 ? (
                          <p style={{ color: c.textSoft, fontSize: "14px", fontWeight: "600" }}>Nothing came back 🐦</p>
                        ) : generatedCaptions.map((cap, i) => (
                          <div key={cap.id || i} style={{
                            background: i % 2 === 0 ? c.yellowLight : c.blueLight,
                            border: `2px solid ${c.border}`,
                            borderRadius: "14px", padding: "11px 15px",
                            display: "flex", gap: "10px", alignItems: "flex-start",
                          }}>
                            <span style={{ fontSize: "11px", fontWeight: "900", color: c.textSoft, minWidth: "18px", marginTop: "3px" }}>
                              {i + 1}.
                            </span>
                            <span style={{
                              fontFamily: "'Caveat', cursive",
                              fontSize: "18px", color: c.text, lineHeight: "1.4",
                            }}>
                              {cap.content || cap.caption || JSON.stringify(cap)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      className="upload-again"
                      onClick={resetUpload}
                      style={{
                        width: "100%", padding: "12px",
                        borderRadius: "16px", border: `2.5px solid ${c.text}`,
                        background: c.yellow, color: c.text,
                        fontSize: "15px", fontWeight: "800",
                        cursor: "pointer", fontFamily: "'Nunito', sans-serif",
                        boxShadow: `3px 3px 0 ${c.text}`,
                        transition: "all 0.15s ease",
                      }}
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