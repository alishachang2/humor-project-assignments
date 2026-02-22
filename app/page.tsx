"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { theme } from "@/lib/theme";

type Caption = {
  id: string;
  content: string;
};

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [votes, setVotes] = useState<Record<string, number>>({});

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/login");
      } else {
        setUser(data.user);
      }
    });

    supabase
      .from("captions")
      .select("id, content")
      .limit(10)
      .then(({ data }) => {
        if (data) setCaptions(data);
      });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleVote = async (captionId: string, voteValue: 1 | -1) => {
    if (!user) return;

    const { error } = await supabase
      .from("caption_votes")
      .insert({
        caption_id: captionId,
        profile_id: user.id,
        vote_value: voteValue,
      });

    if (error) {
      console.error(error);
      alert("Failed to submit vote: " + error.message);
    } else {
      setVotes((prev) => ({ ...prev, [captionId]: voteValue }));
    }
  };

  if (!user) return null;

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
            {user.user_metadata?.given_name || user.email}
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
          padding: "120px 24px 40px",
          gap: "24px",
        }}
      >
        {/* Hey there card */}
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
            You're signed in as <strong style={{ color: theme.textPrimary }}>{user.email}</strong>
          </p>
        </div>

        {/* Captions voting card */}
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
          }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "700",
              color: theme.textPrimary,
              margin: "0 0 24px 0",
              letterSpacing: "-0.3px",
            }}
          >
            Rate these captions
          </h2>

          {captions.length === 0 ? (
            <p style={{ color: theme.textSecondary }}>No captions found.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {captions.map((caption) => (
                <div
                  key={caption.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "16px",
                    padding: "14px 0",
                    borderBottom: theme.border,
                  }}
                >
                  <span style={{ fontSize: "15px", color: theme.textPrimary, flex: 1 }}>
                    {caption.content}
                  </span>
                  <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                    <button
                      onClick={() => handleVote(caption.id, 1)}
                      style={{
                        background: votes[caption.id] === 1 ? "#4ade8033" : "transparent",
                        border: `1px solid ${votes[caption.id] === 1 ? "#4ade80" : "#ffffff22"}`,
                        borderRadius: "8px",
                        padding: "6px 12px",
                        cursor: "pointer",
                        fontSize: "16px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      
                    </button>
                    <button
                      onClick={() => handleVote(caption.id, -1)}
                      style={{
                        background: votes[caption.id] === -1 ? "#f8717133" : "transparent",
                        border: `1px solid ${votes[caption.id] === -1 ? "#f87171" : "#ffffff22"}`,
                        borderRadius: "8px",
                        padding: "6px 12px",
                        cursor: "pointer",
                        fontSize: "16px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}