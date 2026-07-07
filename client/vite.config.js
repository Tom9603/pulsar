import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Le front (5173) appelle le back (3001) via un proxy : les URLs restent relatives (/api, /socket.io).
const PROXY = process.env.PULSAR_PROXY || process.env.CONCORD_PROXY || 'http://localhost:3001';

// Version applicative (racine du dépôt) figée dans le build pour détecter les mises à jour.
let APP_VERSION = '0.0.0';
try {
  APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || APP_VERSION;
} catch { /* repli défensif */ }

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  // Chemins d'assets relatifs : nécessaire pour charger l'app depuis un fichier (Electron).
  base: './',
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': PROXY,
      '/socket.io': { target: PROXY, ws: true },
    },
  },
});
