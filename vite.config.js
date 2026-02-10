import { defineConfig } from 'vite';

export default defineConfig({
  base: '/tracker/',
  root: 'src',
  envDir: '../',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './src/index.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
