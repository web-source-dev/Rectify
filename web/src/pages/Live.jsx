import { useEffect, useRef, useState } from "react";
import { ScreenStage } from "../components/ScreenShare.jsx";

function shareLabel(share) {
  if (share.scope === "app") return "App screen";
  return "Device screen";
}

export default function Live({ screen }) {
  const others = screen.shares.filter((share) => !share.self);
  const watching = screen.watching;
  const stageRef = useRef(null);
  const closeRef = useRef(screen.closeWatch);
  closeRef.current = screen.closeWatch;
  const [fullscreen, setFullscreen] = useState(false);
  const [fill, setFill] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!watching) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape" || document.fullscreenElement) return;
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [watching]);

  async function toggleFullscreen() {
    const node = stageRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement === node) await document.exitFullscreen();
      else await node.requestFullscreen();
    } catch {
      setFullscreen(false);
    }
  }

  return (
    <div className="live-pane">
      <div className="live-toolbar">
        <div className="live-chips">
          {others.length === 0 ? (
            <span className="live-note">No phone is live</span>
          ) : (
            others.map((share) => {
              const active = watching?.shareId === share.shareId;
              return (
                <button
                  key={share.shareId}
                  type="button"
                  className={active ? "live-chip is-on" : "live-chip"}
                  onClick={() => screen.watch(share)}
                >
                  <span className="live-pulse" aria-hidden="true" />
                  <span>{share.name || "Someone"}</span>
                  <small>{active ? "Showing" : shareLabel(share)}</small>
                </button>
              );
            })
          )}
        </div>
        <button
          type="button"
          className={screen.sharing ? "btn-danger" : "btn-ghost"}
          onClick={screen.sharing ? screen.stopShare : screen.startShare}
          disabled={screen.busy}
        >
          {screen.sharing ? "Stop sharing" : "Share this screen"}
        </button>
      </div>
      {screen.error ? <p className="error-text">{screen.error}</p> : null}

      <section className="live-stage" ref={stageRef} aria-label="Live picture">
        {watching ? (
          <>
            <header className="live-stage-bar">
              <span className="live-pulse" aria-hidden="true" />
              <div>
                <strong>{watching.name || "Someone"}</strong>
                <span>{shareLabel(watching)}</span>
              </div>
              <div className="live-options">
                <button type="button" className="btn-ghost" onClick={() => setFill((value) => !value)}>
                  {fill ? "Fit" : "Fill"}
                </button>
                <button type="button" className="btn-ghost" onClick={toggleFullscreen}>
                  {fullscreen ? "Exit full screen" : "Full screen"}
                </button>
                <button type="button" className="btn-ghost" onClick={screen.closeWatch}>
                  Close
                </button>
              </div>
            </header>
            <ScreenStage key={watching.shareId} shareId={watching.shareId} fill={fill} />
          </>
        ) : (
          <div className="live-placeholder">
            <h2>Live view</h2>
            <p>The picture opens here as soon as someone starts sharing.</p>
          </div>
        )}
      </section>
    </div>
  );
}
