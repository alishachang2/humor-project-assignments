"use client";

import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "https://humor-project-assignments.vercel.app/auth/callback" },
    });
  };

  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
      <div style={{ height: 3, backgroundColor: 'var(--green)' }} />

      <header style={s.header}>
        <span style={s.label}>The Humor Project</span>
        <span style={{ ...s.label, color: 'var(--text2)' }}>Assignments</span>
      </header>

      <main style={s.main}>
        <p style={s.eyebrow}>Sign In</p>
        <h1 style={s.heading}>Welcome<br /><em>back.</em></h1>
        <p style={s.body}>
          Rate captions and upload images for the Humor Project.
        </p>
        <button type="button" onClick={handleGoogleLogin} style={s.button} className="login-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>
      </main>

      <footer style={s.footer}>
        <span style={s.label}>© 2026</span>
      </footer>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .login-btn:hover { background: var(--accent) !important; color: var(--accent-fg) !important; }
        .login-btn:hover svg path { fill: var(--accent-fg) !important; }
      `}</style>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    display: 'flex',
    flexDirection: 'column',
    animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '16px 48px',
    borderBottom: '1px solid var(--border)',
  },
  label: { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' as const },
  eyebrow: { fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'var(--text2)', marginBottom: 16 },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '0 48px',
    maxWidth: 560,
  },
  heading: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 84,
    fontWeight: 400,
    lineHeight: 0.92,
    letterSpacing: '-0.03em',
    marginBottom: 24,
  },
  body: { fontSize: 14, lineHeight: 1.7, color: 'var(--text2)', marginBottom: 32, maxWidth: 400 },
  button: {
    alignSelf: 'flex-start',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '11px 28px',
    border: '1px solid var(--accent)',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '14px 48px',
    borderTop: '1px solid var(--border)',
  },
};
