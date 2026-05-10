import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],
  server: {
    proxy: {
      '/api': process.env.API_URL || 'http://localhost:8000',
    },
  },
});
