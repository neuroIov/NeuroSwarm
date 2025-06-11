import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [
      "3ec5-106-219-154-30.ngrok-free.app",
      "*.ngrok-free.app"
    ],
  },
  plugins: [
    react()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    mainFields: ['browser', 'module', 'main']
  },
  define: {
    'process.env': {},
    'global': {}
  },
  optimizeDeps: {
    include: ['@solana/web3.js', 'rpc-websockets']
  }
}));
