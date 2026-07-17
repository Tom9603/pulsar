import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import CodeInput from './CodeInput.jsx';

const CODE_LENGTH = 5;
const MIN_SPLASH = 2000; // le loader reste au moins ce temps : l'entrée dans l'app doit se sentir

/**
 * Étape de confirmation : l'utilisateur saisit le code à 5 chiffres reçu par
 * email. En cas de succès il est connecté directement, sans repasser par la
 * page de connexion.
 */
export default function VerifyCode({ email }) {
  const { verifyCode } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0); // secondes avant de pouvoir redemander un code

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(value) {
    const c = value || code;
    if (c.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError('');
    // L'écran de démarrage sert aussi de vérification : il couvre tout, donc
    // rien n'est cliquable pendant l'ouverture du compte.
    window.__showPulsarSplash?.();
    const startedAt = Date.now();
    try {
      await verifyCode(email, c);
      // Succès : le contexte connecte l'utilisateur, l'application prend le
      // relais derrière le loader, qu'on retire une fois la durée écoulée.
      const remaining = MIN_SPLASH - (Date.now() - startedAt);
      setTimeout(() => window.__hidePulsarSplash?.(), Math.max(remaining, 0));
    } catch (e) {
      window.__hidePulsarSplash?.();
      setError(e.message);
      setCode('');
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setError('');
    setNotice('');
    try {
      await api('/auth/resend', { method: 'POST', body: { email } });
      setNotice('Un nouveau code vient de partir.');
      setCode('');
      setCooldown(60);
    } catch (e) {
      setError(e.message);
      setCooldown(30);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <div className="auth-sent">
          <span className="auth-sent-ico"><Icon name="envelope-circle-check" /></span>
          <h1>Confirmez votre adresse</h1>
          <p className="subtitle">
            Nous avons envoyé un code à 5 chiffres à <strong>{email}</strong>.
            Ouvrez votre boîte mail et saisissez-le ici.
          </p>

          <CodeInput
            value={code}
            onChange={(v) => { setCode(v); setError(''); }}
            onComplete={submit}
            length={CODE_LENGTH}
            disabled={busy}
            invalid={!!error}
          />

          {error && <p className="auth-error"><Icon name="circle-exclamation" /> {error}</p>}
          {notice && !error && <p className="pw-match"><Icon name="circle-check" /> {notice}</p>}

          <button className="btn auth-verify-btn" disabled={code.length !== CODE_LENGTH || busy} onClick={() => submit()}>
            {busy ? 'Vérification…' : 'Confirmer'}
          </button>

          <p className="auth-switch">
            Rien reçu&nbsp;? Pensez aux indésirables.{' '}
            <button type="button" className="linklike" onClick={resend} disabled={cooldown > 0}>
              {cooldown > 0 ? `Renvoyer le code (${cooldown} s)` : 'Renvoyer le code'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
