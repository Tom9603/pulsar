import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import AppLayout from './pages/AppLayout.jsx';
import UpdateManager from './components/UpdateManager.jsx';
import { startUpdateWatch } from './update.js';

export default function App() {
  const { user, loading } = useAuth();

  // Surveille les mises à jour dès l'ouverture (web et desktop).
  useEffect(() => { startUpdateWatch(); }, []);

  // Retire le loader plein écran une fois l'authentification résolue.
  useEffect(() => { if (!loading) window.__hidePulsarSplash?.(); }, [loading]);

  // Pendant le chargement initial, le splash HTML reste affiché.
  if (loading) return null;

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
        <Route path="/*" element={user ? <AppLayout /> : <Navigate to="/login" replace />} />
      </Routes>
      <UpdateManager />
    </>
  );
}
