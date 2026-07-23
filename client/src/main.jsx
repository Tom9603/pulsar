import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css';
import { applyAppearance, loadAppearance } from './theme.js';
import { startRangePainting } from './range.js';

applyAppearance(); // couleurs, thème et taille choisis par l'utilisateur
startRangePainting(); // remplissage des curseurs (volumes, tailles…)
// Suit le thème du système quand l'option « Système » est active.
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
  if (loadAppearance().theme === 'system') applyAppearance();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
);
