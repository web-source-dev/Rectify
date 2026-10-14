import { useEffect, useState } from "react";
import { connectSocket } from "./socket.js";

let audioCtx = null;

export function primePresenceSound() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
}

export function playOnlineChime() {
  primePresenceSound();
  if (!audioCtx) return;
  const ctx = audioCtx;
  const master = ctx.createGain();
  master.gain.value = 0.95;
  master.connect(ctx.destination);

  const start = ctx.currentTime + 0.02;
  const notes = [523.25, 784];
  // Five hits, one each second, so the alert lasts about five seconds.
  for (let hit = 0; hit < 5; hit += 1) {
    notes.forEach((freq, index) => {
      const at = start + hit + index * 0.32;
      const tone = ctx.createOscillator();
      const body = ctx.createOscillator();
      const gain = ctx.createGain();
      const bodyGain = ctx.createGain();
      tone.type = "triangle";
      body.type = "square";
      tone.frequency.value = freq;
      body.frequency.value = freq / 2;
      bodyGain.gain.value = 0.28;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.9, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.4, at + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.62);
      tone.connect(gain);
      body.connect(bodyGain);
      bodyGain.connect(gain);
      gain.connect(master);
      tone.start(at);
      body.start(at);
      tone.stop(at + 0.64);
      body.stop(at + 0.64);
    });
  }
}

export function usePresence(meId) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const socket = connectSocket();
    const known = new Set();
    let ready = false;

    const onList = (payload) => {
      const next = Array.isArray(payload?.users) ? payload.users.filter((user) => user?.userId) : [];
      known.clear();
      for (const user of next) known.add(user.userId);
      ready = true;
      setUsers(next);
    };

    const onUpdate = (user) => {
      if (!ready || !user?.userId) return;
      if (user.online) {
        const isNew = !known.has(user.userId);
        known.add(user.userId);
        setUsers((prev) => {
          const rest = prev.filter((item) => item.userId !== user.userId);
          return [...rest, { userId: user.userId, name: user.name || null, online: true }];
        });
        if (isNew && user.userId !== meId) playOnlineChime();
      } else {
        known.delete(user.userId);
        setUsers((prev) => prev.filter((item) => item.userId !== user.userId));
      }
    };

    const ask = () => socket.emit("presence:sync");
    socket.on("presence:list", onList);
    socket.on("presence:update", onUpdate);
    socket.on("connect", ask);
    if (socket.connected) ask();

    return () => {
      socket.off("presence:list", onList);
      socket.off("presence:update", onUpdate);
      socket.off("connect", ask);
    };
  }, [meId]);

  return users;
}
