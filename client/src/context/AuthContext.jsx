import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken } from '../api.js';
import { connectSocket, disconnectSocket } from '../socket.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Reprise de session si un jeton est déjà stocké
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api('/auth/me')
      .then(({ user }) => {
        setUser(user);
        connectSocket();
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(token);
    setUser(user);
    connectSocket();
  }

  async function register(username, password, display_name, email, tos_version) {
    const res = await api('/auth/register', {
      method: 'POST',
      body: { username, password, display_name, email, tos_version },
    });
    if (res.pending) return { pending: true, email: res.email }; // code de confirmation requis
    setToken(res.token);
    setUser(res.user);
    connectSocket();
    return { pending: false };
  }

  /** Confirme le compte avec le code reçu par email, puis connecte directement. */
  async function verifyCode(email, code) {
    const { token, user } = await api('/auth/verify-code', { method: 'POST', body: { email, code } });
    setToken(token);
    setUser(user);
    connectSocket();
  }

  function logout() {
    // Ferme la session côté serveur (au mieux) pour retirer l'appareil de la liste.
    api('/sessions/current', { method: 'DELETE' }).catch(() => {});
    setToken(null);
    setUser(null);
    disconnectSocket();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verifyCode, logout, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
