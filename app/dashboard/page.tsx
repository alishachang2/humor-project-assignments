import { supabase } from '../../lib/supabaseClient';

export default async function Page() {
  const { data } = await supabase
    .from("captions")
    .select("content")
    .limit(10);

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: 'var(--bg)',
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "640px",
        background: 'var(--bg2)',
        borderRadius: "8px",
        border: '1px solid var(--border)',
        padding: "48px",
      }}>
        <h1 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: "42px",
          fontWeight: 400,
          color: 'var(--text)',
          marginBottom: "24px",
          letterSpacing: "-0.02em",
        }}>
          <em>Captions.</em>
        </h1>

        {(!data || data.length === 0) ? (
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>No rows found.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{
                  textAlign: "left",
                  borderBottom: '1px solid var(--border)',
                  padding: "8px",
                  color: 'var(--text2)',
                  fontSize: "9px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}>
                  Content
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <td style={{
                    borderBottom: '1px solid var(--border)',
                    padding: "12px 8px",
                    color: 'var(--text)',
                    fontSize: "14px",
                    lineHeight: 1.6,
                  }}>
                    {row.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
