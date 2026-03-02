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

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [index, setIndex] = useState(0);
  const [votedValue, setVotedValue] = useState<1 | -1 | null>(null);
  const [showGreeting, setShowGreeting] = useState(true);
  const [tab, setTab] = useState<Tab>("rate");

  // Upload
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatedCaptions, setGeneratedCaptions] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: "", visible: false });
  const toastTimer = useRef<any>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, visible: true });
    toastTimer.current = setTimeout(() => setToast({ msg: "", visible: false }), 2200);
  };

  const loadCaptions = async () => {
    const { count } = await supabase
      .from("captions")
      .select("*", { count: "exact", head: true });
    const total = count ?? 0;
    const randomOffset = Math.floor(Math.random() * Math.max(0, total - 10));
    const { data } = await supabase
      .from("captions")
      .select("id, content, image_id")
      .range(randomOffset, randomOffset + 9);
    if (data) {
      const captionsWithImages = await Promise.all(
        data.map(async (caption) => {
          const { data: imageData } = await supabase
            .from("images")
            .select("url")
            .eq("id", caption.image_id)
            .single();
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
    const timer = setTimeout(() => setShowGreeting(false), 2000);
    return () => clearTimeout(timer);
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

    showToast(votedValue === 1 ? "👍 Voted funny!" : "👎 Voted not funny");

    if (index + 1 >= captions.length) {
      await loadCaptions();
      setIndex(0);
    } else {
      setIndex((i) => i + 1);
    }
    setVotedValue(null);
  };

  const getToken = async (): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  };

  const handleFileUpload = async (file: File) => {
    const supported = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic"];
    if (!supported.includes(file.type)) {
      setUploadError("Unsupported type. Use JPEG, PNG, WebP, GIF, or HEIC.");
      setUploadState("error");
      return;
    }
    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);

    setUploadState("uploading");
    setUploadError(null);
    setGeneratedCaptions([]);
    setUploadedImageUrl(null);

    try {
      const token = await getToken();

      // Step 1: presigned URL
      const presignRes = await fetch(`${API_BASE}/pipeline/generate-presigned-url`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      if (!presignRes.ok) throw new Error("Failed to generate presigned URL");
      const { presignedUrl, cdnUrl } = await presignRes.json();

      // Step 2: upload bytes
      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload image");
      setUploadedImageUrl(cdnUrl);
      setUploadState("registering");

      // Step 3: register
      const registerRes = await fetch(`${API_BASE}/pipeline/upload-image-from-url`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: cdnUrl, isCommonUse: false }),
      });
      if (!registerRes.ok) throw new Error("Failed to register image");
      const { imageId } = await registerRes.json();
      setUploadState("generating");

      // Step 4: generate captions
      const captionRes = await fetch(`${API_BASE}/pipeline/generate-captions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      if (!captionRes.ok) throw new Error("Failed to generate captions");
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
    }}>
      <style>{`
        @keyframes fadeInOut {
          0%   { opacity: 0; transform: translateY(8px); }
          15%  { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-8px); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toastSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes stepPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Toast */}
      {toast.visible && (
        <div style={{
          position: "fixed",
          bottom: "32px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#111827",
          border: "1px solid #ffffff18",
          borderRadius: "999px",
          padding: "10px 22px",
          fontSize: "14px",
          fontWeight: "600",
          color: "#fff",
          zIndex: 100,
          whiteSpace: "nowrap",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          animation: "toastSlideUp 0.25s ease forwards",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Navbar */}
      <div style={{
        position: "fixed", top: "20px", left: "0", right: "0",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: "24px", height: "24px", background: theme.icon,
            borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center",
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

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            background: theme.card, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            border: theme.border, borderRadius: "999px", padding: "8px 16px",
            display: "flex", alignItems: "center", gap: "8px",
            fontSize: "14px", color: theme.textPrimary, fontWeight: "500",
          }}>
            {user.user_metadata?.avatar_url && (
              <img src={user.user_metadata.avatar_url} alt="avatar"
                style={{ width: "22px", height: "22px", borderRadius: "50%" }} />
            )}
            {user.user_metadata?.given_name || user.user_metadata?.full_name || user.email}
          </div>
          <button onClick={handleSignOut} style={{
            background: theme.signOutBg, border: theme.signOutBorder,
            borderRadius: "999px", padding: "8px 16px",
            fontSize: "14px", fontWeight: "500", color: theme.signOutColor,
            cursor: "pointer", fontFamily: "Inter, sans-serif", transition: "opacity 0.15s ease",
          }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
            Sign out
          </button>
        </div>
      </div>

      {/* Main */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "80px 24px 40px", minHeight: "100vh",
        boxSizing: "border-box", gap: "16px",
      }}>
        {showGreeting ? (
          <div style={{
            width: "100%", maxWidth: "520px",
            background: theme.card, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            borderRadius: "24px", border: theme.border, padding: "52px 48px", textAlign: "center",
            animation: "fadeInOut 2s ease forwards",
          }}>
            <h1 style={{ fontSize: "36px", fontWeight: "700", color: theme.textPrimary, margin: "0 0 12px 0", letterSpacing: "-0.5px" }}>
              Hey, {user.user_metadata?.given_name || "there"} 👋
            </h1>
            <p style={{ fontSize: "16px", color: theme.textSecondary, margin: "0" }}>
              You're signed in as <strong style={{ color: theme.textPrimary }}>{user.user_metadata?.email || user.email}</strong>
            </p>
          </div>
        ) : (
          <div style={{ width: "100%", maxWidth: "520px", display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Tab Toggle — pill style */}
            <div style={{
              display: "flex",
              background: "#00000028",
              borderRadius: "16px",
              padding: "4px",
              border: "1px solid #ffffff0e",
              gap: "4px",
            }}>
              {[
                { key: "rate", label: "Rate Captions", emoji: "⭐" },
                { key: "upload", label: "Upload Image", emoji: "📤" },
              ].map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => { setTab(t.key as Tab); if (t.key === "rate") resetUpload(); }}
                    style={{
                      flex: 1, padding: "10px 16px",
                      borderRadius: "12px", border: "none",
                      background: active ? "#ffffff14" : "transparent",
                      boxShadow: active
                        ? "inset 0 1px 0 #ffffff12, inset 0 -2px 4px rgba(0,0,0,0.3)"
                        : "none",
                      color: active ? theme.textPrimary : theme.textSecondary,
                      fontSize: "14px", fontWeight: active ? "600" : "400",
                      cursor: "pointer", fontFamily: "Inter, sans-serif",
                      transition: "all 0.18s ease",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                    }}
                  >
                    <span style={{ fontSize: "15px" }}>{t.emoji}</span>
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* RATE TAB */}
            {tab === "rate" && (
              captions.length === 0 ? (
                <div style={{
                  background: theme.card, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                  borderRadius: "24px", border: theme.border, padding: "40px", textAlign: "center",
                }}>
                  <p style={{ fontSize: "16px", color: theme.textPrimary, fontWeight: "600", margin: 0 }}>No captions found.</p>
                </div>
              ) : (
                <div style={{
                  background: theme.card, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                  borderRadius: "24px", border: theme.border, padding: "36px 40px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", textAlign: "center",
                }}>
                  {/* Progress bar */}
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: theme.textSecondary }}>
                      <span>Rate this caption</span>
                      <span>{index + 1} / {captions.length}</span>
                    </div>
                    <div style={{ width: "100%", height: "4px", background: "#ffffff12", borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${((index + (votedValue !== null ? 1 : 0)) / captions.length) * 100}%`,
                        background: theme.icon,
                        borderRadius: "999px",
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                  </div>

                  <div style={{ width: "100%", height: "1px", background: "#ffffff10" }} />

                  {/* Image */}
                  <img src={caption.imageUrl} alt={caption.content} style={{
                    width: "100%", maxHeight: "240px", objectFit: "contain", borderRadius: "12px",
                  }} />

                  {/* Caption */}
                  <p style={{ fontSize: "16px", fontWeight: "600", color: theme.textPrimary, lineHeight: "1.4", margin: "0" }}>
                    {caption?.content}
                  </p>

                  {/* Thumbs */}
                  <div style={{ display: "flex", gap: "12px" }}>
                    {[
                      { val: 1 as const, emoji: "👍", label: "Funny", color: "#22c55e" },
                      { val: -1 as const, emoji: "👎", label: "Not funny", color: "#ef4444" },
                    ].map(({ val, emoji, label, color }) => (
                      <button
                        key={val}
                        onClick={() => setVotedValue(val)}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
                          padding: "14px 24px",
                          borderRadius: "16px",
                          border: `2px solid ${votedValue === val ? color : color + "35"}`,
                          background: votedValue === val ? `${color}22` : `${color}08`,
                          boxShadow: votedValue === val
                            ? `inset 0 2px 8px rgba(0,0,0,0.28), 0 0 0 1px ${color}25`
                            : "none",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          transform: votedValue === val ? "scale(1.05)" : "scale(1)",
                        }}
                      >
                        <span style={{ fontSize: "28px", lineHeight: 1 }}>{emoji}</span>
                        <span style={{
                          fontSize: "11px", fontWeight: "600",
                          color: votedValue === val ? color : color + "70",
                          textTransform: "uppercase", letterSpacing: "0.06em",
                          transition: "color 0.15s ease",
                        }}>{label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Next — sunk in when inactive */}
                  <button
                    onClick={handleNext}
                    disabled={votedValue === null}
                    style={{
                      width: "100%", padding: "12px",
                      borderRadius: "14px",
                      border: votedValue === null ? "1px solid #ffffff06" : "1px solid transparent",
                      background: votedValue !== null ? theme.icon : "#00000040",
                      boxShadow: votedValue === null
                        ? "inset 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 3px rgba(0,0,0,0.3)"
                        : "0 2px 8px rgba(0,0,0,0.25)",
                      color: votedValue !== null ? "#fff" : "#ffffff25",
                      fontSize: "15px", fontWeight: "600",
                      cursor: votedValue !== null ? "pointer" : "not-allowed",
                      fontFamily: "Inter, sans-serif",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={e => { if (votedValue !== null) e.currentTarget.style.opacity = "0.85"; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                  >
                    Next →
                  </button>
                </div>
              )
            )}

            {/* UPLOAD TAB */}
            {tab === "upload" && (
              <div style={{
                background: theme.card, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                borderRadius: "24px", border: theme.border, padding: "36px 40px",
                display: "flex", flexDirection: "column", gap: "20px",
              }}>
                <div>
                  <h2 style={{ color: theme.textPrimary, fontWeight: "700", fontSize: "18px", margin: "0 0 4px 0" }}>
                    Generate Captions
                  </h2>
                  <p style={{ color: theme.textSecondary, fontSize: "13px", margin: "0" }}>
                    Upload an image and the AI will generate captions for it
                  </p>
                </div>

                {/* Idle / Error: drop zone */}
                {(uploadState === "idle" || uploadState === "error") && (
                  <>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault(); setDragOver(false);
                        const f = e.dataTransfer.files?.[0]; if (f) handleFileUpload(f);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        border: `2px dashed ${dragOver ? theme.icon : "#ffffff1e"}`,
                        borderRadius: "16px", padding: "36px 24px",
                        textAlign: "center", cursor: "pointer",
                        background: dragOver ? `${theme.icon}12` : "transparent",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ fontSize: "36px", marginBottom: "12px" }}>🖼️</div>
                      <p style={{ color: theme.textPrimary, fontWeight: "600", fontSize: "15px", margin: "0 0 4px 0" }}>
                        Drop your image here
                      </p>
                      <p style={{ color: theme.textSecondary, fontSize: "13px", margin: "0" }}>
                        or click to browse · JPEG, PNG, WebP, GIF, HEIC
                      </p>
                    </div>
                    <input ref={fileInputRef} type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                      style={{ display: "none" }} />

                    {uploadState === "error" && uploadError && (
                      <div style={{
                        background: "#ef444415", border: "1px solid #ef444430",
                        borderRadius: "12px", padding: "12px 16px",
                        color: "#ef4444", fontSize: "14px",
                      }}>
                        ⚠️ {uploadError}
                      </div>
                    )}
                  </>
                )}

                {/* Loading: thumbnail + step indicators */}
                {isLoading && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {previewUrl && (
                      <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden" }}>
                        <img src={previewUrl} alt="Preview" style={{
                          width: "100%", maxHeight: "180px", objectFit: "cover",
                          display: "block", filter: "brightness(0.55)",
                        }} />
                        <div style={{
                          position: "absolute", inset: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <div style={{
                            width: "38px", height: "38px",
                            border: `3px solid rgba(255,255,255,0.15)`,
                            borderTop: `3px solid #fff`,
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
                              background: done ? "#22c55e" : active ? theme.icon : "#ffffff10",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "background 0.4s ease",
                              animation: active ? "stepPulse 1.3s ease infinite" : "none",
                            }}>
                              {done ? (
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                  <path d="M2.5 5.5l2 2.5L8.5 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : (
                                <div style={{
                                  width: "6px", height: "6px", borderRadius: "50%",
                                  background: active ? "#fff" : "#ffffff28",
                                }} />
                              )}
                            </div>
                            <span style={{
                              fontSize: "13px",
                              fontWeight: active ? "600" : "400",
                              color: done ? "#22c55e" : active ? theme.textPrimary : theme.textSecondary,
                              transition: "color 0.3s ease",
                            }}>
                              {step.label}
                              {active && <span style={{ marginLeft: "6px", opacity: 0.6, animation: "stepPulse 1s ease infinite" }}>…</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Done: thumbnail + captions */}
                {uploadState === "done" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {(uploadedImageUrl || previewUrl) && (
                      <img src={uploadedImageUrl || previewUrl!} alt="Uploaded" style={{
                        width: "100%", maxHeight: "200px", objectFit: "cover", borderRadius: "12px",
                      }} />
                    )}

                    <div>
                      <p style={{
                        color: theme.textSecondary, fontSize: "11px", fontWeight: "700",
                        margin: "0 0 10px 0", textTransform: "uppercase", letterSpacing: "0.08em",
                      }}>
                        Generated Captions · {generatedCaptions.length}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {generatedCaptions.length === 0 ? (
                          <p style={{ color: theme.textSecondary, fontSize: "14px" }}>No captions returned.</p>
                        ) : generatedCaptions.map((cap, i) => (
                          <div key={cap.id || i} style={{
                            background: "#ffffff07", border: "1px solid #ffffff10",
                            borderRadius: "12px", padding: "12px 16px",
                            display: "flex", gap: "10px", alignItems: "flex-start",
                          }}>
                            <span style={{
                              fontSize: "11px", fontWeight: "700",
                              color: theme.textSecondary, minWidth: "16px", marginTop: "2px",
                            }}>{i + 1}</span>
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
                        width: "100%", padding: "11px",
                        borderRadius: "14px", border: "none",
                        background: theme.icon, color: "#fff",
                        fontSize: "15px", fontWeight: "600",
                        cursor: "pointer", fontFamily: "Inter, sans-serif",
                      }}
                    >
                      Upload Another Image
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}