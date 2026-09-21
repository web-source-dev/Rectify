import { useState } from "react";
import { api, storeSession } from "../api.js";

export default function Login({ onLoggedIn }) {
  const [step, setStep] = useState("pin"); // "pin" | "name"
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitPin(e) {
    e.preventDefault();
    if (!pin.trim()) return;
    setError("");
    setBusy(true);
    try {
      const { token, user } = await api.loginWithPin(pin.trim(), "Web dashboard");
      storeSession(token, user);
      if (user.name) {
        onLoggedIn(user);
      } else {
        setStep("name");
      }
    } catch (err) {
      setError(err.status === 401 ? "Incorrect PIN." : "Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function submitName(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError("");
    setBusy(true);
    try {
      const updated = await api.setName(trimmed);
      storeSession(localStorage.getItem("token"), updated);
      onLoggedIn(updated);
    } catch {
      setError("Couldn't save your name. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>Family</h1>
        {step === "pin" ? (
          <form onSubmit={submitPin}>
            <p style={styles.hint}>Enter the family PIN to continue.</p>
            <input
              className="field"
              type="password"
              inputMode="numeric"
              autoFocus
              placeholder="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Checking…" : "Enter"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitName}>
            <p style={styles.hint}>What should we call you?</p>
            <input
              className="field"
              type="text"
              autoFocus
              maxLength={40}
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Saving…" : "Continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: 28,
  },
  title: {
    margin: "0 0 4px",
    fontSize: 22,
  },
  hint: {
    color: "var(--text-muted)",
    fontSize: 14,
    marginTop: 0,
  },
};
