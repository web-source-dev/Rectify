import { useEffect, useState } from "react";
import { api } from "../api.js";

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function phoneLabel(o) {
  return (
    o.deviceName ||
    [o.brand, o.model].filter(Boolean).join(" ") ||
    o.model ||
    o.brand ||
    "Unknown device"
  );
}

// Shows which phone opened the app at which time. Polls every 30s so newly
// opened devices show up without a manual refresh.
export default function DeviceLog() {
  const [opens, setOpens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await api.listDeviceOpens(100);
        if (!alive) return;
        setOpens(data.opens || []);
        setError("");
      } catch {
        if (alive) setError("Couldn't load device activity.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <section style={styles.panel}>
      <div style={styles.header}>
        <h2 style={styles.title}>Device activity</h2>
        <span style={styles.hint}>Which phone opened the app, and when</span>
      </div>

      {loading ? (
        <p style={styles.muted}>Loading…</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : opens.length === 0 ? (
        <p style={styles.muted}>No app opens recorded yet.</p>
      ) : (
        <div style={styles.scroll}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>User</th>
                <th style={styles.th}>Opened</th>
              </tr>
            </thead>
            <tbody>
              {opens.map((o) => (
                <tr key={o.id}>
                  <td style={styles.td}>
                    <span style={styles.phone}>{phoneLabel(o)}</span>
                    {o.appVersion ? <span style={styles.badge}>v{o.appVersion}</span> : null}
                  </td>
                  <td style={{ ...styles.td, color: "var(--text-muted)" }}>
                    {o.name || "—"}
                  </td>
                  <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                    {formatWhen(o.openedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const styles = {
  panel: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: 16,
  },
  header: { marginBottom: 10 },
  title: { margin: 0, fontSize: 16 },
  hint: { fontSize: 12, color: "var(--text-muted)" },
  muted: { color: "var(--text-muted)", fontSize: 14, margin: "8px 0 0" },
  scroll: { maxHeight: 260, overflow: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: {
    textAlign: "left",
    padding: "6px 8px",
    position: "sticky",
    top: 0,
    background: "var(--surface)",
    color: "var(--text-muted)",
    fontWeight: 600,
    fontSize: 12,
    borderBottom: "1px solid var(--border)",
  },
  td: {
    padding: "8px 8px",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "top",
  },
  phone: { fontWeight: 500 },
  badge: {
    marginLeft: 8,
    fontSize: 11,
    color: "var(--text-muted)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "1px 6px",
  },
};
