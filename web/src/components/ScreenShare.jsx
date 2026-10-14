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
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    let raf = 0;
    let stopped = false;
    let encoding = false;
    let last = 0;
    const minGap = 1000 / 30;

    const tick = (now) => {
      if (stopped) return;
      raf = window.requestAnimationFrame(tick);
      if (encoding || viewersRef.current < 1 || !video.videoWidth || !ctx) return;
      if (now - last < minGap) return;
      last = now;
      const maxW = 1280;
      const w = Math.max(2, Math.min(maxW, video.videoWidth)) & ~1;
      const h = Math.max(2, Math.round(video.videoHeight * (w / video.videoWidth))) & ~1;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      encoding = true;
      canvas.toBlob((blob) => {
        if (!blob || stopped || viewersRef.current < 1) {
          encoding = false;
          return;
        }
        blobToBase64(blob)
          .then((frame) => {
            if (!frame || stopped || viewersRef.current < 1) return;
            connectSocket().volatile.compress(false).emit("screen:frame", { shareId, frame });
          })
          .finally(() => {
            encoding = false;
          });
      }, "image/jpeg", 0.55);
    };

    video.play().catch(() => {});
    raf = window.requestAnimationFrame(tick);
    const track = stream.getVideoTracks()[0];
    const onEnded = () => stopShare();
    track?.addEventListener("ended", onEnded);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
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
        video: { frameRate: { ideal: 30, max: 30 } },
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

function blobToBase64(blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const size = 0x8000;
    for (let i = 0; i < bytes.length; i += size) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + size));
    }
    return btoa(binary);
  });
}

function base64ToBlob(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

// Paints the newest JPEG only. A slow decode drops the frames in between
// instead of playing them late, which keeps the picture close to live.
export function ScreenStage({ shareId, fill = false }) {
  const imgRef = useRef(null);
  const fpsRef = useRef(null);
  const stallRef = useRef(null);
  const waitRef = useRef(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return undefined;
    const socket = connectSocket();
    let stopped = false;
    let busy = false;
    let pending = "";
    let currentUrl = "";
    let shown = 0;
    let windowStart = performance.now();
    let lastFrameAt = 0;

    const paint = (frame) => {
      busy = true;
      let url = "";
      try {
        url = URL.createObjectURL(base64ToBlob(frame));
      } catch {
        busy = false;
        return;
      }
      const finish = (ok) => {
        if (!ok || stopped) {
          URL.revokeObjectURL(url);
        } else {
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl = url;
          lastFrameAt = performance.now();
          shown += 1;
          const now = lastFrameAt;
          if (now - windowStart >= 1000) {
            const fps = Math.round((shown * 1000) / (now - windowStart));
            if (fpsRef.current) fpsRef.current.textContent = `${fps} fps`;
            shown = 0;
            windowStart = now;
          }
          if (waitRef.current) waitRef.current.hidden = true;
        }
        busy = false;
        if (pending) {
          const next = pending;
          pending = "";
          paint(next);
        }
      };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.src = url;
    };

    const onFrame = (payload) => {
      if (stopped || payload?.shareId !== shareId || typeof payload.frame !== "string") return;
      pending = payload.frame;
      if (!busy) {
        const next = pending;
        pending = "";
        paint(next);
      }
    };

    const stallTimer = window.setInterval(() => {
      const stalled = lastFrameAt > 0 && performance.now() - lastFrameAt > 1500;
      stallRef.current?.classList.toggle("is-on", stalled);
    }, 400);

    socket.on("screen:frame", onFrame);
    return () => {
      stopped = true;
      window.clearInterval(stallTimer);
      socket.off("screen:frame", onFrame);
      img.onload = null;
      img.onerror = null;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [shareId]);

  return (
    <div className={fill ? "live-picture is-fill" : "live-picture"}>
      <img ref={imgRef} alt="Live screen" />
      <span ref={fpsRef} className="live-fps">
        — fps
      </span>
      <p ref={stallRef} className="live-stall">
        Picture paused — waiting for the next frame
      </p>
      <p ref={waitRef} className="live-wait">
        Waiting for the live picture…
      </p>
    </div>
  );
}
