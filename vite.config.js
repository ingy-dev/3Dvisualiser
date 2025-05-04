import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/3Dvisualiser/', // Set base path for GitHub Pages deployment
  build: {
    outDir: 'docs', // Set the output directory to 'docs'
    emptyOutDir: true // Clean the output directory before building
  }
});