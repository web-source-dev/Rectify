import { useState } from "react";
import { api } from "../api.js";

const CONFIRM_WORD = "DELETE";

export default function ClearDataButton() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function close() {
    if (busy) return;
    setOpen(false);
    setTyped("");
    setError("");
    setDone(false);
  }

  async function confirmWipe() {
    setBusy(true);
    setError("");
    try {
      await api.wipeAll();
      setDone(true);
    } catch {
      setError("Couldn't clear data. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn-danger" onClick={() => setOpen(true)}>
        Clear all data
      </button>

      {open && (
        <div style={styles.overlay} onClick={close}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            {done ? (
              <>
                <h2 style={styles.title}>All data cleared</h2>
                <p style={styles.body}>
                  Every message and every photo/video has been permanently deleted.
                </p>
                <div style={styles.actions}>
                  <button className="btn" onClick={close}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 style={styles.title}>Clear all data?</h2>
                <p style={styles.body}>
                  This permanently deletes every chat message and every synced photo/video
                  for everyone. Accounts and names are kept. This cannot be undone.
                </p>
                <p style={styles.label}>
                  Type <strong>{CONFIRM_WORD}</strong> to confirm.
                </p>
                <input
                  className="field"
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={CONFIRM_WORD}
                  style={{ marginBottom: 12 }}
                />
                {error && <p className="error-text">{error}</p>}
                <div style={styles.actions}>
                  <button className="btn-ghost" onClick={close} disabled={busy}>
                    Cancel
                  </button>
                  <button
                    className="btn-danger"
                    onClick={confirmWipe}
                    disabled={busy || typed !== CONFIRM_WORD}
                  >
                    {busy ? "Deleting…" : "Delete everything"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 20,
  },
  modal: {
    width: "100%",
    maxWidth: 380,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
  },
  title: { margin: "0 0 8px", fontSize: 18 },
  body: { margin: "0 0 16px", fontSize: 14, color: "var(--text-muted)" },
  label: { margin: "0 0 8px", fontSize: 13.5 },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8 },
};
