import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../components/Logo.jsx';

export default function Register() {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(username, password, displayName);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo />
        <h1>Créer un compte</h1>
        <p className="subtitle">Rejoins Pulsar en quelques secondes.</p>

        {error && <div className="error-msg">{error}</div>}

        <div className="field">
          <label>Nom d’utilisateur</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Nom affiché <span style={{ textTransform: 'none', color: 'var(--text-faint)' }}>(optionnel)</span></label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ton pseudo visible" />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button className="btn" disabled={busy}>{busy ? 'Création…' : 'S’inscrire'}</button>
        <p className="auth-switch">
          Déjà un compte&nbsp;? <Link to="/login">Se connecter</Link>
        </p>
      </form>
    </div>
  );
}
