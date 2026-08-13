import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local dev only, per the spec -- no Docker/deploy config here.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
