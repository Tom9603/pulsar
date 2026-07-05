import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Le front (5173) appelle le back (3001) via un proxy : les URLs restent relatives (/api, /socket.io).
const PROXY = process.env.PULSAR_PROXY || process.env.CONCORD_PROXY || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
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
