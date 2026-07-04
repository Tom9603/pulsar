import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { IS_DESKTOP, getServerUrl, setServerUrl } from '../config.js';
import Logo from '../components/Logo.jsx';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(getServerUrl() || 'http://localhost:3001');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (IS_DESKTOP) setServerUrl(server); // mémorise l'adresse du serveur choisie
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo />
        <h1>Content de te revoir&nbsp;!</h1>
        <p className="subtitle">Connecte-toi pour rejoindre tes serveurs.</p>

        {error && <div className="error-msg">{error}</div>}

        {IS_DESKTOP && (
          <div className="field">
            <label>Adresse du serveur</label>
            <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="http://192.168.1.20:3001" />
          </div>
        )}

        <div className="field">
          <label>Nom d’utilisateur</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button className="btn" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        <p className="auth-switch">
          Pas encore de compte&nbsp;? <Link to="/register">S’inscrire</Link>
        </p>
      </form>
    </div>
  );
}
