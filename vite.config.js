import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = process.env.PORT || 3000;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
    },
  },
});
