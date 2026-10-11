import { useEffect, useRef, useState } from "react";
import { connectSocket } from "../socket.js";

function createShareId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useScreenShare() {
  const [shares, setShares] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [watching, setWatching] = useState(null);
  const shareIdRef = useRef(null);
  const captureRef = useRef(null);
  const viewersRef = useRef(0);
  const watchingRef = useRef(null);
  const stoppingRef = useRef(false);
  const startingRef = useRef(false);

  useEffect(() => {
    watchingRef.current = watching;
  }, [watching]);

  function stopCapture() {
    const cleanup = captureRef.current;
    captureRef.current = null;
    cleanup?.();
  }

  function stopShare() {
    if (stoppingRef.current) return;
    if (!shareIdRef.current && !captureRef.current) return;
    stoppingRef.current = true;
    try {
      const id = shareIdRef.current;
      shareIdRef.current = null;
      viewersRef.current = 0;
      stopCapture();
      setSharing(false);
      if (id) connectSocket().emit("screen:stop", { shareId: id });
    } finally {
      stoppingRef.current = false;
    }
  }

  function beginLoop(stream, shareId) {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    let timer = 0;
    let stopped = false;

    const tick = () => {
      if (stopped || viewersRef.current < 1 || !video.videoWidth || !ctx) return;
      const maxW = 720;
      const w = Math.max(2, Math.min(maxW, video.videoWidth)) & ~1;
      const h = Math.max(2, Math.round(video.videoHeight * (w / video.videoWidth))) & ~1;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const data = canvas.toDataURL("image/jpeg", 0.5);
      const comma = data.indexOf(",");
      if (comma < 0) return;
      connectSocket().emit("screen:frame", { shareId, frame: data.slice(comma + 1) });
    };

    video.play().catch(() => {});
    timer = window.setInterval(tick, 400);
    const track = stream.getVideoTracks()[0];
    const onEnded = () => stopShare();
    track?.addEventListener("ended", onEnded);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      track?.removeEventListener("ended", onEnded);
      stream.getTracks().forEach((item) => item.stop());
      video.srcObject = null;
    };
  }

  useEffect(() => {
    const socket = connectSocket();

    const onList = (payload) => {
      const next = Array.isArray(payload?.shares) ? payload.shares : [];
      setShares(next);
      const current = watchingRef.current;
      if (current && !next.some((item) => item.shareId === current.shareId && !item.self)) {
        watchingRef.current = null;
        setWatching(null);
      }
    };
    const onAvailable = (share) => {
      if (!share?.shareId) return;
      setShares((prev) => [...prev.filter((item) => item.shareId !== share.shareId), share]);
    };
    const onEnded = (payload) => {
      if (!payload?.shareId) return;
      setShares((prev) => prev.filter((item) => item.shareId !== payload.shareId));
      if (watchingRef.current?.shareId === payload.shareId) {
        watchingRef.current = null;
        setWatching(null);
      }
    };
    const onViewers = (payload) => {
      if (payload?.shareId && payload.shareId === shareIdRef.current) {
        viewersRef.current = payload.count || 0;
      }
    };
    const onConnect = () => {
      socket.emit("screen:sync");
      if (shareIdRef.current && captureRef.current) {
        socket.emit("screen:start", { shareId: shareIdRef.current });
      }
      if (watchingRef.current) {
        socket.emit("screen:watch", { shareId: watchingRef.current.shareId });
      }
    };

    socket.on("screen:list", onList);
    socket.on("screen:available", onAvailable);
    socket.on("screen:ended", onEnded);
    socket.on("screen:viewers", onViewers);
    socket.on("connect", onConnect);
    if (socket.connected) socket.emit("screen:sync");

    return () => {
      socket.off("screen:list", onList);
      socket.off("screen:available", onAvailable);
      socket.off("screen:ended", onEnded);
      socket.off("screen:viewers", onViewers);
      socket.off("connect", onConnect);
      const id = shareIdRef.current;
      shareIdRef.current = null;
      viewersRef.current = 0;
      const cleanup = captureRef.current;
      captureRef.current = null;
      cleanup?.();
      if (id) socket.emit("screen:stop", { shareId: id });
      const watchingId = watchingRef.current?.shareId;
      if (watchingId) socket.emit("screen:unwatch", { shareId: watchingId });
    };
  }, []);

  async function startShare() {
    if (shareIdRef.current || startingRef.current) return;
    startingRef.current = true;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      startingRef.current = false;
      setError("This browser can't share the screen.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
      });
      const shareId = createShareId();
      shareIdRef.current = shareId;
      viewersRef.current = 0;
      captureRef.current = beginLoop(stream, shareId);
      setSharing(true);
      connectSocket().emit("screen:start", { shareId });
    } catch (err) {
      shareIdRef.current = null;
      stopCapture();
      setSharing(false);
      if (err?.name !== "NotAllowedError") {
        setError("Couldn't start screen sharing.");
      }
    } finally {
      startingRef.current = false;
      setBusy(false);
    }
  }

  function watch(share) {
    if (!share || share.self) return;
    const prev = watchingRef.current;
    if (prev && prev.shareId !== share.shareId) {
      connectSocket().emit("screen:unwatch", { shareId: prev.shareId });
    }
    watchingRef.current = share;
    setWatching(share);
    connectSocket().emit("screen:watch", { shareId: share.shareId });
  }

  function closeWatch() {
    const current = watchingRef.current;
    watchingRef.current = null;
    setWatching(null);
    if (current) connectSocket().emit("screen:unwatch", { shareId: current.shareId });
  }

  return {
    shares,
    sharing,
    busy,
    error,
    watching,
    startShare,
    stopShare,
    watch,
    closeWatch,
  };
}

export function ScreenFrame({ shareId }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    const socket = connectSocket();
    const onFrame = (payload) => {
      if (payload?.shareId !== shareId || typeof payload.frame !== "string") return;
      setSrc(`data:image/jpeg;base64,${payload.frame}`);
    };
    socket.on("screen:frame", onFrame);
    return () => socket.off("screen:frame", onFrame);
  }, [shareId]);

  if (!src) {
    return <p style={frameStyles.wait}>Waiting for the shared screen…</p>;
  }
  return <img src={src} alt="Shared screen" style={frameStyles.image} />;
}

const frameStyles = {
  wait: { color: "var(--text-muted)", textAlign: "center", padding: 24, margin: 0 },
  image: {
    display: "block",
    width: "100%",
    height: 280,
    objectFit: "contain",
    background: "#000",
  },
};

export const screenShareStyles = {
  notice: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexShrink: 0,
    padding: "10px 12px",
    margin: "8px 12px 0",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    background: "var(--surface-raised)",
    fontSize: 14,
  },
  stage: {
    flexShrink: 0,
    margin: "8px 12px 0",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
    background: "#000",
  },
  stageBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 12px",
    background: "var(--surface)",
    fontSize: 14,
  },
};
