"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { theme } from "@/lib/theme";

type Caption = {
  id: string;
  content: string;
  image_id: string;
  imageUrl: string;
};

const UPVOTE_COLOR = "#22c55e";
const DOWNVOTE_COLOR = "#ef4444";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [index, setIndex] = useState(0);
  const [votedValue, setVotedValue] = useState<1 | -1 | null>(null);
  const [showGreeting, setShowGreeting] = useState(true);

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
          padding: "120px 24px 40px",
          height: "100vh",
          boxSizing: "border-box",
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

                {/* Divider */}
                <div style={{ width: "100%", height: "1px", background: "#ffffff10" }} />

                {/* Image */}
                <img src={caption.imageUrl} alt={caption.content} style={
                  {
                    width: "100%",
                    maxHeight: "250px",
                    objectFit: "contain",
                    borderRadius: "12px"
                  }} />

                {/* Caption text */}
                <p
                  style={{
                    fontSize: "22px",
                    fontWeight: "600",
                    color: theme.textPrimary,
                    lineHeight: "1.4",
                    margin: "0",
                    minHeight: "80px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {caption?.content}
                </p>

                {/* Vote buttons */}
                <div style={{ display: "flex", gap: "12px", width: "60%" }}>
                  <button
                    onClick={() => setVotedValue(1)}
                    style={{
                      flex: 1,
                      padding: "14px 0",
                      borderRadius: "14px",
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
                      flex: 1,
                      padding: "14px 0",
                      borderRadius: "14px",
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
                    padding: "16px",
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