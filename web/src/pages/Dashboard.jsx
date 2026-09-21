import ChatPanel from "../components/ChatPanel.jsx";
import MediaGallery from "../components/MediaGallery.jsx";
import ClearDataButton from "../components/ClearDataButton.jsx";

export default function Dashboard({ me, onLogout }) {
  return (
    <div style={styles.wrap}>
      <header style={styles.topbar}>
        <div>
          <h1 style={styles.title}>Family</h1>
          <p style={styles.subtitle}>Signed in as {me?.name}</p>
        </div>
        <div style={styles.actions}>
          <ClearDataButton />
          <button className="btn-ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="dashboard-grid" style={styles.grid}>
        <ChatPanel me={me} />
        <MediaGallery />
      </main>
    </div>
  );
}

const styles = {
  wrap: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    maxWidth: 1100,
    margin: "0 auto",
    padding: 16,
    gap: 16,
  },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actions: { display: "flex", alignItems: "center", gap: 8 },
  title: { margin: 0, fontSize: 20 },
  subtitle: { margin: "2px 0 0", fontSize: 13, color: "var(--text-muted)" },
  grid: {
    flex: 1,
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
};
