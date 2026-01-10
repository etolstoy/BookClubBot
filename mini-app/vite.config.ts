import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true, // Listen on all addresses including network
    allowedHosts: [
      ".ngrok-free.app", // Allow all ngrok hosts
      ".ngrok.io",       // Allow legacy ngrok hosts
      "localhost",       // Allow localhost
    ],
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
