import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { connectSocket } from "../socket.js";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ChatPanel({ me }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listMessages()
      .then((data) => {
        if (!cancelled) setMessages(data.messages);
      })
      .finally(() => !cancelled && setLoading(false));

    const socket = connectSocket();
    const onNew = (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onWiped = () => setMessages([]);

    socket.on("message:new", onNew);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("data:wiped", onWiped);
    setConnected(socket.connected);

    return () => {
      cancelled = true;
      socket.off("message:new", onNew);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("data:wiped", onWiped);
    };
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    try {
      const socket = connectSocket();
      if (socket.connected) {
        socket.emit("message:send", { text: trimmed });
      } else {
        const msg = await api.sendMessage(trimmed);
        setMessages((prev) => [...prev, msg]);
      }
    } catch {
      setText(trimmed);
    }
  }

  return (
    <section style={styles.panel}>
      <header style={styles.header}>
        <h2 style={styles.h2}>Chat</h2>
        <span style={{ ...styles.dot, background: connected ? "#33c26a" : "#c2c2c2" }} />
      </header>

      <div ref={listRef} style={styles.list}>
        {loading && <p style={styles.muted}>Loading messages…</p>}
        {!loading && messages.length === 0 && (
          <p style={styles.muted}>No messages yet. Say hi!</p>
        )}
        {messages.map((m) => {
          const mine = m.userId === me?.id;
          return (
            <div
              key={m.id}
              style={{ ...styles.row, justifyContent: mine ? "flex-end" : "flex-start" }}
            >
              <div
                style={{
                  ...styles.bubble,
                  background: mine ? "var(--bubble-own)" : "var(--bubble-other)",
                  color: mine ? "var(--bubble-own-text)" : "var(--bubble-other-text)",
                  borderTopRightRadius: mine ? 4 : "var(--radius-md)",
                  borderTopLeftRadius: mine ? "var(--radius-md)" : 4,
                }}
              >
                {!mine && <div style={styles.sender}>{m.name || "Someone"}</div>}
                <div style={styles.text}>{m.text}</div>
                <div style={{ ...styles.time, opacity: mine ? 0.75 : 0.6 }}>
                  {timeAgo(m.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} style={styles.composer}>
        <input
          className="field"
          style={{ flex: 1 }}
          placeholder="Message the family…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
        />
        <button className="btn" type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
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
    alignItems: "center",
    gap: 8,
    padding: "14px 16px",
    borderBottom: "1px solid var(--border)",
  },
  h2: { margin: 0, fontSize: 16 },
  dot: { width: 8, height: 8, borderRadius: "50%" },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  muted: { color: "var(--text-muted)", fontSize: 14, textAlign: "center" },
  row: { display: "flex" },
  bubble: {
    maxWidth: "78%",
    padding: "8px 12px",
    borderRadius: "var(--radius-md)",
  },
  sender: { fontSize: 12, fontWeight: 700, marginBottom: 2, opacity: 0.75 },
  text: { fontSize: 14.5, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  time: { fontSize: 10.5, marginTop: 4, textAlign: "right" },
  composer: {
    display: "flex",
    gap: 8,
    padding: 12,
    borderTop: "1px solid var(--border)",
  },
};
