import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  base: './',          // relative asset paths — works in any subfolder
  plugins: [glsl()],
});
