import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/3Dvisualiser/', // Set base path for GitHub Pages
  build: {
    outDir: 'dist' // Ensure output directory is 'dist'
  }
}); 