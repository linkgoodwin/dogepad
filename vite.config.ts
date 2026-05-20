import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  base: '/dogepad/',
  server: {
    host: '127.0.0.1',
    fs: {
      allow: ['..'],
    },
  },
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      external: ['@reown/appkit/core'],
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
