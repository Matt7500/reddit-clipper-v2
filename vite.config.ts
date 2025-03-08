import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://192.168.4.37:3003',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path
      },
      '/audio': {
        target: 'http://192.168.4.37:3003',
        changeOrigin: true,
        secure: false,
      },
      '/images': {
        target: 'http://192.168.4.37:3003',
        changeOrigin: true,
        secure: false,
      },
      '/videos': {
        target: 'http://192.168.4.37:3003',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
