import { useEffect, useRef, useState } from "react";
import ChatPanel from "../components/ChatPanel.jsx";
import ClearDataButton from "../components/ClearDataButton.jsx";
import InAppBrowser from "../components/InAppBrowser.jsx";
import { useScreenShare } from "../components/ScreenShare.jsx";
import { primePresenceSound, usePresence } from "../presence.js";
import Library from "./Library.jsx";
import Live from "./Live.jsx";

const PAGES = [
  { id: "home", label: "Chat", hint: "Messages and live" },
  { id: "library", label: "Library", hint: "Media and devices" },
];

function peopleLabel(count) {
  return count === 1 ? "1 person" : `${count} persons`;
}

function readPage() {
  const stored = sessionStorage.getItem("panel-page");
  return stored === "library" ? "library" : "home";
}

export default function Dashboard({ me, onLogout }) {
  const browserRef = useRef(null);
  const screen = useScreenShare();
  const online = usePresence(me?.id);
  const [page, setPage] = useState(readPage);

  const others = screen.shares.filter((share) => !share.self);
  const dismissedRef = useRef(null);
  const othersRef = useRef(others);
  const watchRef = useRef(screen.watch);
  othersRef.current = others;
  watchRef.current = screen.watch;
  const othersKey = others.map((share) => share.shareId).join("|");
  const watchingId = screen.watching?.shareId || "";

  useEffect(() => {
    if (page !== "home" || watchingId) return;
    const next = othersRef.current.find((share) => share.shareId !== dismissedRef.current);
    if (next) watchRef.current(next);
  }, [page, watchingId, othersKey]);

  useEffect(() => {
    document.title = `Chat (${peopleLabel(online.length)})`;
    return () => {
      document.title = "Chat";
    };
  }, [online.length]);
  const title = page === "library" ? "Library" : "Chat";
  const subtitle =
    page === "library"
      ? "Synced photos, videos, and which phone opened the app."
      : "Messages and the live picture stay together.";

  useEffect(() => {
    const unlock = () => primePresenceSound();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  function go(next) {
    if (page === "home" && next !== "home") screen.closeWatch();
    sessionStorage.setItem("panel-page", next);
    setPage(next);
  }

  const sorted = [...online].sort((a, b) =>
    (a.name || "Someone").localeCompare(b.name || "Someone"),
  );

  return (
    <>
      <div className="shell">
        <aside className="shell-nav">
          <div className="shell-brand">
            <span className="shell-mark" aria-hidden="true">
              F
            </span>
            <div>
              <strong>Family</strong>
              <span>{me?.name || "Signed in"}</span>
            </div>
          </div>
          <nav className="shell-tabs" aria-label="Sections">
            {PAGES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={page === item.id ? "is-active" : ""}
                aria-current={page === item.id ? "page" : undefined}
                onClick={() => go(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.hint}</small>
                {item.id === "home" && others.length > 0 ? (
                  <span className="nav-live" aria-label="Someone is live" />
                ) : null}
              </button>
            ))}
          </nav>
          <section className="online-block" aria-label="People online">
            <h2>Online now</h2>
            {sorted.length === 0 ? (
              <p className="online-empty">Waiting for people…</p>
            ) : (
              <ul className="online-list">
                {sorted.map((user) => (
                  <li key={user.userId}>
                    <span className="online-dot" aria-hidden="true" />
                    <span>{user.name || "Someone"}</span>
                    {user.userId === me?.id ? <small>You</small> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <div className="shell-body">
          <header className="shell-top">
            <div>
              <h1>
                {title}{" "}
                <span className="online-count">({peopleLabel(online.length)})</span>
              </h1>
              <p>{subtitle}</p>
            </div>
            <div className="shell-top-actions">
              <ClearDataButton />
              <button className="btn-ghost" onClick={onLogout}>
                Log out
              </button>
            </div>
          </header>

          <div className="shell-content">
            {page === "home" ? (
              <div className="home-page">
                <ChatPanel
                  me={me}
                  liveShares={others}
                  onSearch={() => browserRef.current?.show()}
                />
                <Live
                  screen={{
                    ...screen,
                    watch(share) {
                      if (dismissedRef.current === share.shareId) dismissedRef.current = null;
                      screen.watch(share);
                    },
                    closeWatch() {
                      dismissedRef.current = screen.watching?.shareId || null;
                      screen.closeWatch();
                    },
                  }}
                />
              </div>
            ) : (
              <Library />
            )}
          </div>
        </div>
      </div>
      <InAppBrowser ref={browserRef} />
    </>
  );
}
