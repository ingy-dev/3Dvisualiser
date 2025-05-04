import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/3Dvisualiser/', // Set base path for GitHub Pages
  build: {
    outDir: 'docs' // CHANGE: Ensure output directory is 'docs' for GitHub Pages
  }
}); 