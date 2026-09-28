import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { connectSocket } from "../socket.js";

const PAGE_SIZE = 40;

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const isVideo = (item) => item.mimeType?.startsWith("video");

// One grid cell: a fixed square that shows a shimmer until its small
// thumbnail has loaded, so tiles never jump or overlap while loading.
function Tile({ item, onOpen }) {
  const [state, setState] = useState("loading"); // loading | loaded | error
  const video = isVideo(item);

  return (
    <button className="media-tile" onClick={() => onOpen(item)} title={item.filename}>
      {video ? (
        <span className="media-tile-placeholder media-tile-video">
          <span className="media-play">▶</span>
        </span>
      ) : state === "error" ? (
        <span className="media-tile-placeholder">Photo</span>
      ) : (
        <>
          {state === "loading" && <span className="media-tile-skeleton" />}
          <img
            src={api.mediaThumbUrl(item.id)}
            alt=""
            loading="lazy"
            decoding="async"
            className={`media-tile-img${state === "loaded" ? " is-loaded" : ""}`}
            onLoad={() => setState("loaded")}
            onError={() => setState("error")}
          />
        </>
      )}
    </button>
  );
}

// Full-screen viewer: shows the already-loaded thumbnail straight away, then
// swaps in the full-resolution original once it has downloaded.
function Viewer({ item, onClose, onPrev, onNext, onDelete }) {
  const [fullLoaded, setFullLoaded] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const video = isVideo(item);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
      else if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  async function handleDelete() {
    if (!window.confirm("Delete this item for everyone?")) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(item);
    } catch {
      setError("Couldn't delete. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="viewer" onClick={onClose} role="dialog" aria-modal="true">
      <div className="viewer-stage" onClick={(e) => e.stopPropagation()}>
        {video ? (
          <video
            key={item.id}
            src={api.mediaFileUrl(item.id)}
            controls
            autoPlay
            className="viewer-media is-loaded"
          />
        ) : (
          <>
            {!fullLoaded && !thumbFailed && (
              <img
                src={api.mediaThumbUrl(item.id)}
                alt=""
                className="viewer-media viewer-thumb"
                onError={() => setThumbFailed(true)}
              />
            )}
            <img
              key={item.id}
              src={api.mediaFileUrl(item.id)}
              alt=""
              className={`viewer-media viewer-full${fullLoaded ? " is-loaded" : ""}`}
              onLoad={() => setFullLoaded(true)}
              onError={() => setError("Couldn't load the full image.")}
            />
            {!fullLoaded && !error && (
              <div className="viewer-spinner" aria-label="Loading full image" />
            )}
          </>
        )}
      </div>

      {onPrev && (
        <button
          className="viewer-nav viewer-prev"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="Previous"
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          className="viewer-nav viewer-next"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label="Next"
        >
          ›
        </button>
      )}

      <div className="viewer-bar" onClick={(e) => e.stopPropagation()}>
        <span className="viewer-meta">
          {item.name || "Unknown"} · {formatDate(item.createdAt)} · {formatBytes(item.size)}
          {error && <span className="error-text"> · {error}</span>}
        </span>
        <div className="viewer-actions">
          <button className="btn-ghost" onClick={handleDelete} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MediaGallery() {
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [type, setType] = useState("all");
  const [stats, setStats] = useState(null);
  const [previewId, setPreviewId] = useState(null);

  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);
  // Refs so the scroll observer always sees the latest paging state.
  const cursorRef = useRef(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const generationRef = useRef(0); // bumps on tab change/wipe to drop stale pages

  const refreshStats = useCallback(() => {
    api.mediaStats().then(setStats).catch(() => {});
  }, []);

  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    const generation = generationRef.current;
    loadingRef.current = true;
    setLoading(true);
    setLoadError(false);
    try {
      const data = await api.listMedia({
        cursor: cursorRef.current || undefined,
        type,
        limit: PAGE_SIZE,
      });
      if (generation !== generationRef.current) return;
      cursorRef.current = data.nextCursor;
      hasMoreRef.current = Boolean(data.nextCursor);
      setHasMore(hasMoreRef.current);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...data.items.filter((i) => !seen.has(i.id))];
      });
    } catch {
      if (generation === generationRef.current) setLoadError(true);
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [type]);

  // Empties the grid; the fill-the-panel effect below then loads page one.
  const reset = useCallback(() => {
    generationRef.current += 1;
    cursorRef.current = null;
    loadingRef.current = false;
    hasMoreRef.current = true;
    setItems([]);
    setHasMore(true);
    setLoading(false);
    setLoadError(false);
    setPreviewId(null);
    scrollRef.current?.scrollTo({ top: 0 });
    refreshStats();
  }, [refreshStats]);

  function selectType(t) {
    if (t === type) return;
    reset();
    setType(t);
  }

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Load the next page as the bottom of the grid scrolls into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadNextPage();
      },
      { root, rootMargin: "600px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadNextPage]);

  // The observer only fires when visibility changes — if a page didn't fill
  // the panel, the sentinel is still on screen, so keep loading until it isn't.
  useEffect(() => {
    if (loading || !hasMore || loadError) return;
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;
    if (sentinel.getBoundingClientRect().top < root.getBoundingClientRect().bottom + 600) {
      loadNextPage();
    }
  }, [loading, hasMore, loadError, items.length, loadNextPage]);

  useEffect(() => {
    const socket = connectSocket();
    socket.on("data:wiped", reset);
    return () => socket.off("data:wiped", reset);
  }, [reset]);

  const previewIndex = items.findIndex((i) => i.id === previewId);
  const preview = previewIndex >= 0 ? items[previewIndex] : null;

  async function handleDelete(item) {
    await api.deleteMedia(item.id);
    const next = items[previewIndex + 1] || items[previewIndex - 1] || null;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setPreviewId(next ? next.id : null);
    refreshStats();
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
            onClick={() => selectType(t)}
            style={{
              ...styles.tab,
              ...(type === t ? styles.tabActive : {}),
            }}
          >
            {t === "all" ? "All" : t === "image" ? "Photos" : "Videos"}
          </button>
        ))}
      </div>

      <div ref={scrollRef} style={styles.scroll}>
        <div className="media-grid">
          {items.map((item) => (
            <Tile key={item.id} item={item} onOpen={(it) => setPreviewId(it.id)} />
          ))}
        </div>

        {items.length === 0 && !loading && !loadError && (
          <p style={styles.muted}>No media synced yet.</p>
        )}
        {loading && <div className="media-loading">Loading…</div>}
        {loadError && (
          <div className="media-loading">
            Couldn't load media.{" "}
            <button className="link-button" onClick={loadNextPage}>
              Retry
            </button>
          </div>
        )}
        {/* Scrolling this into view triggers the next page. */}
        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
      </div>

      {preview && (
        <Viewer
          key={preview.id}
          item={preview}
          onClose={() => setPreviewId(null)}
          onPrev={previewIndex > 0 ? () => setPreviewId(items[previewIndex - 1].id) : null}
          onNext={
            previewIndex < items.length - 1
              ? () => setPreviewId(items[previewIndex + 1].id)
              : null
          }
          onDelete={handleDelete}
        />
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
  tabs: { display: "flex", gap: 6, padding: "10px 16px" },
  tab: {
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 12.5,
    cursor: "pointer",
  },
  tabActive: {
    background: "var(--accent)",
    color: "var(--accent-text)",
    borderColor: "var(--accent)",
  },
  // The scroll area and the grid are separate elements: the grid keeps its
  // natural height (so square tiles never get squeezed together) and this
  // wrapper does the scrolling.
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "0 16px 16px",
  },
  muted: { color: "var(--text-muted)", fontSize: 13, textAlign: "center", marginTop: 24 },
};
