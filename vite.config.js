import { defineConfig } from 'vite';

// The browser client lives in client/ and builds to dist/ (served by Express in
// production). In development the Express server loads Vite in middleware mode,
// so there is a single process on one port.
export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
