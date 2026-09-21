import { useState } from "react";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { clearSession, getStoredUser, getToken } from "./api.js";
import { disconnectSocket } from "./socket.js";

export default function App() {
  const [me, setMe] = useState(() => (getToken() ? getStoredUser() : null));

  function handleLogout() {
    disconnectSocket();
    clearSession();
    setMe(null);
  }

  if (!me) {
    return <Login onLoggedIn={setMe} />;
  }

  return <Dashboard me={me} onLogout={handleLogout} />;
}
