import {supabase} from '../../lib/supabaseClient'

export default async function Page(){
    const { data, error } = await supabase
    .from("captions") 
    .select("content")
    .limit(10);

    return (
    <main style={{ padding: 24 }}>
      <h1>Captions</h1>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Content</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((row) => (
                <tr>
                    <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{row.content}</td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(!data || data.length === 0) && <p>No rows found.</p>}
    </main>
  );
}