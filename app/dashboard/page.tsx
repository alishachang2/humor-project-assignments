import { supabase } from '../../lib/supabaseClient';
import { theme } from '../../lib/theme';

export default async function Page() {
  const { data, error } = await supabase
    .from("captions")
    .select("content")
    .limit(10);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.background,
        fontFamily: "Inter, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "640px",
          background: theme.card,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: "24px",
          border: theme.border,
          padding: "48px",
        }}
      >
        <h1
          style={{
            fontSize: "28px",
            fontWeight: "700",
            color: theme.textPrimary,
            marginBottom: "24px",
            letterSpacing: "-0.5px",
          }}
        >
          Captions
        </h1>

        {(!data || data.length === 0) ? (
          <p style={{ color: theme.textSecondary }}>No rows found.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: theme.border,
                    padding: "8px",
                    color: theme.textSecondary,
                    fontSize: "13px",
                    fontWeight: "500",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Content
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <td
                    style={{
                      borderBottom: theme.border,
                      padding: "12px 8px",
                      color: theme.textPrimary,
                      fontSize: "15px",
                    }}
                  >
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