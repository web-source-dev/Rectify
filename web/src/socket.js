import { io } from "socket.io-client";
import { api, getToken } from "./api.js";

let socket = null;

export function connectSocket() {
  if (socket) return socket;
  const token = getToken();
  socket = io(api.baseUrl, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
