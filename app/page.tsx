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

type UploadState = "idle" | "uploading" | "generating" | "done" | "error";

const UPVOTE_COLOR = "#22c55e";
const DOWNVOTE_COLOR = "#ef4444";
const API_BASE = "https://api.almostcrackd.ai";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [index, setIndex] = useState(0);
  const [votedValue, setVotedValue] = useState<1 | -1 | null>(null);
  const [showGreeting, setShowGreeting] = useState(true);

  // Upload state
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [generatedCaptions, setGeneratedCaptions] = useState<any[]>([]);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

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
    if (error) {
      alert("Failed to submit vote: " + error.message);
      return;
    }

    if (index + 1 >= captions.length) {
      await loadCaptions();
      setIndex(0);
      setVotedValue(null);
    } else {
      setIndex((i) => i + 1);
      setVotedValue(null);
    }
  };

  const getToken = async (): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  };

  const handleFileUpload = async (file: File) => {
    const supportedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic"];
    if (!supportedTypes.includes(file.type)) {
      setUploadError("Unsupported file type. Please use JPEG, PNG, WebP, GIF, or HEIC.");
      setUploadState("error");
      return;
    }

    setUploadState("uploading");
    setUploadError(null);
    setGeneratedCaptions([]);
    setUploadedImageUrl(null);

    try {
      const token = await getToken();

      // Step 1: Get presigned URL
      const presignRes = await fetch(`${API_BASE}/pipeline/generate-presigned-url`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contentType: file.type }),
      });
      if (!presignRes.ok) throw new Error("Failed to generate presigned URL");
      const { presignedUrl, cdnUrl } = await presignRes.json();

      // Step 2: Upload to S3
      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload image");
      setUploadedImageUrl(cdnUrl);

      // Step 3: Register image
      const registerRes = await fetch(`${API_BASE}/pipeline/upload-image-from-url`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageUrl: cdnUrl, isCommonUse: false }),
      });
      if (!registerRes.ok) throw new Error("Failed to register image");
      const { imageId } = await registerRes.json();

      // Step 4: Generate captions
      setUploadState("generating");
      const captionRes = await fetch(`${API_BASE}/pipeline/generate-captions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageId }),
      });
      if (!captionRes.ok) throw new Error("Failed to generate captions");
      const captions = await captionRes.json();
      setGeneratedCaptions(Array.isArray(captions) ? captions : []);
      setUploadState("done");
    } catch (err: any) {
      setUploadError(err.message || "Something went wrong");
      setUploadState("error");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const resetUpload = () => {
    setUploadState("idle");
    setUploadError(null);
    setUploadedImageUrl(null);
    setGeneratedCaptions([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!user) return null;

  const caption = captions[index];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.background,
        fontFamily: "Inter, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes fadeInOut {
          0%   { opacity: 0; transform: translateY(8px); }
          15%  { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-8px); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Navbar */}
      <div
        style={{
          position: "fixed",
          top: "20px",
          left: "0",
          right: "0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "24px",
              height: "24px",
              background: theme.icon,
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
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
          {/* Upload toggle button */}
          <button
            onClick={() => { setShowUploadPanel(!showUploadPanel); resetUpload(); }}
            style={{
              background: showUploadPanel ? theme.icon : theme.card,
              border: theme.border,
              borderRadius: "999px",
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: "500",
              color: showUploadPanel ? "#fff" : theme.textPrimary,
              cursor: "pointer",
              fontFamily: "Inter, sans-serif",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Image
          </button>

          <div
            style={{
              background: theme.card,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: theme.border,
              borderRadius: "999px",
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "14px",
              color: theme.textPrimary,
              fontWeight: "500",
            }}
          >
            {user.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt="avatar"
                style={{ width: "22px", height: "22px", borderRadius: "50%" }}
              />
            )}
            {user.user_metadata?.given_name || user.user_metadata?.full_name || user.email}
          </div>

          <button
            onClick={handleSignOut}
            style={{
              background: theme.signOutBg,
              border: theme.signOutBorder,
              borderRadius: "999px",
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: "500",
              color: theme.signOutColor,
              cursor: "pointer",
              fontFamily: "Inter, sans-serif",
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "50px 24px 40px",
          minHeight: "100vh",
          boxSizing: "border-box",
          gap: "24px",
        }}
      >
        {showGreeting ? (
          <div
            style={{
              width: "100%",
              maxWidth: "560px",
              background: theme.card,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderRadius: "24px",
              border: theme.border,
              padding: "52px 48px",
              textAlign: "center",
              animation: "fadeInOut 2s ease forwards",
            }}
          >
            <h1
              style={{
                fontSize: "36px",
                fontWeight: "700",
                color: theme.textPrimary,
                margin: "0 0 12px 0",
                letterSpacing: "-0.5px",
              }}
            >
              Hey, {user.user_metadata?.given_name || "there"} 👋
            </h1>
            <p style={{ fontSize: "16px", color: theme.textSecondary, margin: "0" }}>
              You're signed in as <strong style={{ color: theme.textPrimary }}>{user.user_metadata?.email || user.email}</strong>
            </p>
          </div>
        ) : (
          <>
            {/* Upload Panel */}
            {showUploadPanel && (
              <div
                style={{
                  width: "100%",
                  maxWidth: "560px",
                  background: theme.card,
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  borderRadius: "24px",
                  border: theme.border,
                  padding: "36px 40px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                <div>
                  <h2 style={{ color: theme.textPrimary, fontWeight: "700", fontSize: "18px", margin: "0 0 4px 0" }}>
                    Upload an Image
                  </h2>
                  <p style={{ color: theme.textSecondary, fontSize: "13px", margin: "0" }}>
                    Generate captions for your own image using the pipeline
                  </p>
                </div>

                {uploadState === "idle" || uploadState === "error" ? (
                  <>
                    {/* Drop zone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        border: `2px dashed ${dragOver ? theme.icon : "#ffffff25"}`,
                        borderRadius: "16px",
                        padding: "32px 24px",
                        textAlign: "center",
                        cursor: "pointer",
                        background: dragOver ? `${theme.icon}15` : "transparent",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <svg width="32" height="32" fill="none" stroke={theme.textSecondary} strokeWidth="1.5" viewBox="0 0 24 24" style={{ margin: "0 auto 12px" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M4.5 19.5h15a.75.75 0 00.75-.75V6.75a.75.75 0 00-.75-.75h-15a.75.75 0 00-.75.75v12c0 .414.336.75.75.75z" />
                      </svg>
                      <p style={{ color: theme.textPrimary, fontWeight: "600", fontSize: "15px", margin: "0 0 4px 0" }}>
                        Drop your image here
                      </p>
                      <p style={{ color: theme.textSecondary, fontSize: "13px", margin: "0" }}>
                        or click to browse · JPEG, PNG, WebP, GIF, HEIC
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic"
                      onChange={handleFileChange}
                      style={{ display: "none" }}
                    />

                    {uploadState === "error" && uploadError && (
                      <div style={{
                        background: "#ef444420",
                        border: "1px solid #ef444440",
                        borderRadius: "12px",
                        padding: "12px 16px",
                        color: "#ef4444",
                        fontSize: "14px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}>
                        <span>⚠️</span> {uploadError}
                      </div>
                    )}
                  </>
                ) : uploadState === "uploading" || uploadState === "generating" ? (
                  <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <div style={{
                      width: "40px",
                      height: "40px",
                      border: `3px solid ${theme.icon}40`,
                      borderTop: `3px solid ${theme.icon}`,
                      borderRadius: "50%",
                      margin: "0 auto 16px",
                      animation: "spin 0.8s linear infinite",
                    }} />
                    <p style={{ color: theme.textPrimary, fontWeight: "600", fontSize: "15px", margin: "0 0 4px 0" }}>
                      {uploadState === "uploading" ? "Uploading image…" : "Generating captions…"}
                    </p>
                    <p style={{ color: theme.textSecondary, fontSize: "13px", margin: "0", animation: "pulse 1.5s ease infinite" }}>
                      {uploadState === "uploading" ? "Steps 1–3 of 4" : "Step 4 of 4 · This may take a moment"}
                    </p>
                  </div>
                ) : uploadState === "done" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {uploadedImageUrl && (
                      <img
                        src={uploadedImageUrl}
                        alt="Uploaded"
                        style={{ width: "100%", maxHeight: "200px", objectFit: "contain", borderRadius: "12px" }}
                      />
                    )}
                    <div>
                      <p style={{ color: theme.textSecondary, fontSize: "13px", fontWeight: "500", margin: "0 0 10px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Generated Captions ({generatedCaptions.length})
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {generatedCaptions.length === 0 ? (
                          <p style={{ color: theme.textSecondary, fontSize: "14px" }}>No captions returned.</p>
                        ) : (
                          generatedCaptions.map((cap, i) => (
                            <div
                              key={cap.id || i}
                              style={{
                                background: "#ffffff08",
                                borderRadius: "12px",
                                padding: "12px 16px",
                                color: theme.textPrimary,
                                fontSize: "14px",
                                lineHeight: "1.5",
                                border: "1px solid #ffffff10",
                              }}
                            >
                              {cap.content || cap.caption || JSON.stringify(cap)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <button
                      onClick={resetUpload}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "14px",
                        border: "none",
                        background: theme.icon,
                        color: "#fff",
                        fontSize: "15px",
                        fontWeight: "600",
                        cursor: "pointer",
                        fontFamily: "Inter, sans-serif",
                      }}
                    >
                      Upload Another Image
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            {/* Caption voting panel */}
            {captions.length === 0 ? (
              <div
                style={{
                  width: "100%",
                  maxWidth: "560px",
                  background: theme.card,
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  borderRadius: "24px",
                  border: theme.border,
                  padding: "40px 48px",
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: "18px", color: theme.textPrimary, fontWeight: "600", margin: 0 }}>
                  No captions found.
                </p>
              </div>
            ) : (
              <div
                style={{
                  width: "100%",
                  maxWidth: "560px",
                  background: theme.card,
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  borderRadius: "24px",
                  border: theme.border,
                  padding: "52px 48px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "24px",
                  textAlign: "center",
                }}
              >
                {/* Progress */}
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: theme.textSecondary }}>
                    <span>Rate this caption</span>
                    <span>{index + 1} / {captions.length}</span>
                  </div>
                  <div style={{ width: "100%", height: "4px", background: "#ffffff15", borderRadius: "999px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${((index + (votedValue !== null ? 1 : 0)) / captions.length) * 100}%`,
                        background: theme.icon,
                        borderRadius: "999px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>

                <div style={{ width: "100%", height: "1px", background: "#ffffff10" }} />

                {/* Image */}
                <img src={caption.imageUrl} alt={caption.content} style={{
                  width: "100%",
                  maxHeight: "250px",
                  objectFit: "contain",
                  borderRadius: "12px"
                }} />

                {/* Caption text */}
                <p
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    color: theme.textPrimary,
                    lineHeight: "1.3",
                    margin: "0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {caption?.content}
                </p>

                {/* Vote buttons */}
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => setVotedValue(1)}
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      border: votedValue === 1 ? `2px solid ${UPVOTE_COLOR}` : `2px solid ${UPVOTE_COLOR}88`,
                      background: votedValue === 1 ? `${UPVOTE_COLOR}33` : `${UPVOTE_COLOR}11`,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      transform: votedValue === 1 ? "scale(1.06)" : "scale(1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill={votedValue === 1 ? UPVOTE_COLOR : `${UPVOTE_COLOR}cc`} style={{ transition: "fill 0.15s ease" }}>
                      <path d="M12 2L4 12h5v9h6v-9h5L12 2z" />
                    </svg>
                  </button>

                  <button
                    onClick={() => setVotedValue(-1)}
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      border: votedValue === -1 ? `2px solid ${DOWNVOTE_COLOR}` : `2px solid ${DOWNVOTE_COLOR}88`,
                      background: votedValue === -1 ? `${DOWNVOTE_COLOR}33` : `${DOWNVOTE_COLOR}11`,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      transform: votedValue === -1 ? "scale(1.06)" : "scale(1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill={votedValue === -1 ? DOWNVOTE_COLOR : `${DOWNVOTE_COLOR}cc`} style={{ transition: "fill 0.15s ease" }}>
                      <path d="M12 22L20 12h-5V3H9v9H4l8 10z" />
                    </svg>
                  </button>
                </div>

                {/* Next button */}
                <button
                  onClick={handleNext}
                  disabled={votedValue === null}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "14px",
                    border: "none",
                    background: votedValue !== null ? theme.icon : "#ffffff15",
                    color: votedValue !== null ? "#fff" : "#ffffff40",
                    fontSize: "16px",
                    fontWeight: "600",
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
            )}
          </>
        )}
      </main>
    </div>
  );
}