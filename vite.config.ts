import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    publicDir: false,
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target:
            env.API_PROXY_TARGET || `http://127.0.0.1:${process.env.PORT || env.PORT || 3000}`,
          changeOrigin: true,
        },
      },
    },
    build: { outDir: 'dist', sourcemap: false },
  };
});
