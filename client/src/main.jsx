import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css';
import { applyAppearance, loadAppearance } from './theme.js';

applyAppearance(); // couleurs, thème et taille choisis par l'utilisateur
// Suit le thème du système quand l'option « Système » est active.
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
  if (loadAppearance().theme === 'system') applyAppearance();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
);
