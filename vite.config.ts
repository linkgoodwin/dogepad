import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { terser } from 'rollup-plugin-terser';

export default defineConfig({
  base: '/',
  server: {
    host: '127.0.0.1',
    fs: {
      allow: ['..'],
    },
  },
  build: {
    sourcemap: 'hidden',
    minify: false,
    rollupOptions: {
      external: ['@reown/appkit/core'],
      plugins: [terser()],
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths()
  ],
  publicDir: 'public',
})
