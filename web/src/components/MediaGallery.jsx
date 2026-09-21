import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { connectSocket } from "../socket.js";

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function MediaGallery() {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("all");
  const [stats, setStats] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = useCallback(
    async (reset = false) => {
      setLoading(true);
      try {
        const data = await api.listMedia({
          cursor: reset ? undefined : cursor || undefined,
          type,
        });
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        setCursor(data.nextCursor);
        setHasMore(Boolean(data.nextCursor));
      } finally {
        setLoading(false);
      }
    },
    [cursor, type]
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    load(true);
    api.mediaStats().then(setStats).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    const socket = connectSocket();
    const onWiped = () => {
      setItems([]);
      setCursor(null);
      setHasMore(false);
      setPreview(null);
      api.mediaStats().then(setStats).catch(() => {});
    };
    socket.on("data:wiped", onWiped);
    return () => socket.off("data:wiped", onWiped);
  }, []);

  async function handleDelete(id) {
    if (!window.confirm("Delete this item for everyone?")) return;
    await api.deleteMedia(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setPreview((p) => (p?.id === id ? null : p));
  }

  return (
    <section style={styles.panel}>
      <header style={styles.header}>
        <h2 style={styles.h2}>Media</h2>
        {stats && (
          <span style={styles.stats}>
            {stats.totalCount} items · {formatBytes(stats.totalSize)}
          </span>
        )}
      </header>

      <div style={styles.tabs}>
        {["all", "image", "video"].map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            style={{
              ...styles.tab,
              ...(type === t ? styles.tabActive : {}),
            }}
          >
            {t === "all" ? "All" : t === "image" ? "Photos" : "Videos"}
          </button>
        ))}
      </div>

      <div style={styles.grid}>
        {items.map((item) => (
          <button
            key={item.id}
            style={styles.thumbWrap}
            onClick={() => setPreview(item)}
            title={item.filename}
          >
            {item.mimeType?.startsWith("video") ? (
              <div style={styles.videoThumb}>
                <span style={styles.playIcon}>▶</span>
              </div>
            ) : (
              <img
                src={api.mediaFileUrl(item.id)}
                alt=""
                loading="lazy"
                style={styles.thumb}
              />
            )}
          </button>
        ))}
        {items.length === 0 && !loading && <p style={styles.muted}>No media synced yet.</p>}
      </div>

      {hasMore && (
        <button className="btn-ghost" style={styles.loadMore} onClick={() => load(false)} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}

      {preview && (
        <div style={styles.lightbox} onClick={() => setPreview(null)}>
          <div style={styles.lightboxInner} onClick={(e) => e.stopPropagation()}>
            {preview.mimeType?.startsWith("video") ? (
              <video src={api.mediaFileUrl(preview.id)} controls autoPlay style={styles.lightboxMedia} />
            ) : (
              <img src={api.mediaFileUrl(preview.id)} alt="" style={styles.lightboxMedia} />
            )}
            <div style={styles.lightboxBar}>
              <span style={styles.muted}>
                {preview.name || "Unknown"} · {formatBytes(preview.size)}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-ghost" onClick={() => handleDelete(preview.id)}>
                  Delete
                </button>
                <button className="btn-ghost" onClick={() => setPreview(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const styles = {
  panel: {
    display: "flex",
    flexDirection: "column",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
    minHeight: 0,
    height: "100%",
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid var(--border)",
  },
  h2: { margin: 0, fontSize: 16 },
  stats: { fontSize: 12, color: "var(--text-muted)" },
  tabs: { display: "flex", gap: 6, padding: "10px 16px 0" },
  tab: {
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 12.5,
  },
  tabActive: {
    background: "var(--accent)",
    color: "var(--accent-text)",
    borderColor: "var(--accent)",
  },
  grid: {
    flex: 1,
    overflowY: "auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
    gap: 6,
    padding: 16,
    alignContent: "start",
  },
  thumbWrap: {
    padding: 0,
    border: "none",
    background: "var(--bg)",
    borderRadius: "var(--radius-sm)",
    aspectRatio: "1 / 1",
    overflow: "hidden",
  },
  thumb: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  videoThumb: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#000",
    color: "#fff",
  },
  playIcon: { fontSize: 20 },
  muted: { color: "var(--text-muted)", fontSize: 13 },
  loadMore: { margin: 12, alignSelf: "center" },
  lightbox: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    padding: 20,
  },
  lightboxInner: {
    background: "var(--surface)",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
    maxWidth: "min(90vw, 720px)",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
  },
  lightboxMedia: { maxWidth: "100%", maxHeight: "70vh", display: "block", background: "#000" },
  lightboxBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    gap: 8,
  },
};
