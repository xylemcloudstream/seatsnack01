import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // When running `vite` for local frontend dev, proxy /api to `wrangler pages dev`
      // running the functions on port 8788 (see README).
      '/api': 'http://127.0.0.1:8788'
    }
  }
});
