import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { IS_DESKTOP, getServerUrl, setServerUrl } from '../config.js';
import { api } from '../api.js';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import VerifyCode from '../components/VerifyCode.jsx';

export default function Login() {
  const { login } = useAuth();
  const [params] = useSearchParams();
  const justVerified = params.get('verified') === '1';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(getServerUrl() || 'http://localhost:3001');
  const [remember, setRemember] = useState(true); // par défaut, on reste connecté
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(null); // email du compte restant à confirmer
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (IS_DESKTOP) setServerUrl(server); // mémorise l'adresse du serveur choisie
    setBusy(true);
    try {
      await login(username, password, remember);
    } catch (err) {
      // Compte jamais confirmé : on renvoie un code et on bascule sur la saisie.
      if (err.data?.needsVerification && err.data.email) {
        api('/auth/resend', { method: 'POST', body: { email: err.data.email } }).catch(() => {});
        setVerifying(err.data.email);
        return;
      }
      setError(err.message);
      setBusy(false);
    }
  }

  if (verifying) return <VerifyCode email={verifying} />;

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo />
        <h1>Content de vous revoir&nbsp;!</h1>
        <p className="subtitle">Connectez-vous pour accéder à vos espaces.</p>

        {justVerified && <div className="ok-msg"><Icon name="circle-check" /> Compte confirmé. Vous pouvez vous connecter.</div>}
        {error && <div className="error-msg">{error}</div>}

        {IS_DESKTOP && (
          <div className="field">
            <label>Adresse du serveur</label>
            <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="http://192.168.1.20:3001" />
          </div>
        )}

        <div className="field">
          <label>Adresse email</label>
          <input type="email" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="email" placeholder="vous@exemple.com" />
        </div>
        <div className="field">
          <div className="field-head">
            <label>Mot de passe</label>
            <Link className="field-link" to="/forgot">Mot de passe oublié&nbsp;?</Link>
          </div>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>

        <label className="remember-me">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Se souvenir de moi sur cet appareil</span>
        </label>

        <button className="btn" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        <p className="auth-switch">
          Pas encore de compte&nbsp;? <Link to="/register">S’inscrire</Link>
        </p>
      </form>
    </div>
  );
}
