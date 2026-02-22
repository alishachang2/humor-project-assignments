"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

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
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!user) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 60% 40%, #a8294a 0%, #7b1a35 60%, #5c1228 100%)",
        fontFamily: "Inter, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Navbar */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 40px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              background: "rgba(200, 80, 110, 0.5)",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <circle cx="9" cy="9" r="1.5" fill="white" stroke="none" />
              <circle cx="15" cy="9" r="1.5" fill="white" stroke="none" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 15c1.5 1.5 3 2 4 2s2.5-.5 4-2" />
            </svg>
          </div>
          <span style={{ color: "#fff", fontWeight: "600", fontSize: "16px" }}>Humor</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {user.user_metadata?.avatar_url && (
            <img
              src={user.user_metadata.avatar_url}
              alt="avatar"
              style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)" }}
            />
          )}
          <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "14px" }}>
            {user.user_metadata?.full_name || user.email}
          </span>
          <button
            onClick={handleSignOut}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "14px",
              fontWeight: "500",
              padding: "8px 16px",
              cursor: "pointer",
              fontFamily: "Inter, sans-serif",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "560px",
            background: "rgba(180, 60, 90, 0.35)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: "24px",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            padding: "52px 48px",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontSize: "36px",
              fontWeight: "700",
              color: "#ffffff",
              margin: "0 0 12px 0",
              letterSpacing: "-0.5px",
            }}
          >
            Hey, {user.user_metadata?.given_name || "there"} 👋
          </h1>
          <p style={{ fontSize: "16px", color: "rgba(255,255,255,0.7)", margin: "0" }}>
            You're signed in as <strong style={{ color: "#fff" }}>{user.email}</strong>
          </p>
        </div>
      </main>
    </div>
  );
}