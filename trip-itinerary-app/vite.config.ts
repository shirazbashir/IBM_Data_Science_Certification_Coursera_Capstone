import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  server: {
    // During `npm run dev`, forward API calls to `wrangler dev` (port 8787).
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: { target: 'es2022', sourcemap: true },
});
